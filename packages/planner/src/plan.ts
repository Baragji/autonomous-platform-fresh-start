import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  command: z.string().optional(),
  dependsOn: z.array(z.string()).optional()
});

export const PlanSchema = z.object({
  tasks: z.array(TaskSchema).min(2).max(20),
  acceptance_criteria: z.array(z.string()).min(1)
});

