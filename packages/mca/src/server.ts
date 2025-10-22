import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { upsertExecution } from '@autonomous/shared/src/db';
import { publish } from '@autonomous/shared/src/events';
import { startOtel } from '@autonomous/shared/src/otel';
import { createLogger } from '@autonomous/shared/src/logger';
import { env } from '@autonomous/shared/src/env';
import { StateGraph, START, END } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool } from 'pg';

startOtel('mca');
export const app = express();
app.use(express.json());
const logger = createLogger('mca');

type McaState = {
  execId: string;
  intent: string;
  status?: string;
  current_agent?: string;
};

const pool = new Pool({ connectionString: env.DATABASE_URL });
// PostgresSaver expects a pg-compatible pool; cast through unknown to satisfy typings without using any
const checkpointer = new PostgresSaver(pool as unknown as Pool);
// Verify checkpointer setup (skip in tests to avoid exiting test runner)
if (process.env.NODE_ENV !== 'test') {
  try {
    // Some versions expose an async setup() to prepare tables; if missing, calling will throw
    // Intentionally call without optional chaining to surface runtime errors clearly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (checkpointer as any).setup().catch((err: Error) => {
      logger.error({ err: err.message }, 'PostgresSaver setup failed');
      process.exit(1);
    });
  } catch (err) {
    const e = err as Error;
    logger.error({ err: e.message }, 'PostgresSaver setup threw');
    // proceed; graph.invoke will likely surface a clearer error
  }
}

async function supervisor(state: McaState): Promise<McaState> {
  // Deterministic routing to planner for Week 2 scope (LLM supervisor can be enabled later)
  return { ...state, current_agent: 'planner' };
}

async function plannerNode(state: McaState): Promise<McaState> {
  const plannerUrl = process.env.PLANNER_URL || 'http://localhost:7020/plan';
  await publish(state.execId, 'agent', { agent: 'planner', status: 'working' });
  const r = await fetch(plannerUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ execId: state.execId, intent: state.intent })
  });
  const j = (await r.json()) as { object?: string; error?: string };
  if (!r.ok) throw new Error(j.error || 'planner failed');
  await upsertExecution(state.execId, 'planned', state.intent, 'planner');
  await publish(state.execId, 'artifact', { type: 'plan', object: j.object });
  await publish(state.execId, 'status', { status: 'planned' });
  return { ...state, status: 'planned' };
}

const graph = new StateGraph<McaState>({
  // Keep channels mapping for forward compatibility, but run planner as first node
  channels: {
    execId: { value: (_prev: string | undefined, curr: string) => curr },
    intent: { value: (_prev: string | undefined, curr: string) => curr },
    status: { value: (_prev: string | undefined, curr: string | undefined) => curr as string },
    current_agent: { value: (_prev: string | undefined, curr: string | undefined) => curr as string }
  }
})
  .addNode('planner', plannerNode)
  .addEdge(START, 'planner')
  .addEdge('planner', END)
  .compile({ checkpointer });

app.post('/start', async (req: Request, res: Response) => {
  const { execId, intent } = req.body || {};
  if (!execId || !intent) return res.status(400).json({ error: 'execId and intent required' });
  res.json({ ok: true });

  await upsertExecution(execId, 'planning', intent, 'mca');
  await publish(execId, 'status', { status: 'planning' });
  try {
    const opts: Record<string, unknown> = { configurable: { thread_id: execId } } as unknown as Record<string, unknown>;
    logger.info({ execId, intent }, 'invoking graph');
    await (graph as unknown as { invoke: (st: McaState, o?: Record<string, unknown>) => Promise<unknown> }).invoke({ execId, intent }, opts);
    logger.info({ execId }, 'graph invoke completed');
  } catch (e) {
    const err = e as Error;
    // Log full error for immediate diagnosis
    logger.error({ execId, err: err.message, stack: err.stack }, 'Graph invoke failed');
    await upsertExecution(execId, 'failed', intent, 'mca');
    await publish(execId, 'error', { message: err.message, stack: err.stack });
  }
});

const port = Number(process.env.MCA_PORT || 7010);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => process.stdout.write(`[mca] listening on :${port}\n`));
}
