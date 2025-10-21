import express from 'express';
import fetch from 'node-fetch';
import { upsertExecution, insertCheckpoint } from '@autonomous/shared/src/db';
import { publish } from '@autonomous/shared/src/events';

const app = express();
app.use(express.json());

app.post('/start', async (req, res) => {
  const { execId, intent } = req.body || {};
  if (!execId || !intent) return res.status(400).json({ error: 'execId and intent required' });
  res.json({ ok: true }); // Respond immediately; continue async

  await upsertExecution(execId, 'planning', intent, 'planner');
  await publish(execId, 'status', { status: 'planning' });

  try {
    // Call planner service
    const plannerUrl = process.env.PLANNER_URL || 'http://localhost:7020/plan';
    const r = await fetch(plannerUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ execId, intent })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || 'planner failed');

    await insertCheckpoint(execId, 'plan_saved', { planObject: j.object });
    await upsertExecution(execId, 'planned', intent, 'planner');
    await publish(execId, 'artifact', { type: 'plan', object: j.object });
    await publish(execId, 'status', { status: 'planned' });
  } catch (err: any) {
    await upsertExecution(execId, 'failed', intent, 'planner');
    await publish(execId, 'error', { message: err?.message || String(err) });
  }
});

const port = Number(process.env.MCA_PORT || 7010);
app.listen(port, () => console.log(`[mca] listening on :${port}`));

