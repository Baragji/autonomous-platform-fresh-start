import { z } from 'zod';

export const ValidatorRemediationContractSchema = z.object({
  failingTests: z.array(z.object({
    file: z.string(),
    test: z.string(),
    message: z.string().optional()
  })).default([]),
  coverage: z.object({
    linesPct: z.number().nullable(),
    threshold: z.number()
  }),
  requiredChanges: z.array(z.object({
    summary: z.string(),
    details: z.string().optional(),
    blockers: z.array(z.string()).optional()
  })).default([]),
  generatedAt: z.string()
});

export type ValidatorRemediationContract = z.infer<typeof ValidatorRemediationContractSchema>;
