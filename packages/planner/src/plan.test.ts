import { describe, it, expect } from 'vitest';
import { PlanSchema } from './plan';

describe('PlanSchema', () => {
  it('validates a correct plan', () => {
    const plan = {
      tasks: [
        { id: '1', title: 'Init', description: 'Initialize repo' },
        { id: '2', title: 'Build', description: 'Build service', dependsOn: ['1'] }
      ],
      acceptance_criteria: ['All services start']
    };
    expect(() => PlanSchema.parse(plan)).not.toThrow();
  });

  it('rejects invalid plan', () => {
    const bad = { tasks: [], acceptance_criteria: [] };
    expect(() => PlanSchema.parse(bad as unknown)).toThrow();
  });
});
