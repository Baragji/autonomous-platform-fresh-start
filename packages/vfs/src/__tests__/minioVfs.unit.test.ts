import { describe, it, expect } from 'vitest';
import { MinioVfs, deletePrefix } from '../minio';
import type { Client } from 'minio';
import { EventEmitter } from 'events';
import { Readable } from 'stream';

class FakeMinioClient {
  private store = new Map<string, { buf: Buffer; meta: Record<string, string>; mtime: Date }>();
  constructor(public readonly basePrefix = '') {}

  async putObject(_bucket: string, key: string, buf: Buffer, _len: number, meta?: Record<string, string>) {
    this.store.set(key, { buf, meta: meta ?? {}, mtime: new Date() });
  }
  async getObject(_bucket: string, key: string) {
    const entry = this.store.get(key);
    if (!entry) throw Object.assign(new Error('no such key'), { code: 'NoSuchKey' });
    return Readable.from(entry.buf);
  }
  async statObject(_bucket: string, key: string) {
    const entry = this.store.get(key);
    if (!entry) throw Object.assign(new Error('no such key'), { code: 'NoSuchKey' });
    return { metaData: entry.meta } as unknown as { metaData: Record<string, string> };
  }
  listObjectsV2(_bucket: string, prefix: string, _recursive: boolean) {
    const emitter = new EventEmitter();
    setImmediate(() => {
      for (const [key, val] of this.store.entries()) {
        if (key.startsWith(prefix)) {
          emitter.emit('data', { name: key, size: val.buf.length, lastModified: val.mtime });
        }
      }
      emitter.emit('end');
    });
    return emitter as unknown as ReturnType<Client['listObjectsV2']>;
  }
  async removeObject(_bucket: string, key: string) {
    this.store.delete(key);
  }
}

describe('MinioVfs (unit)', () => {
  it('write, read, list, and version backup', async () => {
    const client = new FakeMinioClient();
    const vfs = new MinioVfs({ client: client as unknown as Client, bucket: 'b', prefix: 'tests/p1', clock: (() => {
      const seq = [new Date('2024-01-01T00:00:00Z'), new Date('2024-01-02T00:00:00Z')];
      return () => seq.shift() || new Date();
    })() });

    await vfs.writeFile('src/app.ts', 'initial');
    let files = await vfs.listFiles('src');
    expect(files.map((f) => f.path)).toEqual(['src/app.ts']);

    await vfs.writeFile('src/app.ts', 'updated');
    const versions = await vfs.listVersions('src/app.ts');
    expect(versions.length).toBeGreaterThanOrEqual(1);
    // Accept optional millisecond segment before trailing Z
    expect(versions[0].versionPath).toMatch(/versions\/2024-01-01T00-00-00[^/]*\/src\/app\.ts$/);
    const buf = await vfs.readFile('src/app.ts');
    expect(buf.toString()).toBe('updated');

    // Ensure listFiles filters out versions
    files = await vfs.listFiles('');
    expect(files.some((e) => e.path.includes('versions/'))).toBe(false);
  });

  it('persists sha256 in metadata when provided', async () => {
    const client = new FakeMinioClient();
    const vfs = new MinioVfs({ client: client as unknown as Client, bucket: 'b', prefix: 'tests/meta' });
    const content = Buffer.from('test content');
    const hash = 'abc123def456';
    await vfs.writeFile('src/file.ts', content, { sha256: hash });
    
    // Verify metadata was stored
    const stored = (client as unknown as { store: Map<string, { meta: Record<string, string> }> }).store.get('tests/meta/code/src/file.ts');
    expect(stored?.meta['x-amz-meta-sha256']).toBe(hash);
  });

  it('deletePrefix removes all objects under prefix', async () => {
    const client = new FakeMinioClient();
    const vfs = new MinioVfs({ client: client as unknown as Client, bucket: 'b', prefix: 'tests/p2' });
    await vfs.writeFile('src/a.ts', 'a');
    await vfs.writeFile('src/b.ts', 'b');
    let files = await vfs.listFiles('src');
    expect(files.length).toBe(2);
    await deletePrefix(client as unknown as Client, 'b', 'tests/p2');
    files = await vfs.listFiles('src');
    expect(files.length).toBe(0);
  });
});
