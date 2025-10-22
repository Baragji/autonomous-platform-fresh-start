import { Client } from 'minio';
import path from 'path';
import { Vfs, VfsFileEntry, VfsVersionEntry, VfsWriteOptions } from './interface';

type MinioVfsOptions = {
  client: Client;
  bucket: string;
  prefix: string;
  clock?: () => Date;
};

export class MinioVfs implements Vfs {
  private readonly client: Client;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly clock: () => Date;

  constructor(opts: MinioVfsOptions) {
    this.client = opts.client;
    this.bucket = opts.bucket;
    this.prefix = normalizePrefix(opts.prefix);
    this.clock = opts.clock ?? (() => new Date());
  }

  async writeFile(relativePath: string, content: Buffer | string, options?: VfsWriteOptions): Promise<void> {
    const key = this.resolveCurrentPath(relativePath);
    await this.ensureVersionBackup(key, relativePath);
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    await this.client.putObject(this.bucket, key, buf, buf.length, buildMetadata(options));
  }

  async readFile(relativePath: string): Promise<Buffer> {
    const key = this.resolveCurrentPath(relativePath);
    const stream = await this.client.getObject(this.bucket, key);
    return streamToBuffer(stream);
  }

  async listFiles(prefix = ''): Promise<VfsFileEntry[]> {
    const base = this.resolveCurrentPath(prefix);
    const entries = await collectObjects(this.client.listObjectsV2(this.bucket, base, true));
    return entries
      .filter((obj) => obj.name && !obj.name.includes('/versions/'))
      .map((obj) => ({
        path: stripBase(obj.name as string, this.resolveCurrentRoot()),
        size: obj.size,
        lastModified: obj.lastModified ?? new Date(0)
      }));
  }

  async listVersions(relativePath: string): Promise<VfsVersionEntry[]> {
    const prefix = path.posix.join(this.resolveVersionsRoot(), sanitize(relativePath));
    const entries = await collectObjects(this.client.listObjectsV2(this.bucket, prefix, true));
    return entries
      .filter((obj) => obj.name)
      .map((obj) => {
        const name = obj.name as string;
        const timestamp = extractTimestamp(name, this.resolveVersionsRoot());
        return {
          versionPath: stripBase(name, this.resolveRoot()),
          timestamp,
          size: obj.size
        } satisfies VfsVersionEntry;
      })
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private resolveRoot() {
    return `${this.prefix}/`;
  }

  private resolveCurrentRoot() {
    return `${this.prefix}/code/`;
  }

  private resolveVersionsRoot() {
    return `${this.prefix}/code/versions/`;
  }

  private resolveCurrentPath(relativePath: string) {
    return path.posix.join(this.resolveCurrentRoot(), sanitize(relativePath));
  }

  private async ensureVersionBackup(key: string, relativePath: string) {
    try {
      const stat = await this.client.statObject(this.bucket, key);
      const existing = await this.client.getObject(this.bucket, key);
      const buf = await streamToBuffer(existing);
      const timestamp = this.clock().toISOString().replace(/[:.]/g, '-');
      const versionKey = path.posix.join(this.resolveVersionsRoot(), timestamp, sanitize(relativePath));
      const meta = normalizeMetadata(stat.metaData);
      await this.client.putObject(this.bucket, versionKey, buf, buf.length, meta);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
}

export async function deletePrefix(client: Client, bucket: string, prefix: string): Promise<void> {
  const normalized = normalizePrefix(prefix);
  const stream = client.listObjectsV2(bucket, normalized, true);
  const objects = await collectObjects(stream);
  for (const obj of objects) {
    if (obj.name) {
      await client.removeObject(bucket, obj.name);
    }
  }
}

function sanitize(p: string) {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

function normalizePrefix(p: string) {
  return sanitize(p).replace(/\/$/, '');
}

function stripBase(key: string, base: string) {
  return key.startsWith(base) ? key.slice(base.length) : key;
}

function extractTimestamp(name: string, versionsRoot: string) {
  const remainder = stripBase(name, versionsRoot);
  const [ts] = remainder.split('/');
  return ts || '';
}

function isNotFound(err: unknown) {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  return code === 'NotFound' || code === 'NoSuchKey' || code === 'NoSuchBucket';
}

type ListedObject = {
  name?: string;
  size: number;
  lastModified?: Date;
};

function collectObjects(stream: ReturnType<Client['listObjectsV2']>): Promise<ListedObject[]> {
  return new Promise((resolve, reject) => {
    const items: ListedObject[] = [];
    stream.on('data', (obj: ListedObject) => {
      items.push(obj);
    });
    stream.on('error', (err: Error) => reject(err));
    stream.on('end', () => resolve(items));
  });
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function buildMetadata(options?: VfsWriteOptions) {
  const meta: Record<string, string> = {};
  if (options?.contentType) {
    meta['Content-Type'] = options.contentType;
  }
  return meta;
}

function normalizeMetadata(meta?: Record<string, string>) {
  const entries = Object.entries(meta ?? {});
  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (key.toLowerCase() === 'content-type') {
      normalized['Content-Type'] = value;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}
