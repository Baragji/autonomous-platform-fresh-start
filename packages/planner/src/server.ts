import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { env } from '@autonomous/shared/src/env';
import { ensureBucket, minio, ARTIFACT_BUCKET } from '@autonomous/shared/src/minioClient';
import { startOtel } from '@autonomous/shared/src/otel';
import { getLangfuse } from '@autonomous/shared/src/langfuse';

startOtel('planner');
export const app = express();
app.use(express.json());

import { PlanSchema } from './plan';
import fs from 'fs';
import path from 'path';

app.post('/plan', async (req: Request, res: Response) => {
  const execId = String(req.body.execId || '');
  const intent = String(req.body.intent || '');
  if (!execId || !intent) return res.status(400).json({ error: 'execId and intent required' });

  try {
    await ensureBucket();
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    // Load planner prompt (system instructions)
    const promptPath = process.env.PLANNER_PROMPT_PATH || 'Agent_framework/01_research_agent_RA.md';
    const resolvedPrompt = path.resolve(promptPath);
    const plannerPrompt = fs.existsSync(resolvedPrompt)
      ? fs.readFileSync(resolvedPrompt, 'utf-8')
      : 'You are a task planner. Break user requests into 2-10 concrete tasks.';
    let planObj: unknown | null = null;
    type ChatResponse = Awaited<ReturnType<typeof client.chat.completions.create>>;
    let llmResponse: ChatResponse | null = null;
    try {
      llmResponse = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06',
        messages: [
          { role: 'system', content: plannerPrompt },
          { role: 'user', content: `Plan for: ${intent}. Return JSON with keys tasks (2-10 items) and acceptance_criteria.` }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'Plan',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                tasks: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 20,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      description: { type: 'string' },
                      command: { type: 'string' },
                      dependsOn: { type: 'array', items: { type: 'string' } }
                    },
                    required: ['id','title','description']
                  }
                },
                acceptance_criteria: { type: 'array', minItems: 1, items: { type: 'string' } }
              },
              required: ['tasks','acceptance_criteria']
            }
          }
      }
      });
      const content = llmResponse.choices[0]?.message?.content || '{}';
      planObj = JSON.parse(content);
    } catch (_e) {
      // Fallback minimal plan (deterministic), still validated by Zod
      planObj = {
        tasks: [
          { id: '1', title: 'Scaffold API', description: 'Initialize project structure and dependencies' },
          { id: '2', title: 'Implement required endpoints', description: 'CRUD endpoints with basic tests', dependsOn: ['1'] }
        ],
        acceptance_criteria: [
          'POST /executions returns 202',
          'plan.json stored in MinIO',
          'tests pass with coverage >= 80%'
        ]
      };
    }
    const plan = PlanSchema.parse(planObj);

    // Langfuse usage logging (best-effort)
    const lf = getLangfuse();
    const usage = llmResponse?.usage as Record<string, unknown> | undefined;
    if (lf && usage) {
      const trace = lf.trace({ name: 'planner.plan' });
      trace.generation({
        model: String((llmResponse as { model?: string } | null)?.model || 'openai'),
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

    // Also store prompt used for auditability
    const promptObj = Buffer.from(plannerPrompt, 'utf8');
    await minio.putObject(ARTIFACT_BUCKET, `${execId}/planner_prompt.md`, promptObj, promptObj.length, {
      'Content-Type': 'text/markdown'
    });

    res.json({ ok: true, object: objectName });
  } catch (err: unknown) {
    const e = err as Error;
    res.status(500).json({ error: e.message || String(err) });
  }
});

const port = Number(process.env.PLANNER_PORT || 7020);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    process.stdout.write(`[planner] listening on :${port}\n`);
  });
}
