import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import request from 'supertest';
import * as vfsMod from '@autonomous/shared/src/vfs';
import * as events from '@autonomous/shared/src/events';

vi.mock('@autonomous/shared/src/events', () => ({
  publish: vi.fn(async () => {}),
  publishWithTrace: vi.fn(async () => {}),
  redisPub: { ping: vi.fn().mockResolvedValue('PONG') },
  redisSub: { ping: vi.fn().mockResolvedValue('PONG') }
}));

// Mock VFS to avoid MinIO in unit tests
class MemVfs implements vfsMod.Vfs {
  private store = new Map<string, Buffer>();
  async writeFile(p: string, c: Buffer | string): Promise<void> {
    const b = typeof c === 'string' ? Buffer.from(c, 'utf8') : c;
    this.store.set(p, b);
  }
  async readFile(p: string): Promise<Buffer> { const b = this.store.get(p); if (!b) throw new Error('nf'); return b; }
  async listFiles(): Promise<vfsMod.VfsFileEntry[]> {
    return Array.from(this.store.keys()).map((k) => ({ path: k, size: this.store.get(k)!.length, lastModified: new Date() }));
  }
  async listVersions(): Promise<vfsMod.VfsVersionEntry[]> { return []; }
  get(path: string) {
    return this.store.get(path);
  }
}

// Fake sandbox API updated to match agent.ts API shape
class FakeSandbox {
  static async create() {
    return new FakeSandbox();
  }
  files = {
    makeDir: async () => true,
    write: async () => {},
    read: async (p: string) => {
      if (p.endsWith('coverage/coverage-summary.json')) return JSON.stringify({ total: { lines: { pct: 100 } } });
      throw new Error('nf');
    }
  };
  commands = {
    run: async (_cmd: string, _opts?: { args?: string[]; cwd?: string; env?: Record<string, string> }) => ({
      exitCode: 0,
      stdout: JSON.stringify({ numTotalTests: 1, numPassedTests: 1, duration: 10, testResults: [{ name: 'ok', status: 'pass', duration: 10 }] }),
      stderr: ''
    })
  };
  async kill() {}
}

vi.mock('@e2b/sdk', () => ({ Sandbox: FakeSandbox }));
let app: import('express').Express;
let execVfs: MemVfs;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let publishSpy: MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let publishWithTraceSpy: MockedFunction<any>;

describe('runner server', () => {
  beforeEach(() => {
    process.env.E2B_API_KEY = 'test-key';
    vi.clearAllMocks();
    publishSpy = vi.mocked(events.publish);
    publishWithTraceSpy = vi.mocked(events.publishWithTrace);
    publishSpy.mockClear();
    publishWithTraceSpy.mockClear();
    execVfs = new MemVfs();
    vi.spyOn(vfsMod, 'createVfs').mockImplementation(async (execId: string, opts?: { prefixSuffix?: string }) => {
      if (execId === 'x' && !opts?.prefixSuffix) {
        return execVfs as unknown as Awaited<ReturnType<typeof vfsMod.createVfs>>;
      }
      return new MemVfs() as unknown as Awaited<ReturnType<typeof vfsMod.createVfs>>;
    });
  });

  it('runs tests and uploads artifacts', async () => {
    // Import server after mocks are in place
    ({ app } = await import('./server'));
    const vfs = await vfsMod.createVfs('x');
    await vfs.writeFile('code/src/app.ts', 'export const x=1;');
    await vfs.writeFile('code/src/app.test.ts', 'import {x} from "./app"; if(x!==1) throw new Error("bad");');
    const res = await request(app).post('/run').send({ execId: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.junitObject).toBe('runner/junit.xml');
    expect(res.body.coverageObject).toBe('runner/coverage.json');
    expect(res.body.junitObjectAbsolute).toBe('x/runner/junit.xml');
    expect(res.body.coverageObjectAbsolute).toBe('x/runner/coverage.json');
    expect(execVfs.get('runner/junit.xml')).toBeInstanceOf(Buffer);
    expect(execVfs.get('runner/coverage.json')).toBeInstanceOf(Buffer);
    const artifactCall = publishSpy.mock.calls.find(([, event]: unknown[]) => event === 'artifact');
    expect(artifactCall?.[2]).toMatchObject({
      type: 'runner_results',
      artifact_prefix: 'x/runner',
      junit: 'runner/junit.xml',
      coverage: 'runner/coverage.json',
      junit_object: 'x/runner/junit.xml',
      coverage_object: 'x/runner/coverage.json'
    });
    expect(publishWithTraceSpy).toHaveBeenCalledWith('x', 'artifact', expect.any(Object));
  });

  it('returns healthy status when dependencies succeed', async () => {
    ({ app } = await import('./server'));
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, checks: { vfs: true, e2bKey: true } });
    expect(vfsMod.createVfs).toHaveBeenCalledWith('healthz', { prefixSuffix: 'runner' });
  });

  it('returns 503 when E2B key is missing', async () => {
    process.env.E2B_API_KEY = '';
    ({ app } = await import('./server'));
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, checks: { vfs: true, e2bKey: false } });
    process.env.E2B_API_KEY = 'test-key';
  });
});
