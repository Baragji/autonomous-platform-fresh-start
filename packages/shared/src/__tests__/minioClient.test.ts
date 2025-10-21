import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const minioMocks = vi.hoisted(() => {
  const bucketExists = vi.fn();
  const makeBucket = vi.fn();
  const Client = vi.fn().mockImplementation(() => ({
    bucketExists,
    makeBucket
  }));
  return { bucketExists, makeBucket, Client };
});

vi.mock('minio', () => ({ Client: minioMocks.Client }));

describe('minio client', () => {
  beforeEach(() => {
    vi.resetModules();
    minioMocks.bucketExists.mockReset();
    minioMocks.makeBucket.mockReset();
    minioMocks.Client.mockClear();
    minioMocks.bucketExists.mockResolvedValue(true);
    minioMocks.makeBucket.mockResolvedValue(undefined);
    process.env.MINIO_ENDPOINT = 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY = 'key';
    process.env.MINIO_SECRET_KEY = 'secret';
  });

  afterEach(() => {
    vi.resetModules();
    delete process.env.MINIO_ENDPOINT;
    delete process.env.MINIO_ACCESS_KEY;
    delete process.env.MINIO_SECRET_KEY;
  });

  it('creates client using endpoint details', async () => {
    process.env.MINIO_ENDPOINT = 'https://minio.internal:9443';
    const module = await import('../minioClient');
    expect(minioMocks.Client).toHaveBeenCalledWith({
      endPoint: 'minio.internal',
      port: 9443,
      useSSL: true,
      accessKey: 'key',
      secretKey: 'secret'
    });
    expect(module.ARTIFACT_BUCKET).toBe('umca-artifacts');
  });

  it('ensureBucket skips creation when bucket exists', async () => {
    const module = await import('../minioClient');
    minioMocks.bucketExists.mockResolvedValueOnce(true);
    await module.ensureBucket();
    expect(minioMocks.bucketExists).toHaveBeenCalledWith('umca-artifacts');
    expect(minioMocks.makeBucket).not.toHaveBeenCalled();
  });

  it('ensureBucket creates bucket when missing', async () => {
    const module = await import('../minioClient');
    minioMocks.bucketExists.mockResolvedValueOnce(false);
    await module.ensureBucket();
    expect(minioMocks.makeBucket).toHaveBeenCalledWith('umca-artifacts', 'us-east-1');
  });
});
