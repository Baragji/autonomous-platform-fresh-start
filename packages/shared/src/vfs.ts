import { MinioVfs } from '@autonomous/vfs/minio';
import { ARTIFACT_BUCKET, ensureBucket, minio } from './minioClient';

export async function createVfs(execId: string, opts?: { prefixSuffix?: string }) {
  await ensureBucket();
  const segments = [execId];
  if (opts?.prefixSuffix) segments.push(opts.prefixSuffix);
  const prefix = segments.join('/');
  return new MinioVfs({ client: minio, bucket: ARTIFACT_BUCKET, prefix });
}

export type { Vfs, VfsFileEntry, VfsVersionEntry } from '@autonomous/vfs/interface';
