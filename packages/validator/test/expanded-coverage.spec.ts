import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app, parseVitestPassed, vitestJsonToJUnit, sha256, exec, scanForSecrets } from '../src/server';

describe('unit helpers', () => {
  it('parseVitestPassed returns false on invalid json', () => {
    expect(parseVitestPassed('{')).toBe(false);
  });
  it('parseVitestPassed returns false when some tests fail', () => {
    const j = { numTotalTests: 2, numPassedTests: 1 };
    expect(parseVitestPassed(JSON.stringify(j))).toBe(false);
  });
  it('vitestJsonToJUnit handles invalid JSON and failure branch', () => {
    const xmlEmpty = vitestJsonToJUnit('{');
    expect(xmlEmpty).toContain('<testsuite name="vitest"');
    const sample = {
      numTotalTests: 1,
      numPassedTests: 0,
      duration: 100,
      testResults: [{ name: 'x', status: 'fail', duration: 100, error: { message: 'boom' } }]
    };
    const xml = vitestJsonToJUnit(JSON.stringify(sample));
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('<failure');
  });
  it('sha256 computes deterministic hash', () => {
    expect(sha256(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('exec throws on non-zero exit code and succeeds otherwise', async () => {
    const okSandbox = {
      process: { start: async () => ({ wait: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }) }) }
    } as any;
    const out = await exec(okSandbox, '/', 'echo', ['ok']);
    expect(out.exitCode).toBe(0);

    const badSandbox = {
      process: { start: async () => ({ wait: async () => ({ exitCode: 1, stdout: 'err', stderr: 'trace' }) }) }
    } as any;
    await expect(exec(badSandbox, '/', 'echo', ['bad'])).rejects.toThrow(/command failed/);
  });
  it('scanForSecrets counts matches from guessed files', async () => {
    const sandbox = {
      filesystem: {
        read: async (_p: string) => {
          return [
            'AKIA1234567890ABCD',
            'password = "secret"',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.s.payload.signature'
          ].join('\n');
        }
      }
    } as any;
    const n = await scanForSecrets(sandbox, '/project/src');
    expect(n).toBeGreaterThan(0);
  });
});

describe('integration /validate edge cases', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.VALIDATOR_ARTIFACT_PREFIX = 'validator';
    process.env.VALIDATOR_COVERAGE_THRESHOLD_GLOBAL = '80';
    process.env.E2B_API_KEY = 'dummy';
  });
  afterEach(() => {
    delete process.env.VALIDATOR_ARTIFACT_PREFIX;
    delete process.env.VALIDATOR_COVERAGE_THRESHOLD_GLOBAL;
    delete process.env.VALIDATOR_LLM_JUDGE;
    delete process.env.E2B_API_KEY;
    vi.restoreAllMocks();
  });

  it('handles FAIL verdict and judge enabled without crashing', async () => {
    process.env.VALIDATOR_LLM_JUDGE = '1';

    vi.mock('@autonomous/shared/src/vfs', async () => {
      const mem = new Map<string, Buffer>();
      return {
        createVfs: async (_execId: string) => ({
          listFiles: async () => [{ path: 'code/index.ts' }],
          readFile: async (p: string) => mem.get(p) || Buffer.from(''),
          writeFile: async (p: string, data: string | Buffer) => {
            mem.set(p, Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
          }
        })
      } as any;
    });

    vi.mock('@e2b/sdk', () => {
      return {
        Sandbox: class {
          filesystem = {
            makeDir: async () => {},
            write: async () => {},
            read: async (p: string) => {
              if (p.endsWith('coverage/coverage-summary.json')) {
                // Low coverage to trigger FAIL
                return JSON.stringify({ total: { lines: { pct: 10 } } });
              }
              return '';
            }
          };
          process = {
            start: async () => ({
              wait: async () => ({
                exitCode: 0,
                stdout: JSON.stringify({ numTotalTests: 2, numPassedTests: 1, duration: 5, testResults: [{ name: 'a', status: 'fail' }] }),
                stderr: ''
              })
            })
          };
          async close() {}
        }
      } as any;
    });

    vi.mock('openai', () => {
      return {
        default: class OpenAI {
          chat = {
            completions: {
              create: async () => ({ choices: [{ message: { content: JSON.stringify({ verdict: 'FAIL' }) } }], model: 'gpt', usage: {} })
            }
          };
        }
      } as any;
    });

    const res = await request(app).post('/validate').send({ execId: 'exec-fail' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.report).toBe('string');
  });

  it('handles missing coverage summary gracefully', async () => {
    vi.mock('@autonomous/shared/src/vfs', async () => {
      const mem = new Map<string, Buffer>();
      return {
        createVfs: async (_execId: string) => ({
          listFiles: async () => [{ path: 'code/index.ts' }],
          readFile: async (p: string) => mem.get(p) || Buffer.from(''),
          writeFile: async (p: string, data: string | Buffer) => {
            mem.set(p, Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
          }
        })
      } as any;
    });

    vi.mock('@e2b/sdk', () => {
      return {
        Sandbox: class {
          filesystem = {
            makeDir: async () => {},
            write: async () => {},
            read: async (_p: string) => { throw new Error('not found'); }
          };
          process = {
            start: async () => ({ wait: async () => ({ exitCode: 0, stdout: JSON.stringify({ numTotalTests: 1, numPassedTests: 1 }), stderr: '' }) })
          };
          async close() {}
        }
      } as any;
    });

    const res = await request(app).post('/validate').send({ execId: 'exec-nocov' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // coverageObject may be undefined when missing; assert existence of other artifacts
    expect(res.body.junitObject).toContain('validator/validator-junit.xml');
    expect(res.body.report).toContain('validator/validation-report.json');
  });
});
