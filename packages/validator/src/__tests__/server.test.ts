import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VfsFileEntry } from '@autonomous/shared/src/vfs';

type TestVfsWriteOptions = { sha256?: string; contentType?: string };

const listFilesMock = vi.fn<() => Promise<VfsFileEntry[]>>(async () => []);
const readFileMock = vi.fn<(path: string) => Promise<Buffer>>(async (_path: string) => Buffer.from(''));
const writeFileMock = vi.fn<(path: string, content: Buffer | string, options?: TestVfsWriteOptions) => Promise<void>>(async (_path: string, _content: Buffer | string, _options?: TestVfsWriteOptions) => {});

const createVfsMock = vi.fn(async () => ({
  listFiles: listFilesMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  listVersions: async () => []
}));

vi.mock('@autonomous/shared/src/vfs', () => ({
  createVfs: createVfsMock
}));

const publishMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@autonomous/shared/src/events', () => ({
  publish: publishMock
}));

type LangfuseLike = {
  trace?: (opts?: Record<string, unknown>) => { generation?: (payload: Record<string, unknown>) => void } | void;
  flush?: () => Promise<void>;
};

const getLangfuseMock = vi.fn<() => LangfuseLike | null>(() => null);

vi.mock('@autonomous/shared/src/langfuse', () => ({ getLangfuse: getLangfuseMock }));

const openAiCreateMock = vi.fn();
const openAiCtorMock = vi.fn().mockImplementation(() => ({
  chat: {
    completions: {
      create: openAiCreateMock
    }
  }
}));

vi.mock('openai', () => ({
  default: openAiCtorMock
}));

type SandboxProcessOutcome = { exitCode: number; stdout: string; stderr: string };

const sandboxInstances: MockSandbox[] = [];
let coveragePct = 95;

