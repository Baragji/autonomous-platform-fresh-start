import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { startOtel } from '@autonomous/shared/src/otel';
import { createLogger } from '@autonomous/shared/src/logger';
import { RunnerAgent, RunRequestSchema } from './agent';

startOtel('runner');
export const app = express();
app.use(express.json({ limit: '2mb' }));
const logger = createLogger('runner');

app.get('/healthz', (_req, res) => res.json({ ok: true }));

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
  app.listen(port, () => process.stdout.write(`[runner] listening on :${port}\n`));
}
