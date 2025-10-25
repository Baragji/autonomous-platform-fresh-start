import express, { type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool, upsertExecution, getExecution } from '@autonomous/shared/src/db';
import { publish, subscribe, redisPub, redisSub } from '@autonomous/shared/src/events';
import { startOtel } from '@autonomous/shared/src/otel';
import { createLogger } from '@autonomous/shared/src/logger';

startOtel('gateway');
export const app = express();
app.use(express.json());
const logger = createLogger('gateway');

app.post('/api/executions', async (req: Request, res: Response) => {
  const intent = String(req.body?.intent || '').trim();
  if (!intent) return res.status(400).json({ error: 'intent required' });
  const id = uuidv4();
  await upsertExecution(id, 'planning', intent, 'mca');
  res.status(202)
    .set('Location', `/api/executions/${id}`)
    .json({ id, status: 'accepted', location: `/api/executions/${id}`, stream: `/api/executions/${id}/stream` });

  // Fire-and-forget call to MCA
  fetch(process.env.MCA_URL || 'http://localhost:7010/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ execId: id, intent })
  }).catch(() => {});
  await publish(id, 'status', { status: 'accepted' });
});

app.get('/api/executions/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const row = await getExecution(id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ id: row.id, status: row.status, current_agent: row.current_agent, created_at: row.created_at });
});

app.get('/api/executions/:id/stream', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`event: system\n`);
  res.write(`data: ${JSON.stringify({ status: 'connected' })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`: keep-alive ${Date.now()}\n\n`);
  }, 15000);

  const unsub = await subscribe(id, (msg) => {
    res.write(`event: ${msg.event}\n`);
    res.write(`data: ${JSON.stringify(msg.data)}\n\n`);
  });

  req.on('close', () => {
    unsub();
    clearInterval(heartbeat);
    res.end();
  });
});

app.get('/healthz', async (_req, res) => {
  const checks: Record<string, boolean> = {
    db: false,
    redisPub: false,
    redisSub: false
  };

  try {
    await pool.query('SELECT 1');
    checks.db = true;
  } catch (err) {
    const error = err as Error;
    logger.error({ err: error.message }, 'database health check failed');
  }

  try {
    await redisPub.ping();
    checks.redisPub = true;
  } catch (err) {
    const error = err as Error;
    logger.error({ err: error.message }, 'redis publisher health check failed');
  }

  try {
    await redisSub.ping();
    checks.redisSub = true;
  } catch (err) {
    const error = err as Error;
    logger.error({ err: error.message }, 'redis subscriber health check failed');
  }

  const ok = Object.values(checks).every(Boolean);
  if (!ok) {
    return res.status(503).json({ ok: false, checks });
  }
  return res.json({ ok: true, checks });
});

const port = Number(process.env.GATEWAY_PORT || 3030);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => logger.info({ port }, 'gateway listening'));
}
