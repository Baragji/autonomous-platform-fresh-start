import { describe, it, expect } from 'vitest';
import { buildReasons } from '../src/server';

describe('buildReasons', () => {
  it('reports all passing when all checks pass', () => {
    const reasons = buildReasons(true, true, 0);
    expect(reasons).toEqual(['All automated checks passed']);
  });
  it('reports failures when tests fail', () => {
    const reasons = buildReasons(false, true, 0);
    expect(reasons).toContain('Tests failed');
  });
  it('reports coverage reason when below threshold', () => {
    const reasons = buildReasons(true, false, 0);
    expect(reasons).toContain('Coverage below threshold');
  });
  it('reports secrets findings', () => {
    const reasons = buildReasons(true, true, 2);
    expect(reasons.some((r) => r.includes('Secrets detected (2)'))).toBe(true);
  });
});
