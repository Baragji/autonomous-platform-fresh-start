import { describe, it, expect } from 'vitest';
import { vitestJsonToJUnit } from '../src/server';

describe('vitestJsonToJUnit', () => {
  it('produces a testsuite with counts and failures', () => {
    const sample = {
      numTotalTests: 2,
      numPassedTests: 1,
      duration: 1200,
      testResults: [
        { name: 'test a', status: 'pass', duration: 200 },
        { name: 'test b', status: 'fail', duration: 1000, error: { message: 'boom' } }
      ]
    };
    const xml = vitestJsonToJUnit(JSON.stringify(sample));
    expect(xml).toContain('<testsuite name="vitest" tests="2" failures="1"');
    expect(xml).toContain('<testcase name="test a"');
    expect(xml).toContain('<failure message="boom"');
  });
});
