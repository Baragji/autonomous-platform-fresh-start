import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import type { MockedFunction } from 'vitest';
import type { Langfuse } from 'langfuse';
type MinioModule = typeof import('@autonomous/shared/src/minioClient');
type PutObjectReturn = Awaited<ReturnType<MinioModule['minio']['putObject']>>;

const putObjectMock = vi.fn();
const ensureBucketMock = vi.fn();
const getLangfuseMock = vi.fn<() => Langfuse | null>(() => null);
const createMock = vi.fn();

vi.mock('@autonomous/shared/src/minioClient', () => ({
  ensureBucket: ensureBucketMock,
  minio: { putObject: putObjectMock },
  ARTIFACT_BUCKET: 'umca-artifacts'
}));

vi.mock('@autonomous/shared/src/langfuse', () => ({
  getLangfuse: getLangfuseMock
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } }
  }))
}));

let app: Express;
let ensureBucket: MockedFunction<MinioModule['ensureBucket']>;
let putObject: MockedFunction<MinioModule['minio']['putObject']>;

beforeAll(async () => {
  ({ app } = await import('../server'));
  const minioModule = await import('@autonomous/shared/src/minioClient');
  ensureBucket = vi.mocked(minioModule.ensureBucket);
  putObject = vi.mocked(minioModule.minio.putObject);
});

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.PLANNER_PROMPT_PATH;
  ensureBucket.mockReset();
  ensureBucket.mockResolvedValue(undefined as unknown as void);
  putObject.mockReset();
  putObject.mockResolvedValue({} as PutObjectReturn);
  createMock.mockReset();
  getLangfuseMock.mockReset();
  getLangfuseMock.mockReturnValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('planner server', () => {
  it('requires execId and intent', async () => {
    const res = await request(app).post('/plan').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'execId and intent required' });
    expect(ensureBucket).not.toHaveBeenCalled();
  });

  it('falls back to deterministic plan when OpenAI fails', async () => {
    createMock.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).post('/plan').send({ execId: 'exec-123', intent: 'Do work' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, object: 'exec-123/plan.json' });

    expect(ensureBucket).toHaveBeenCalled();
    expect(putObject).toHaveBeenCalledTimes(2);
    const firstCall = putObject.mock.calls[0];
    expect(firstCall[0]).toBe('umca-artifacts');
    expect(firstCall[1]).toBe('exec-123/plan.json');
    const planPayload = JSON.parse(firstCall[2].toString());
    expect(Array.isArray(planPayload.tasks)).toBe(true);
    expect(planPayload.acceptance_criteria).toContain('plan.json stored in MinIO');
  });
});
