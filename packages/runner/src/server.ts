import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { startOtel, createLogger, createVfs } from './compat';
import { RunnerAgent, RunRequestSchema } from './agent';

startOtel('runner');
export const app = express();
app.use(express.json({ limit: '2mb' }));
const logger = createLogger('runner');

app.get('/healthz', async (_req, res) => {
  const checks: Record<string, boolean> = {
    vfs: false,
    e2bKey: false
  };

  try {
    const vfs = await createVfs('healthz', { prefixSuffix: 'runner' });
    await vfs.listFiles();
    checks.vfs = true;
  } catch (err) {
    const error = err as Error;
    logger.error({ err: error.message }, 'runner vfs health check failed');
  }

  if (process.env.E2B_API_KEY) {
    checks.e2bKey = true;
  } else {
    logger.error('runner missing E2B_API_KEY');
  }

  const ok = Object.values(checks).every(Boolean);
  if (!ok) return res.status(503).json({ ok: false, checks });
  return res.json({ ok: true, checks });
});

app.post('/run', async (req: Request, res: Response) => {
  const parse = RunRequestSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'invalid request', details: parse.error.issues });
  const agent = new RunnerAgent(logger);
  const result = await agent.run(parse.data);
  // Functional failures (tests failed, no code, etc.) return HTTP 200 with ok:false
  if (!result.ok) {
    const { ok: _ignored, ...rest } = result as { ok: boolean; [k: string]: unknown };
    return res.status(200).json({ ok: false, execId: parse.data.execId, reason: inferReason(result), ...rest });
  }
  res.status(200).json(result);
});

const port = Number(process.env.RUNNER_PORT || 7040);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => logger.info({ port }, 'runner listening'));
}

function inferReason(r: { error?: string }): string {
  const msg = String(r.error || '').toLowerCase();
  if (msg.includes('no code')) return 'no_code_files';
  if (msg.includes('coverage')) return 'coverage_missing';
  if (msg.includes('command failed')) return 'tests_failed';
  return 'unknown';
}
