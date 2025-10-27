import { z } from 'zod';

export const FixPlan = z.object({
  steps: z.array(z.string().min(1)),
  priority: z.enum(['low', 'medium', 'high'])
});

export type FixPlan = z.infer<typeof FixPlan>;

