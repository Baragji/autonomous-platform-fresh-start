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
  filesystem = {
    makeDir: vi.fn(async () => {}),
    write: vi.fn(async () => {}),
    read: vi.fn(async (path: string) => {
      if (path.endsWith('coverage/coverage-summary.json')) {
        return JSON.stringify({ total: { lines: { pct: coveragePct } } });
      }
      if (path.endsWith('/index.ts') || path.endsWith('/app.ts') || path.endsWith('/main.ts')) {
        return 'export const ok = true;';
      }
      return '';
    })
  };
  process = {
    start: vi.fn(async () => {
      return {
        wait: vi.fn(async () => {
          const outcome: SandboxProcessOutcome = {
            exitCode: 0,
            stdout: JSON.stringify({
              numTotalTests: 1,
              numPassedTests: 1,
              duration: 100,
              testResults: [{ name: 'passes', status: 'pass', duration: 100 }]
            }),
            stderr: ''
          };
          return outcome;
        })
      };
    })
  };
  close = vi.fn(async () => {});
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

  it('validates execution and attaches artifact checksums', async () => {
    const writes: Array<{ path: string; options?: TestVfsWriteOptions }> = [];
    writeFileMock.mockImplementation(async (path, _content, options) => {
      writes.push({ path, options });
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
    expect(publishMock).toHaveBeenCalled();
    expect(sandboxCtorMock).toHaveBeenCalledWith({ apiKey: 'test-key' });

    const junitWrite = writes.find((w) => String(w.path).endsWith('validator-junit.xml'));
    const coverageWrite = writes.find((w) => String(w.path).endsWith('validator-coverage.json'));
    const reportWrite = writes.find((w) => String(w.path).endsWith('validation-report.json'));

    expect(junitWrite?.options?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(coverageWrite?.options?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(reportWrite?.options?.sha256).toMatch(/^[a-f0-9]{64}$/);
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
      instance.process.start = vi.fn(async () => ({
        wait: vi.fn(async () => ({ exitCode: 1, stdout: 'fail', stderr: 'boom' }))
      }));
      return instance;
    });
    listFilesMock.mockResolvedValueOnce([{ path: 'code/src/app.ts', size: 1, lastModified: new Date() }]);
    readFileMock.mockResolvedValueOnce(Buffer.from('export const bad = true;'));
    const mod = await import('../server');
    const res = await request(mod.app).post('/validate').send({ execId: 'exec-error' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.verdict).toBe('FAIL');
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
    expect(openAiCtorMock).toHaveBeenCalledWith({ apiKey: 'test-openai' });
    expect(openAiCreateMock).toHaveBeenCalled();
    expect(traceMock).toHaveBeenCalled();
    expect(traceGeneration).toHaveBeenCalled();
    expect(flushMock).toHaveBeenCalled();
    expect(publishMock).toHaveBeenCalledWith('exec-fail', 'status', { status: 'needs_remediation' });
  });
});
