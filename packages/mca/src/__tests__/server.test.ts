import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import type { MockedFunction } from 'vitest';
type DbModule = typeof import('@autonomous/shared/src/db');
type EventsModule = typeof import('@autonomous/shared/src/events');
type MinioModule = typeof import('@autonomous/shared/src/minioClient');
type HttpModule = typeof import('@autonomous/shared/src/http');

const invokeMock = vi.fn();

type ValidatorPayload = {
  ok: true;
  verdict: 'PASS' | 'FAIL';
  report: string;
  junitObject?: string;
  coverageObject?: string;
  contract: {
    failingTests: Array<{ file: string; test: string; message?: string }>;
    coverage: { linesPct: number | null; threshold: number };
    requiredChanges: Array<{ summary: string; details?: string }>;
    generatedAt: string;
  };
};

const defaultValidatorPayload: ValidatorPayload = {
  ok: true,
  verdict: 'PASS',
  report: 'validator/validation-report.json',
  junitObject: 'validator/validator-junit.xml',
  coverageObject: 'validator/validator-coverage.json',
  contract: {
    failingTests: [],
    coverage: { linesPct: 92, threshold: 80 },
    requiredChanges: [],
    generatedAt: new Date().toISOString()
  }
};

let validatorPayload: ValidatorPayload = { ...defaultValidatorPayload };

const baseFetchImplementation = async (url: string, init?: Record<string, unknown>) => {
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : { execId: 'exec-1' };
  if (url.includes('/plan')) {
    return {
      ok: true,
      json: async () => ({ object: `${body.execId}/plan.json` })
    };
  }
  if (url.includes('/implement')) {
    return {
      ok: true,
      json: async () => ({ ok: true, files: ['src/app.ts'] })
    };
  }
  if (url.includes('/run')) {
    return {
      ok: true,
      json: async () => ({
        ok: true,
        junitObject: `${body.execId}/runner/junit.xml`,
        coverageObject: `${body.execId}/runner/coverage.json`
      })
    };
  }
  if (url.includes('/validate')) {
    return {
      ok: true,
      json: async () => validatorPayload
    };
  }
  return {
    ok: false,
    json: async () => ({ error: 'unknown route' })
  };
};

// Mock the shared http helper so we can assert calls directly
const fetchStub: ReturnType<typeof vi.fn> = vi.fn(baseFetchImplementation);
const nodes: Record<string, (state: unknown) => Promise<unknown> | unknown> = {};
let conditional: ((state: unknown) => string | symbol | null) | null = null;
const START = Symbol('start');
const END = Symbol('end');

vi.mock('@langchain/langgraph', () => ({
  StateGraph: class {
    addNode(name: string, fn: (state: unknown) => unknown) {
      nodes[name] = fn;
      return this;
    }
    addEdge() { return this; }
    addConditionalEdges(_name: string, fn: (state: unknown) => string | symbol | null) {
      conditional = fn;
      return this;
    }
    compile() {
      return {
        invoke: async (state: unknown, options?: unknown) => {
          let current = state;
          // Reflect START -> planner -> implementer -> END wiring used by service
          if (nodes.supervisor) {
            current = await nodes.supervisor(current);
          }
          if (nodes.planner) {
            current = await nodes.planner(current);
          }
          if (nodes.implementer) {
            current = await nodes.implementer(current);
          }
          if (nodes.runner) {
            current = await nodes.runner(current);
          }
          if (nodes.validator) {
            current = await nodes.validator(current);
            conditional?.(current);
          }
          invokeMock(current, options);
          return current;
        }
      };
    }
  },
  START,
  END
}));

vi.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({ query: vi.fn(), end: vi.fn() }))
}));

vi.mock('@autonomous/shared/src/db', () => ({
  upsertExecution: vi.fn(),
  pool: { query: vi.fn() }
}));

vi.mock('@autonomous/shared/src/events', () => ({
  publish: vi.fn().mockResolvedValue(undefined),
  redisPub: { ping: vi.fn().mockResolvedValue('PONG') },
  redisSub: { ping: vi.fn().mockResolvedValue('PONG') }
}));

vi.mock('@autonomous/shared/src/minioClient', () => {
  const { Readable } = require('stream');
  const getObject = vi.fn().mockResolvedValue(Readable.from([JSON.stringify({
    tasks: [
      { id: '1', title: 'Do', description: 'Do things' },
      { id: '2', title: 'More', description: 'More things' }
    ],
    acceptance_criteria: ['ok']
  })]));
  return {
    ensureBucket: vi.fn().mockResolvedValue(undefined),
    minio: { getObject, bucketExists: vi.fn().mockResolvedValue(true) } as unknown as MinioModule['minio'],
    ARTIFACT_BUCKET: 'umca-artifacts'
  } satisfies Partial<MinioModule>;
});

let app: Express;
let upsertExecution: MockedFunction<DbModule['upsertExecution']>;
let publish: MockedFunction<EventsModule['publish']>;
let minioGetObject: MockedFunction<MinioModule['minio']['getObject']>;
let ensureBucket: MockedFunction<MinioModule['ensureBucket']>;
let bucketExists: MockedFunction<MinioModule['minio']['bucketExists']>;
let fetchWithTimeoutMock: MockedFunction<HttpModule['fetchWithTimeout']>;
let testing: typeof import('../server')['__testing'];

vi.mock('@autonomous/shared/src/http', () => ({
  fetchWithTimeout: fetchStub,
  withTraceHeaders: (init: Record<string, unknown>) => init
}));

