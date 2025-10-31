import { describe, expect, it, vi } from 'vitest';
import type { SandboxApi } from '../server';
import { buildIssues, buildReasons, exec, parseVitestJson, extractVitestFailures, parseVitestPassed, scanForSecrets, sha256, vitestJsonToJUnit } from '../server';

describe('validator helpers', () => {
  it('throws when exec command fails', async () => {
    const run = vi.fn(async () => ({ exitCode: 1, stdout: 'out', stderr: 'err' }));
    const sandbox: SandboxApi = {
      files: {
        makeDir: async () => true,
        write: async () => {},
        read: async () => ''
      },
      commands: {
        run
      }
    } as unknown as SandboxApi;
    await expect(exec(sandbox, '/tmp', 'npm', ['test'])).rejects.toThrow(/command failed/);
    expect(run).toHaveBeenCalled();
  });

  it('exec succeeds on zero exit code', async () => {
    const run = vi.fn(async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }));
    const sandbox: SandboxApi = {
      files: { makeDir: async () => true, write: async () => {}, read: async () => '' },
      commands: { run }
    } as unknown as SandboxApi;
    const res = await exec(sandbox, '/tmp', 'npm', ['test']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('ok');
    expect(run).toHaveBeenCalled();
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

  it('parses vitest json and extracts failures', () => {
    const raw = JSON.stringify({
      numTotalTests: 2,
      numPassedTests: 1,
      testResults: [
        { name: 'ok', testFilePath: 'a.test.ts', status: 'pass', duration: 1 },
        { name: 'nope', testFilePath: 'b.test.ts', status: 'fail', duration: 2, error: { message: 'E' } }
      ]
    });
    const parsed = parseVitestJson(raw);
    const fails = extractVitestFailures(parsed);
    expect(Array.isArray(fails)).toBe(true);
    expect(fails.length).toBe(1);
    expect(fails[0].file).toContain('b.test.ts');
  });

  it('scans for secrets in sandbox files', async () => {
    const reads: Record<string, string> = {
      '/project/src/index.ts': 'const x = "AKIAABCDEFGHIJKLMNOP"; // fake key',
      '/project/src/app.ts': 'const password = "secret";',
      '/project/src/main.ts': 'export const ok = true;'
    };
    const sandbox: SandboxApi = {
      files: {
        makeDir: vi.fn(async () => true),
        write: vi.fn(async () => {}),
        read: vi.fn(async (p: string) => reads[p] ?? '')
      },
      commands: { run: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })) }
    } as unknown as SandboxApi;
    const count = await scanForSecrets(sandbox, '/project/src');
    expect(count).toBeGreaterThan(0);
  });
});
