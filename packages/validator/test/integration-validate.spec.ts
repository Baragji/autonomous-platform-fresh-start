import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// Apply mocks BEFORE importing the server to ensure handler uses them
vi.mock('@autonomous/shared/src/vfs', async () => {
  const mem = new Map<string, Buffer>();
  return {
    createVfs: async (_execId: string) => ({
      listFiles: async () => [{ path: 'code/index.ts' }],
      readFile: async (p: string) => mem.get(p) || Buffer.from(''),
      writeFile: async (p: string, data: string | Buffer) => {
        mem.set(p, Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
      }
    }),
    // types
    Vfs: class {},
    VfsFileEntry: class {}
  } as any;
});

vi.mock('@e2b/sdk', () => {
  return {
    Sandbox: class {
      filesystem = {
        makeDir: async () => {},
        write: async (_p: string, _c: any) => {},
        read: async (p: string) => {
          if (p.endsWith('coverage/coverage-summary.json')) {
            return JSON.stringify({ total: { lines: { pct: 92 } } });
          }
          return '';
        }
      };
      process = {
        start: async () => ({
          wait: async () => ({ exitCode: 0, stdout: JSON.stringify({ numTotalTests: 1, numPassedTests: 1, duration: 5, testResults: [{ name: 'ok', status: 'pass' }] }), stderr: '' })
        })
      };
      async close() {}
    }
  } as any;
});

// Stub Redis events to avoid real network calls
vi.mock('@autonomous/shared/src/events', () => {
  return {
    publish: async () => {},
    subscribe: async () => ({ unsubscribe: async () => {} })
  } as any;
});

describe('POST /validate integration', () => {
  let app: import('express').Express;

  beforeEach(async () => {
    process.env.VALIDATOR_ARTIFACT_PREFIX = 'validator';
    process.env.VALIDATOR_COVERAGE_THRESHOLD_GLOBAL = '80';
    process.env.VALIDATOR_LLM_JUDGE = '0';
    process.env.E2B_API_KEY = 'dummy';
    // Import after mocks and env are set
    const mod = await import('../src/server');
    app = mod.app;
  });
  afterEach(() => {
    delete process.env.VALIDATOR_ARTIFACT_PREFIX;
    delete process.env.VALIDATOR_COVERAGE_THRESHOLD_GLOBAL;
    delete process.env.VALIDATOR_LLM_JUDGE;
    delete process.env.E2B_API_KEY;
  });

  it('produces artifacts and checksums in report', async () => {
    const res = await request(app).post('/validate').send({ execId: 'exec-1' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.verdict).toBe('PASS');

    // validate checksum inclusion by replaying the mocked VFS writes
    // NOTE: we can only assert format here since the mocked VFS is internal to the module
    // but the route returns the paths which we can use to infer naming
    expect(res.body.report).toContain('validator/validation-report.json');
    expect(res.body.junitObject).toContain('validator/validator-junit.xml');
    expect(res.body.coverageObject).toContain('validator/validator-coverage.json');
  });
});
