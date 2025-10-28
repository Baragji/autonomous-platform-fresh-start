import express from 'express';
import { z } from 'zod';
import { FixPlan } from './types';

const app = express();
app.use(express.json({ limit: '1mb' }));

const RequestSchema = z.object({
  validator: z.any().optional()
});

function deriveSteps(validator: unknown): string[] {
  try {
    const v = validator as { reasons?: string[] };
    const steps: string[] = [];
    const reasons = Array.isArray(v?.reasons) ? v!.reasons! : [];
    for (const r of reasons) {
      steps.push(`Address: ${String(r)}`);
    }
    if (steps.length === 0) steps.push('Review failing tests and increase coverage to >=80%');
    return steps;
  } catch {
    return ['Review failing tests and increase coverage to >=80%'];
  }
}

app.post('/review', (req, res) => {
  const parsed = RequestSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid request' });
  const steps = deriveSteps(parsed.data.validator);
  const plan = FixPlan.parse({ steps, priority: 'medium' });
  return res.status(200).json({ advisory: true, plan });
});

const port = Number(process.env.REVIEWER_PORT || 7060);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, port, service: 'reviewer' }));
  });
}

export { app };