class MockSandbox {
  files = {
    makeDir: vi.fn(async () => true),
    write: vi.fn(async () => {}),
    read: vi.fn(async (path: string, opts?: { format?: 'text' | 'bytes' }) => {
      if (path.endsWith('coverage/coverage-summary.json')) {
        return opts?.format === 'bytes'
          ? new TextEncoder().encode(JSON.stringify({ total: { lines: { pct: coveragePct } } }))
          : JSON.stringify({ total: { lines: { pct: coveragePct } } });
      }
      if (path.endsWith('/index.ts') || path.endsWith('/app.ts') || path.endsWith('/main.ts')) {
        return opts?.format === 'bytes' ? new TextEncoder().encode('export const ok = true;') : 'export const ok = true;';
      }
      return opts?.format === 'bytes' ? new Uint8Array() : '';
    })
  };
  commands = {
    run: vi.fn(async (cmd: string, _opts?: { args?: string[]; cwd?: string; env?: Record<string,string> }) => {
      // Simulate vitest JSON output on test run
      if (cmd === 'npm') {
        return { exitCode: 0, stdout: JSON.stringify({
          numTotalTests: 1,
          numPassedTests: 1,
          duration: 100,
          testResults: [{ name: 'passes', status: 'pass', duration: 100 }]
        }), stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    })
  };
  kill = vi.fn(async () => {});
  constructor() {
    sandboxInstances.push(this);
  }
}

const sandboxCtorMock = vi.fn(() => new MockSandbox());

vi.mock('@e2b/sdk', () => ({ Sandbox: sandboxCtorMock }));

describe('validator server', () => {
  beforeEach(() => {
    process.env.E2B_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-openai';
    process.env.VALIDATOR_LLM_JUDGE = '0';
    process.env.VALIDATOR_COVERAGE_THRESHOLD_GLOBAL = '';
    createVfsMock.mockClear();
    listFilesMock.mockClear();
    readFileMock.mockReset().mockImplementation(async () => Buffer.from(''));
    writeFileMock.mockReset();
    publishMock.mockClear();
    sandboxCtorMock.mockClear();
    openAiCtorMock.mockClear();
    openAiCreateMock.mockReset();
    getLangfuseMock.mockReset().mockReturnValue(null);
    sandboxInstances.length = 0;
    listFilesMock.mockResolvedValue([]);
    coveragePct = 95;
  });

  it('exposes healthz endpoint', async () => {
    const mod = await import('../server');
    const res = await request(mod.app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, checks: { vfs: true, e2bKey: true } });
    expect(listFilesMock).toHaveBeenCalled();
  });

  it('healthz returns 503 when vfs fails and E2B key missing', async () => {
    process.env.E2B_API_KEY = '';
    listFilesMock.mockRejectedValueOnce(new Error('boom')); // vfs error path
    const mod = await import('../server');
    const res = await request(mod.app).get('/healthz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, checks: { vfs: false, e2bKey: false } });
    // restore key for later tests
    process.env.E2B_API_KEY = 'test-key';
  });

  it('validates execution and attaches artifact checksums', async () => {
    const writes: Array<{ path: string; options?: TestVfsWriteOptions; content: Buffer | string }> = [];
    writeFileMock.mockImplementation(async (path, content, options) => {
      writes.push({ path, content, options });
    });
    const codeFiles = [
      { path: 'code/src/app.ts', size: 10, lastModified: new Date() }
    ];
    listFilesMock.mockResolvedValue(codeFiles);
    readFileMock.mockImplementation(async (path: string) => {
      if (path === 'code/src/app.ts') {
        return Buffer.from('export const value = 1;', 'utf8');
      }
      return Buffer.from('', 'utf8');
    });

    const mod = await import('../server');
    const res = await request(mod.app).post('/validate').send({ execId: 'exec-123' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.verdict).toBe('PASS');
    expect(res.body.contract).toMatchObject({
      coverage: { linesPct: 95, threshold: 80 },
      requiredChanges: []
    });
    expect(publishMock).toHaveBeenCalled();
    expect(sandboxCtorMock).toHaveBeenCalledWith({ apiKey: 'test-key' });

    const junitWrite = writes.find((w) => String(w.path).endsWith('validator-junit.xml'));
    const coverageWrite = writes.find((w) => String(w.path).endsWith('validator-coverage.json'));
    const reportWrite = writes.find((w) => String(w.path).endsWith('validation-report.json'));

    expect(junitWrite?.options?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(coverageWrite?.options?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(reportWrite?.options?.sha256).toMatch(/^[a-f0-9]{64}$/);

    const reportData = JSON.parse(Buffer.from(reportWrite?.content ?? '{}').toString('utf8')) as Record<string, unknown>;
    expect(reportData).toMatchObject({
      remediation: expect.objectContaining({
        coverage: { linesPct: 95, threshold: 80 },
        requiredChanges: []
      })
    });
  });

  it('starts server when invoked explicitly', async () => {
    const mod = await import('../server');
    const listenSpy = vi.spyOn(mod.app, 'listen').mockImplementation(() => ({
      close: vi.fn()
    }) as unknown as ReturnType<typeof mod.startServer>);
    mod.startServer();
    expect(listenSpy).toHaveBeenCalled();
    listenSpy.mockRestore();
  });

  it('returns structured FAIL when sandbox execution fails', async () => {
    sandboxCtorMock.mockImplementationOnce(() => {
      const instance = new MockSandbox();
      instance.commands.run = vi.fn(async () => ({ exitCode: 1, stdout: 'fail', stderr: 'boom' }));
      return instance;
    });
    listFilesMock.mockResolvedValueOnce([{ path: 'code/src/app.ts', size: 1, lastModified: new Date() }]);
    readFileMock.mockResolvedValueOnce(Buffer.from('export const bad = true;'));
    const mod = await import('../server');
    const res = await request(mod.app).post('/validate').send({ execId: 'exec-error' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.verdict).toBe('FAIL');
    expect(Array.isArray(res.body.contract?.requiredChanges)).toBe(true);
    expect(res.body.contract.requiredChanges.length).toBeGreaterThan(0);
  });

  it('invokes llm judge when validation fails', async () => {
    coveragePct = 70;
    process.env.VALIDATOR_LLM_JUDGE = '1';
    process.env.VALIDATOR_COVERAGE_THRESHOLD_GLOBAL = '90';
    const traceGeneration = vi.fn();
    const traceMock = vi.fn().mockReturnValue({ generation: traceGeneration });
    const flushMock = vi.fn(async () => {});
    getLangfuseMock.mockReturnValue({ trace: traceMock, flush: flushMock });
    openAiCreateMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              verdict: 'FAIL',
              reasons: ['LLM override'],
              coverage: { lines: 70 },
              testsPassed: true,
              secretsFound: 0
            })
          }
        }
      ]
    });

    const codeFiles = [
      { path: 'code/src/app.ts', size: 10, lastModified: new Date() }
    ];
    listFilesMock.mockResolvedValue(codeFiles);
    readFileMock.mockImplementation(async (path: string) => {
      if (path === 'code/src/app.ts') {
        return Buffer.from('export const value = 1;', 'utf8');
      }
      return Buffer.from('', 'utf8');
    });

    const mod = await import('../server');
    const res = await request(mod.app).post('/validate').send({ execId: 'exec-fail' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.verdict).toBe('FAIL');
    expect(res.body.contract).toMatchObject({
      coverage: { threshold: 90 }
    });
    expect(openAiCtorMock).toHaveBeenCalledWith({ apiKey: 'test-openai' });
    expect(openAiCreateMock).toHaveBeenCalled();
    expect(traceMock).toHaveBeenCalled();
    expect(traceGeneration).toHaveBeenCalled();
    expect(flushMock).toHaveBeenCalled();
    expect(publishMock).toHaveBeenCalledWith('exec-fail', 'status', { status: 'needs_remediation' });
  });

  it('gracefully handles LLM judge failure and keeps automated report', async () => {
    // Force automated report (coverage below threshold), and make LLM throw
    coveragePct = 70;
    process.env.VALIDATOR_LLM_JUDGE = '1';
    openAiCreateMock.mockRejectedValueOnce(new Error('llm down'));
    const codeFiles = [ { path: 'code/src/app.ts', size: 1, lastModified: new Date() } ];
    listFilesMock.mockResolvedValue(codeFiles);
    readFileMock.mockImplementation(async (p: string) => p === 'code/src/app.ts' ? Buffer.from('export const x=1;') : Buffer.from(''));
    const mod = await import('../server');
    const res = await request(mod.app).post('/validate').send({ execId: 'exec-judgefail' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.verdict).toBe('FAIL'); // stays automated FAIL
  });

  it('detects secrets and includes issues in report', async () => {
    const codeFiles = [ { path: 'code/src/app.ts', size: 1, lastModified: new Date() } ];
    listFilesMock.mockResolvedValue(codeFiles);
    readFileMock.mockImplementation(async (p: string) => {
      if (p === 'code/src/app.ts') return Buffer.from('export const ok=true;');
      return Buffer.from('');
    });
    sandboxCtorMock.mockImplementationOnce(() => {
      const s = new MockSandbox();
      // Inject a fake secret in one of the scanned files
      s.files.read = vi.fn(async (path: string) => {
        if (path.endsWith('/index.ts')) return 'const a="AKIAABCDEFGHIJKLMNOP"';
        return '';
      });
      // Normal passing tests
      s.commands.run = vi.fn(async () => ({ exitCode: 0, stdout: JSON.stringify({ numTotalTests: 1, numPassedTests: 1, duration: 1, testResults: [{ name: 'ok', status: 'pass' }] }), stderr: '' }));
      return s;
    });
    const mod = await import('../server');
    const res = await request(mod.app).post('/validate').send({ execId: 'exec-secrets' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.verdict).toBe('FAIL'); // secrets found -> FAIL
    // Contract should recommend removing secrets
    const hasSecretsReq = Array.isArray(res.body.contract?.requiredChanges) && (res.body.contract.requiredChanges as Array<{ summary?: string; details?: string }>).some((c) => /secrets/i.test(String(c.summary)) || /secrets/i.test(String(c.details)));
    expect(hasSecretsReq).toBe(true);
  });

  it('returns structured FAIL when no code files are present', async () => {
    // No code files in VFS triggers early structured FAIL path
    listFilesMock.mockResolvedValueOnce([]);
    const mod = await import('../server');
    const res = await request(mod.app).post('/validate').send({ execId: 'exec-nocode' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.verdict).toBe('FAIL');
    // Should have written a validation report under validator/ prefix
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/validator\/validation-report\.json$/),
      expect.any(Buffer),
      expect.objectContaining({ sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    );
    // Contract should include coverage threshold default (80) when unset
    expect(res.body.contract).toMatchObject({ coverage: { threshold: 80 } });
  });

  it('returns structured FAIL when E2B_API_KEY is missing', async () => {
    process.env.E2B_API_KEY = '';
    listFilesMock.mockResolvedValueOnce([{ path: 'code/src/app.ts', size: 1, lastModified: new Date() }]);
    readFileMock.mockResolvedValueOnce(Buffer.from('export const ok = true;'));
    const mod = await import('../server');
    const res = await request(mod.app).post('/validate').send({ execId: 'exec-noe2b' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.verdict).toBe('FAIL');
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/validator\/validation-report\.json$/),
      expect.any(Buffer),
      expect.objectContaining({ sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    );
    expect(publishMock).toHaveBeenCalledWith('exec-noe2b', 'status', { status: 'needs_remediation' });
    // Reset E2B key for subsequent tests
    process.env.E2B_API_KEY = 'test-key';
  });

  it('fails when coverage summary is missing but still writes JUnit only', async () => {
    // Provide code so sandbox path is taken
    listFilesMock.mockResolvedValueOnce([{ path: 'code/src/app.ts', size: 1, lastModified: new Date() }]);
    readFileMock.mockResolvedValueOnce(Buffer.from('export const ok = true;'));
    // Override sandbox factory for this test to simulate missing coverage file
    sandboxCtorMock.mockImplementationOnce(() => {
      const s = new MockSandbox();
      s.files.read = vi.fn(async (p: string) => {
        if (String(p).endsWith('coverage/coverage-summary.json')) throw new Error('missing');
        return '';
      });
      s.commands.run = vi.fn(async (cmd: string) => {
        if (cmd === 'npm') {
          return { exitCode: 0, stdout: JSON.stringify({ numTotalTests: 1, numPassedTests: 1, duration: 1, testResults: [{ name: 'ok', status: 'pass', duration: 1 }] }), stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      });
      return s;
    });
    const mod = await import('../server');
    const res = await request(mod.app).post('/validate').send({ execId: 'exec-nocov' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.verdict).toBe('FAIL'); // coverage missing so cannot pass
    // Should have written a JUnit object but not coverage object
    const junitCall = writeFileMock.mock.calls.find(([p]) => String(p).endsWith('validator-junit.xml'));
    expect(junitCall).toBeTruthy();
  });
});
