import { Client } from 'minio';
import { env } from './env';

function parseEndpoint(url: string) {
  const u = new URL(url);
  return {
    endPoint: u.hostname,
    port: parseInt(u.port || (u.protocol === 'https:' ? '443' : '9000'), 10),
    useSSL: u.protocol === 'https:',
  };
}

const endpoint = parseEndpoint(env.MINIO_ENDPOINT);

export const minio = new Client({
  ...endpoint,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

export const ARTIFACT_BUCKET = 'umca-artifacts';

export async function ensureBucket() {
  const exists = await minio.bucketExists(ARTIFACT_BUCKET).catch(() => false);
  if (!exists) {
    await minio.makeBucket(ARTIFACT_BUCKET, 'us-east-1');
  }
}

