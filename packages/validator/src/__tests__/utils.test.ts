import { describe, expect, it, vi } from 'vitest';
import type { SandboxApi } from '../server';
import { buildIssues, buildReasons, exec, parseVitestPassed, sha256, vitestJsonToJUnit } from '../server';

describe('validator helpers', () => {
  it('throws when exec command fails', async () => {
    const wait = vi.fn(async () => ({ exitCode: 1, stdout: 'out', stderr: 'err' }));
    const sandbox: SandboxApi = {
      filesystem: {
        makeDir: async () => {},
        write: async () => {},
        read: async () => ''
      },
      process: {
        start: vi.fn(async () => ({ wait }))
      }
    };
    await expect(exec(sandbox, '/tmp', 'npm', ['test'])).rejects.toThrow(/command failed/);
    expect(wait).toHaveBeenCalled();
  });

  it('parses vitest pass/fail state', () => {
    expect(parseVitestPassed(JSON.stringify({ numTotalTests: 1, numPassedTests: 1 }))).toBe(true);
    expect(parseVitestPassed('not json')).toBe(false);
  });

  it('builds reasons and issues for failures', () => {
    expect(buildReasons(false, false, 2)).toContain('Tests failed');
    const issues = buildIssues(1);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('secrets');
  });

  it('computes sha256 hashes deterministically', () => {
    expect(sha256('a')).toBe(sha256(Buffer.from('a')));
  });

  it('converts vitest json to junit xml', () => {
    const xml = vitestJsonToJUnit(JSON.stringify({
      numTotalTests: 1,
      numPassedTests: 0,
      duration: 100,
      testResults: [{ name: 'fails', status: 'fail', duration: 10, error: { message: 'bad' } }]
    }));
    expect(xml).toContain('<testsuite');
    expect(xml).toContain('<failure');
  });
});
