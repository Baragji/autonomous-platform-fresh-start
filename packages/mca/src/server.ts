import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { upsertExecution } from '@autonomous/shared/src/db';
import { publish } from '@autonomous/shared/src/events';
import { startOtel } from '@autonomous/shared/src/otel';
import { createLogger } from '@autonomous/shared/src/logger';
import { env } from '@autonomous/shared/src/env';
import { PlanSchema, type Plan } from '@autonomous/shared/src/plan';
import { minio, ARTIFACT_BUCKET } from '@autonomous/shared/src/minioClient';
import { StateGraph, START, END } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool } from 'pg';

startOtel('mca');
export const app = express();
app.use(express.json());
const logger = createLogger('mca');

app.get('/healthz', (_req, res) => res.json({ ok: true }));

type McaState = {
  execId: string;
  intent: string;
  status?: string;
  current_agent?: string;
  plan?: Plan;
  failure_count?: number;
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
  if (!j.object) throw new Error('planner did not return plan object');
  const plan = await readPlanFromMinio(j.object);
  await upsertExecution(state.execId, 'planned', state.intent, 'planner');
  await publish(state.execId, 'artifact', { type: 'plan', object: j.object });
  await publish(state.execId, 'status', { status: 'planned' });
  return { ...state, status: 'planned', plan, current_agent: 'planner' };
}

async function implementerNode(state: McaState): Promise<McaState> {
  if (!state.plan) throw new Error('plan missing from state');
  const implementerUrl = process.env.IMPLEMENTER_URL || 'http://localhost:7030/implement';
  await publish(state.execId, 'agent', { agent: 'implementer', status: 'working' });
  await upsertExecution(state.execId, 'implementing', state.intent, 'implementer');
  await publish(state.execId, 'status', { status: 'implementing' });
  const response = await fetch(implementerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ execId: state.execId, plan: state.plan })
  });
  const payload = (await response.json()) as { ok?: boolean; files?: string[]; error?: string };
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || 'implementer failed');
  }
  await upsertExecution(state.execId, 'implemented', state.intent, 'implementer');
  await publish(state.execId, 'status', { status: 'implemented' });
  await publish(state.execId, 'artifact', { type: 'code', files: payload.files ?? [] });
  return { ...state, status: 'implemented', current_agent: 'implementer' };
}

async function runnerNode(state: McaState): Promise<McaState> {
  const runnerUrl = process.env.RUNNER_URL || 'http://localhost:7040/run';
  await publish(state.execId, 'agent', { agent: 'runner', status: 'working' });
  const response = await fetch(runnerUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ execId: state.execId })
  });
  const payload = (await response.json()) as { ok?: boolean; junitObject?: string; coverageObject?: string; error?: string };
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || 'runner failed');
  }
  await upsertExecution(state.execId, 'tested', state.intent, 'runner');
  await publish(state.execId, 'status', { status: 'tested' });
  await publish(state.execId, 'artifact', { type: 'test_results', junit: payload.junitObject, coverage: payload.coverageObject });
  return { ...state, status: 'tested', current_agent: 'runner' };
}

async function validatorNode(state: McaState): Promise<McaState> {
  const validatorUrl = process.env.VALIDATOR_URL || 'http://localhost:7050/validate';
  await publish(state.execId, 'agent', { agent: 'validator', status: 'working' });
  const response = await fetch(validatorUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ execId: state.execId })
  });
  const payload = (await response.json()) as { ok?: boolean; verdict?: 'PASS'|'FAIL'; report?: string; junitObject?: string; coverageObject?: string; error?: string };
  if (!response.ok || payload.ok !== true || !payload.verdict) {
    throw new Error(payload.error || 'validator failed');
  }
  const verdict = payload.verdict;
  await publish(state.execId, 'artifact', { type: 'validation', report: payload.report, junit: payload.junitObject, coverage: payload.coverageObject });
  await upsertExecution(state.execId, verdict === 'PASS' ? 'validated' : 'needs_remediation', state.intent, 'validator');
  await publish(state.execId, 'status', { status: verdict === 'PASS' ? 'validated' : 'needs_remediation' });
  const failure_count = verdict === 'FAIL' ? (state.failure_count ?? 0) + 1 : (state.failure_count ?? 0);
  if (failure_count >= 3 && verdict === 'FAIL') {
    await publish(state.execId, 'escalated', { failure_count });
  }
  return { ...state, current_agent: 'validator', status: verdict === 'PASS' ? 'validated' : 'needs_remediation', failure_count };
}

const graphBuilder = new StateGraph<McaState>({
  // Keep channels mapping for forward compatibility, but run planner as first node
  channels: {
    execId: { value: (_prev: string | undefined, curr: string) => curr },
    intent: { value: (_prev: string | undefined, curr: string) => curr },
    status: { value: (_prev: string | undefined, curr: string | undefined) => curr as string },
    current_agent: { value: (_prev: string | undefined, curr: string | undefined) => curr as string },
    // Persist the validated plan between nodes so implementer can consume it
    plan: { value: (_prev: Plan | undefined, curr: Plan | undefined) => curr as Plan }
  }
})
  .addNode('planner', plannerNode)
  .addEdge(START, 'planner');

// For Week 2 smoke, allow planner-only mode to avoid failing when implementer is not running
const plannerOnly = String(process.env.WEEK2_PLANNER_ONLY || '').toLowerCase() === '1' || String(process.env.WEEK2_PLANNER_ONLY || '').toLowerCase() === 'true';

if (plannerOnly) {
  graphBuilder.addEdge('planner', END);
} else {
  graphBuilder
    .addNode('implementer', implementerNode)
    .addNode('runner', runnerNode)
    .addNode('validator', validatorNode)
    .addEdge('planner', 'implementer')
    .addEdge('implementer', 'runner')
    .addEdge('runner', 'validator')
    .addConditionalEdges('validator', (state: McaState) => {
      if (state.status === 'validated') return END;
      if ((state.failure_count ?? 0) >= 3) {
        // escalate and still go to implementer for another attempt if policy allows
        state.status = 'escalated';
        publish(state.execId, 'status', { status: 'escalated' }).catch(() => {});
      }
      return 'implementer';
    });
}

const graph = graphBuilder.compile({ checkpointer });

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

async function readPlanFromMinio(objectName: string): Promise<Plan> {
  const stream = await minio.getObject(ARTIFACT_BUCKET, objectName);
  const buf = await streamToBuffer(stream);
  const parsed = JSON.parse(buf.toString('utf8')) as unknown;
  return PlanSchema.parse(parsed);
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
