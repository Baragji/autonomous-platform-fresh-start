import { describe, it, expect, beforeEach } from 'vitest';
import { ToolExecutor } from '../tools';
import type { Vfs, VfsFileEntry, VfsVersionEntry } from '@autonomous/shared/src/vfs';
import type { ImplementerEvent } from '../publisher';

function makeVfs(): Vfs {
  const files = new Map<string, Buffer>();
  return {
    async writeFile(p: string, content: Buffer | string) {
      files.set(p, typeof content === 'string' ? Buffer.from(content, 'utf8') : content);
    },
    async readFile(p: string) {
      const v = files.get(p);
      if (!v) throw new Error('not found');
      return v;
    },
    async listFiles(prefix?: string): Promise<VfsFileEntry[]> {
      const out: VfsFileEntry[] = [];
      for (const [k, v] of files.entries()) {
        if (!prefix || k.startsWith(prefix)) {
          out.push({ path: k, size: v.length, lastModified: new Date() });
        }
      }
      return out;
    },
    async listVersions(_p: string): Promise<VfsVersionEntry[]> { return []; }
  };
}

describe('ToolExecutor', () => {
  let events: ImplementerEvent[];
  let vfs: Vfs;
  let tool: ToolExecutor;

  beforeEach(() => {
    events = [];
    vfs = makeVfs();
    tool = new ToolExecutor({ vfs, publisher: { publish: async (e) => { events.push(e); } } });
  });

  it('create and view a file', async () => {
    const res = await tool.execute('create', { path: 'src/app.ts', content: 'console.log("hi")\n', contentType: 'text/plain' });
    expect(JSON.parse(res)).toMatchObject({ ok: true, path: 'src/app.ts' });
    const view = await tool.execute('view', { path: 'src/app.ts' });
    const payload = JSON.parse(view);
    expect(payload.path).toBe('src/app.ts');
    expect(payload.size).toBeGreaterThan(0);
    expect(events.map((e) => e.type)).toEqual(['edit.start', 'edit.complete']);
    expect(tool.getTouchedPaths()).toEqual(['src/app.ts']);
  });

  it('view missing file throws', async () => {
    await expect(tool.execute('view', { path: 'missing.txt' })).rejects.toThrow('not found');
  });

  it('str_replace succeeds and fails when find is missing', async () => {
    await tool.execute('create', { path: 'README.md', content: 'a b a' });
    const res = await tool.execute('str_replace', { path: 'README.md', find: 'a', replace: 'x' });
    const r = JSON.parse(res);
    expect(r.replacements).toBe(2);
    const updated = await vfs.readFile('README.md');
    expect(updated.toString('utf8')).toBe('x b x');
    await expect(tool.execute('str_replace', { path: 'README.md', find: 'zzz', replace: 'x' })).rejects.toThrow('String not found');
  });

  it('insert supports after, before, and append; errors on missing marker', async () => {
    await tool.execute('create', { path: 'file.txt', content: 'abc' });
    await tool.execute('insert', { path: 'file.txt', content: '-', after: 'a' });
    await tool.execute('insert', { path: 'file.txt', content: '+', before: 'c' });
    const buf = await vfs.readFile('file.txt');
    expect(buf.toString()).toBe('a-b+c');
    await tool.execute('insert', { path: 'file.txt', content: '!' });
    const buf2 = await vfs.readFile('file.txt');
    expect(buf2.toString()).toBe('a-b+c!');
    await expect(tool.execute('insert', { path: 'file.txt', content: 'X', after: 'NOPE' })).rejects.toThrow('After marker not found');
    await expect(tool.execute('insert', { path: 'file.txt', content: 'X', before: 'NOPE' })).rejects.toThrow('Before marker not found');
  });
});
