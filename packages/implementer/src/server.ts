import express, { type Request, type Response } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';
import { createLogger, createHttpLogger } from '@autonomous/shared/src/logger';
import { env } from '@autonomous/shared/src/env';
import { createVfs } from '@autonomous/shared/src/vfs';
import { PlanSchema } from '@autonomous/shared/src/plan';
import { startOtel } from '@autonomous/shared/src/otel';
import { getLangfuse } from '@autonomous/shared/src/langfuse';
import { RedisEventPublisher } from './publisher';
import { ImplementerAgent } from './agent';
import { registerShutdown } from '@autonomous/shared/src/shutdown';
import { redisPub, redisSub } from '@autonomous/shared/src/events';

startOtel('implementer');

export const app = express();
const logger = createLogger('implementer');
app.use(createHttpLogger(logger));
app.use(express.json({ limit: '2mb' }));

const RequestSchema = z.object({
  execId: z.string().min(1),
  plan: PlanSchema
});

app.post('/implement', async (req: Request, res: Response) => {
  const parseResult = RequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'invalid request', details: parseResult.error.issues });
  }
  const { execId, plan } = parseResult.data;
  try {
    const [vfs, langfuse] = await Promise.all([
      createVfs(execId),
      Promise.resolve(getLangfuse())
    ]);

    // Advisory: read validator report if present and attach to plan metadata
    let advisoryPlan = plan;
    try {
      const prefix = String(process.env.VALIDATOR_ARTIFACT_PREFIX || 'validator').replace(/\/+$/,'');
      const reportPath = `${prefix}/validation-report.json`;
      const buf = await vfs.readFile(reportPath);
      const reportJson = JSON.parse(buf.toString('utf8')) as unknown;
      // Non-invasive: embed under _validator_advisory for the agent prompt construction
      advisoryPlan = { ...plan, _validator_advisory: reportJson } as unknown as typeof plan;
    } catch {}

    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const publisher = new RedisEventPublisher(execId);
    const agent = new ImplementerAgent({
      client,
      logger,
      model: process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06',
      publisher,
      vfs,
      langfuse
    });
    const result = await agent.run({ execId, plan: advisoryPlan });
    res.json(result);
  } catch (err) {
    const e = err as Error;
    logger.warn({ execId, err: e.message }, 'implementer encountered error; attempting partial handoff');
    try {
      const vfs = await createVfs(execId);
      const files = (await vfs.listFiles()).filter((f) => f.path.startsWith('code/')).map((f) => f.path);
      if (files.length > 0) {
        // Return ok:true to allow pipeline to proceed to runner/validator
        return res.json({ ok: true, files });
      }
    } catch {}
    logger.error({ execId, err: e.message }, 'implementer run failed (no artifacts to hand off)');
    res.status(500).json({ error: e.message });
  }
});

app.get('/healthz', async (_req, res) => {
  const checks: Record<string, boolean> = {
    minio: false,
    openaiKey: false
  };

  try {
    const vfs = await createVfs('healthz', { prefixSuffix: 'implementer' });
    await vfs.listFiles();
    checks.minio = true;
  } catch (err) {
    const error = err as Error;
    logger.error({ err: error.message }, 'implementer vfs health check failed');
  }

  if (env.OPENAI_API_KEY) {
    checks.openaiKey = true;
  } else {
    logger.error('implementer missing OPENAI_API_KEY');
  }

  const ok = Object.values(checks).every(Boolean);
  if (!ok) return res.status(503).json({ ok: false, checks });
  return res.json({ ok: true, checks });
});

const port = Number(process.env.IMPLEMENTER_PORT || 7030);
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => logger.info({ port }, 'implementer listening'));
  registerShutdown({ server, redisClients: [redisPub, redisSub], logger });
}
