import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { env } from '@autonomous/shared/src/env';
import { ensureBucket, minio, ARTIFACT_BUCKET } from '@autonomous/shared/src/minioClient';
import { startOtel } from '@autonomous/shared/src/otel';
import { getLangfuse } from '@autonomous/shared/src/langfuse';

startOtel('planner');
const app = express();
app.use(express.json());

import { PlanSchema } from './plan';

app.post('/plan', async (req: Request, res: Response) => {
  const execId = String(req.body.execId || '');
  const intent = String(req.body.intent || '');
  if (!execId || !intent) return res.status(400).json({ error: 'execId and intent required' });

  try {
    await ensureBucket();
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06',
      messages: [
        { role: 'system', content: 'You are a task planner. Break user requests into 2-10 concrete tasks.' },
        { role: 'user', content: intent }
      ],
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{}';
    const plan = PlanSchema.parse(JSON.parse(content));

    // Langfuse usage logging (best-effort)
    const lf = getLangfuse();
    const usage = (response as { usage?: Record<string, unknown> }).usage;
    if (lf && usage) {
      const trace = lf.trace({ name: 'planner.plan' });
      trace.generation({
        model: String((response as { model?: string }).model || 'openai'),
        input: intent,
        output: plan,
        usage
      });
      try { await lf?.flush?.(); } catch {}
    }

    const objectName = `${execId}/plan.json`;
    const buf = Buffer.from(JSON.stringify(plan, null, 2));
    await minio.putObject(ARTIFACT_BUCKET, objectName, buf, buf.length, {
      'Content-Type': 'application/json'
    });

    res.json({ ok: true, object: objectName });
  } catch (err: unknown) {
    const e = err as Error;
    res.status(500).json({ error: e.message || String(err) });
  }
});

const port = Number(process.env.PLANNER_PORT || 7020);
app.listen(port, () => {
  console.log(`[planner] listening on :${port}`);
});
