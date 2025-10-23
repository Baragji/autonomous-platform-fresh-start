import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import * as vfsMod from '@autonomous/shared/src/vfs';
import * as events from '@autonomous/shared/src/events';

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
}

// Fake sandbox API
class FakeSandbox {
  filesystem = {
    makeDir: async () => {},
    write: async () => {},
    read: async (p: string) => {
      if (p.endsWith('coverage-summary.json')) return JSON.stringify({ total: { lines: { pct: 100 } } });
      throw new Error('nf');
    }
  };
  process = {
    start: async () => ({
      wait: async () => ({ exitCode: 0, stdout: JSON.stringify({ numTotalTests: 1, numPassedTests: 1, duration: 10, testResults: [{ name: 'ok', status: 'pass', duration: 10 }] }), stderr: '' })
    })
  };
  async close() {}
}

vi.mock('@e2b/sdk', () => ({ Sandbox: FakeSandbox }));
let app: import('express').Express;

describe('runner server', () => {
  beforeEach(() => {
    vi.spyOn(events, 'publish').mockResolvedValue();
    vi.spyOn(vfsMod, 'createVfs').mockResolvedValue(
      new MemVfs() as unknown as Awaited<ReturnType<typeof vfsMod.createVfs>>
    );
  });

  it('runs tests and uploads artifacts', async () => {
    // Import server after mocks are in place
    ({ app } = await import('../server'));
    const vfs = await vfsMod.createVfs('x');
    await vfs.writeFile('code/src/app.ts', 'export const x=1;');
    await vfs.writeFile('code/src/app.test.ts', 'import {x} from "./app"; if(x!==1) throw new Error("bad");');
    const res = await request(app).post('/run').send({ execId: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
