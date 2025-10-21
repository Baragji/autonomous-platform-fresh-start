import express from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { env } from '@autonomous/shared/src/env';
import { ensureBucket, minio, ARTIFACT_BUCKET } from '@autonomous/shared/src/minioClient';

const app = express();
app.use(express.json());

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  command: z.string().optional(),
  dependsOn: z.array(z.string()).optional()
});

const PlanSchema = z.object({
  tasks: z.array(TaskSchema).min(2).max(20),
  acceptance_criteria: z.array(z.string()).min(1)
});

app.post('/plan', async (req, res) => {
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
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'Plan',
          schema: PlanSchema,
          strict: true
        } as any
      }
    });

    const content = response.choices[0]?.message?.content || '{}';
    const plan = PlanSchema.parse(JSON.parse(content));

    const objectName = `${execId}/plan.json`;
    await minio.putObject(ARTIFACT_BUCKET, objectName, Buffer.from(JSON.stringify(plan, null, 2)), {
      'Content-Type': 'application/json'
    });

    res.json({ ok: true, object: objectName });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

const port = Number(process.env.PLANNER_PORT || 7020);
app.listen(port, () => {
  console.log(`[planner] listening on :${port}`);
});