const resetValidatorPayload = () => {
  validatorPayload = {
    ...defaultValidatorPayload,
    contract: {
      failingTests: [],
      coverage: { ...defaultValidatorPayload.contract.coverage },
      requiredChanges: [],
      generatedAt: new Date().toISOString()
    }
  };
};

beforeAll(async () => {
  ({ app, __testing: testing } = await import('../server'));
  const dbModule = await import('@autonomous/shared/src/db');
  const eventsModule = await import('@autonomous/shared/src/events');
  const minioModule = await import('@autonomous/shared/src/minioClient');
  const httpModule = await import('@autonomous/shared/src/http');
  upsertExecution = vi.mocked(dbModule.upsertExecution);
  publish = vi.mocked(eventsModule.publish);
  minioGetObject = vi.mocked(minioModule.minio.getObject);
  ensureBucket = vi.mocked(minioModule.ensureBucket);
  bucketExists = vi.mocked(minioModule.minio.bucketExists);
  fetchWithTimeoutMock = vi.mocked(httpModule.fetchWithTimeout);
});

beforeEach(() => {
  invokeMock.mockClear();
  fetchStub.mockClear();
  fetchStub.mockImplementation(baseFetchImplementation);
  // also clear the typed mock reference for expectations
  fetchWithTimeoutMock.mockClear();
  fetchWithTimeoutMock.mockImplementation(baseFetchImplementation);
  upsertExecution.mockReset();
  upsertExecution.mockResolvedValue(undefined as unknown as void);
  publish.mockReset();
  publish.mockResolvedValue(undefined as unknown as void);
  minioGetObject.mockClear();
  ensureBucket.mockResolvedValue(undefined as unknown as void);
  bucketExists.mockResolvedValue(true);
  resetValidatorPayload();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('mca server', () => {
  it('requires execId and intent', async () => {
    const res = await request(app).post('/start').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'execId and intent required' });
    expect(upsertExecution).not.toHaveBeenCalled();
  });

  it('invokes LangGraph with provided execution', async () => {
    const res = await request(app).post('/start').send({ execId: 'exec-1', intent: 'Build' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(upsertExecution).toHaveBeenCalledWith('exec-1', 'planning', 'Build', 'mca');
    expect(publish).toHaveBeenCalledWith('exec-1', 'status', { status: 'planning' });
    expect(publish).toHaveBeenCalledWith('exec-1', 'agent', { agent: 'planner', status: 'working' });
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(expect.stringContaining('/plan'), expect.objectContaining({ method: 'POST' }), expect.any(Object));
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(expect.stringContaining('/implement'), expect.objectContaining({ method: 'POST' }), expect.any(Object));
    expect(publish).toHaveBeenCalledWith('exec-1', 'status', { status: 'implementing' });
    expect(publish).toHaveBeenCalledWith('exec-1', 'status', { status: 'implemented' });
    expect(publish).toHaveBeenCalledWith('exec-1', 'agent', { agent: 'validator', status: 'working' });
    expect(publish).toHaveBeenCalledWith('exec-1', 'artifact', expect.objectContaining({ type: 'validation', contract: expect.objectContaining({ coverage: expect.objectContaining({ threshold: 80 }) }) }));
    expect(publish).toHaveBeenCalledWith('exec-1', 'status', { status: 'validated', failure_count: 0 });
    expect(invokeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        execId: 'exec-1',
        intent: 'Build',
        status: 'validated',
        failure_count: 0,
        last_validator_feedback: expect.objectContaining({ verdict: 'PASS' })
      }),
      expect.objectContaining({ configurable: { thread_id: 'exec-1' } })
    );
  });

  it('increments failure_count and stores validator feedback when validation fails', async () => {
    const failContract = {
      failingTests: [
        { file: 'src/app.test.ts', test: 'should add numbers', message: 'Expected 2 to equal 3' }
      ],
      coverage: { linesPct: 58, threshold: 80 },
      requiredChanges: [
        { summary: 'Fix failing tests', details: 'should add numbers (src/app.test.ts): Expected 2 to equal 3' }
      ],
      generatedAt: new Date().toISOString()
    };
    validatorPayload = {
      ok: true,
      verdict: 'FAIL',
      report: 'validator/fail-report.json',
      junitObject: 'validator/fail-junit.xml',
      coverageObject: 'validator/fail-coverage.json',
      contract: failContract
    };

    const initialState = {
      execId: 'exec-fail',
      intent: 'Build',
      failure_count: 0
    } as unknown as Parameters<typeof testing.validatorNode>[0];

    const result = await testing.validatorNode(initialState);

    expect(result.failure_count).toBe(1);
    expect(result.status).toBe('needs_remediation');
    expect(result.last_validator_feedback).toMatchObject({
      verdict: 'FAIL',
      contract: expect.objectContaining({
        requiredChanges: expect.arrayContaining([expect.objectContaining({ summary: 'Fix failing tests' })])
      })
    });
    expect(publish).toHaveBeenCalledWith('exec-fail', 'status', expect.objectContaining({ status: 'needs_remediation', failure_count: 1 }));
  });

  it('reports healthy when dependencies respond', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, checks: { db: true, redisPub: true, redisSub: true, minio: true } });
    expect(ensureBucket).toHaveBeenCalled();
    expect(bucketExists).toHaveBeenCalled();
  });

  it('returns 503 when MinIO bucket check fails', async () => {
    bucketExists.mockResolvedValueOnce(false);

    const res = await request(app).get('/healthz');

    expect(ensureBucket).toHaveBeenCalled();
    expect(bucketExists).toHaveBeenCalled();
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, checks: { db: true, redisPub: true, redisSub: true, minio: false } });
  });
});
