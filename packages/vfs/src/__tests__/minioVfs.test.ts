import { createHash, randomUUID } from 'crypto';
import { Client } from 'minio';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MinioVfs, deletePrefix } from '../minio';

const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin123';
const bucket = process.env.MINIO_BUCKET || 'umca-artifacts';

let endpoint = process.env.MINIO_ENDPOINT || '';
let container: StartedTestContainer | null = null;
let client: Client;
let minioAvailable = true;
const ENFORCE = process.env.CI_ENFORCE_INTEGRATION === '1';

function createClient(url: string) {
  const parsed = new URL(url);
  return new Client({
    endPoint: parsed.hostname,
    port: Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 9000)),
    useSSL: parsed.protocol === 'https:',
    accessKey,
    secretKey
  });
}

async function ensureBucket() {
  try {
    await client.makeBucket(bucket, 'us-east-1');
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') {
      throw err;
    }
  }
}

describe('MinioVfs', () => {
  const prefixes: string[] = [];

  beforeAll(async () => {
    try {
      if (!endpoint) {
        container = await new GenericContainer('minio/minio')
          .withExposedPorts(9000)
          .withEnvironment({
            MINIO_ROOT_USER: accessKey,
            MINIO_ROOT_PASSWORD: secretKey
          })
          .withCommand(['server', '/data'])
          .withWaitStrategy(Wait.forLogMessage('API: http://0.0.0.0:9000'))
          .start();
        endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
      }
      client = createClient(endpoint);
      await ensureBucket();
    } catch (err) {
      minioAvailable = false;
      if (container) {
        await container.stop().catch(() => {});
        container = null;
      }
      const msg = `MinIO unavailable for VFS tests: ${(err as Error).message}`;
      if (ENFORCE) throw new Error(msg);
      process.stderr.write(`${msg}\n`);
    }
  });

  afterAll(async () => {
    if (minioAvailable) {
      for (const prefix of prefixes) {
        await deletePrefix(client, bucket, prefix).catch(() => {});
      }
    }
    if (container) {
      await container.stop().catch(() => {});
    }
  });

  it('writes and reads files using MinIO', async () => {
    if (!minioAvailable) {
      process.stderr.write('MinIO unavailable; skipping write/read test\n');
      return;
    }
    const prefix = `tests/vfs-${randomUUID()}`;
    prefixes.push(prefix);
    const vfs = new MinioVfs({ client, bucket, prefix });
    await vfs.writeFile('src/app.ts', 'console.log("hello");', { contentType: 'text/plain' });
    const buf = await vfs.readFile('src/app.ts');
    expect(buf.toString()).toContain('console.log("hello")');
  });

  it('lists files relative to the code root', async () => {
    if (!minioAvailable) {
      process.stderr.write('MinIO unavailable; skipping list test\n');
      return;
    }
    const prefix = `tests/vfs-${randomUUID()}`;
    prefixes.push(prefix);
    const vfs = new MinioVfs({ client, bucket, prefix });
    await vfs.writeFile('src/a.ts', 'a');
    await vfs.writeFile('src/b.ts', 'b');
    const entries = await vfs.listFiles('src');
    const paths = entries.map((e) => e.path).sort();
    expect(paths).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('persists sha256 metadata when provided', async () => {
    if (!minioAvailable) {
      process.stderr.write('MinIO unavailable; skipping metadata test\n');
      return;
    }
    const prefix = `tests/vfs-${randomUUID()}`;
    prefixes.push(prefix);
    const vfs = new MinioVfs({ client, bucket, prefix });
    const content = Buffer.from('integrity-check');
    const sha = createHash('sha256').update(content).digest('hex');
    await vfs.writeFile('src/app.ts', content, { sha256: sha });
    const stat = await client.statObject(bucket, `${prefix}/code/src/app.ts`);
    expect((stat.metaData || {})['x-amz-meta-sha256']).toBe(sha);
  });

  it('creates shadow copies before overwriting', async () => {
    if (!minioAvailable) {
      process.stderr.write('MinIO unavailable; skipping versioning test\n');
      return;
    }
    const prefix = `tests/vfs-${randomUUID()}`;
    prefixes.push(prefix);
    const clockDates = [new Date('2024-01-01T00:00:00Z'), new Date('2024-01-02T00:00:00Z')];
    const vfs = new MinioVfs({
      client,
      bucket,
      prefix,
      clock: () => clockDates.shift() || new Date()
    });
    await vfs.writeFile('src/app.ts', 'initial');
    await vfs.writeFile('src/app.ts', 'updated');
    const versions = await vfs.listVersions('src/app.ts');
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].versionPath).toMatch(/versions\/2024-01-01T00-00-00Z\/src\/app\.ts$/);
    const latest = await vfs.readFile('src/app.ts');
    expect(latest.toString()).toBe('updated');
  });
});
