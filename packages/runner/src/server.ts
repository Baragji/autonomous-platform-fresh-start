import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { startOtel, createLogger, createVfs } from './compat';
import { RunnerAgent, RunRequestSchema } from './agent';
import { registerShutdown } from '@autonomous/shared/src/shutdown';
import { createHttpLogger } from '@autonomous/shared/src/logger';

function logStartupError(message: string, e: unknown) {
  const errMsg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  process.stderr.write(`${message} ${errMsg}\n`);
}

// Initialize async services on startup
let logger: { info: (...args: unknown[]) => unknown; error: (...args: unknown[]) => unknown } = { info: () => {}, error: () => {} };
(async () => {
  try {
    await startOtel('runner');
  } catch (e) {
    logStartupError('Failed to start OTel:', e);
  }
  try {
    // createLogger may return a logger shaped with generic Function types; cast to the explicit signature
    logger = (await createLogger('runner')) as unknown as { info: (...args: unknown[]) => unknown; error: (...args: unknown[]) => unknown };
  } catch (e) {
    logStartupError('Failed to create logger:', e);
  }
})();

export const app = express();
// Use a wrapper so the middleware uses the latest logger reference when requests arrive
app.use((req, res, next) => createHttpLogger(logger as any)(req, res, next));
app.use(express.json({ limit: '2mb' }));

app.get('/healthz', async (_req, res) => {
  const checks: Record<string, boolean> = {
    vfs: false,
    e2bKey: false
  };

  try {
    const vfs = (await createVfs('healthz', { prefixSuffix: 'runner' })) as unknown as { listFiles: () => Promise<unknown> };
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
  if (!result.ok) return res.status(500).json(result);
  res.json(result);
});

const port = Number(process.env.RUNNER_PORT || 7040);
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => logger.info({ port }, 'runner listening'));

  registerShutdown({ server, logger });
}
