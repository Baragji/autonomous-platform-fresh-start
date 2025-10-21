import express, { type Request, type Response } from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { upsertExecution } from '@autonomous/shared/src/db';
import { publish } from '@autonomous/shared/src/events';
import { startOtel } from '@autonomous/shared/src/otel';
import { env } from '@autonomous/shared/src/env';
import { StateGraph, START, END } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool } from 'pg';

startOtel('mca');
export const app = express();
app.use(express.json());

type McaState = {
  execId: string;
  intent: string;
  status?: string;
  current_agent?: string;
};

const pool = new Pool({ connectionString: env.DATABASE_URL });
// PostgresSaver expects a pg-compatible pool; cast through unknown to satisfy typings without using any
const checkpointer = new PostgresSaver(pool as unknown as Pool);

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

const graph = new StateGraph<McaState>({ channels: {} })
  .addNode('supervisor', supervisor)
  .addNode('planner', plannerNode)
  .addEdge(START, 'supervisor')
  .addConditionalEdges('supervisor', (s: McaState) => (s.current_agent === 'planner' ? 'planner' : END))
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
    await (graph as unknown as { invoke: (st: McaState, o?: Record<string, unknown>) => Promise<unknown> }).invoke({ execId, intent }, opts);
  } catch (e) {
    const err = e as Error;
    await upsertExecution(execId, 'failed', intent, 'mca');
    await publish(execId, 'error', { message: err.message });
  }
});

const port = Number(process.env.MCA_PORT || 7010);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => process.stdout.write(`[mca] listening on :${port}\n`));
}
