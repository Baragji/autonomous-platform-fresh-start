import express, { type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { upsertExecution, getExecution } from '@autonomous/shared/src/db';
import { publish, subscribe } from '@autonomous/shared/src/events';
import { startOtel } from '@autonomous/shared/src/otel';

startOtel('gateway');
const app = express();
app.use(express.json());

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

  const unsub = await subscribe(id, (msg) => {
    res.write(`event: ${msg.event}\n`);
    res.write(`data: ${JSON.stringify(msg.data)}\n\n`);
  });

  req.on('close', () => {
    unsub();
    res.end();
  });
});

const port = Number(process.env.GATEWAY_PORT || 3030);
app.listen(port, () => console.log(`[gateway] listening on :${port}`));
