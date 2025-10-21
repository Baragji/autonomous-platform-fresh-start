import { describe, expect, it } from 'vitest';

import { PlanSchema } from '../plan';

describe('PlanSchema', () => {
  it('accepts valid plan', () => {
    const plan = {
      tasks: [
        { id: '1', title: 'Task 1', description: 'Desc 1' },
        { id: '2', title: 'Task 2', description: 'Desc 2' }
      ],
      acceptance_criteria: ['All tasks complete']
    };
    expect(() => PlanSchema.parse(plan)).not.toThrow();
  });

  it('rejects plan missing tasks', () => {
    const invalid = { tasks: [], acceptance_criteria: [] };
    expect(() => PlanSchema.parse(invalid)).toThrow();
  });
});
