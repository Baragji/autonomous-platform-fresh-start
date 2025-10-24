import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import type { MockedFunction } from 'vitest';
type DbModule = typeof import('@autonomous/shared/src/db');
type EventsModule = typeof import('@autonomous/shared/src/events');
type MinioModule = typeof import('@autonomous/shared/src/minioClient');

const invokeMock = vi.fn();
const fetchStub = vi.fn().mockImplementation(async (url: string, init?: Record<string, unknown>) => {
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
  return {
    ok: false,
    json: async () => ({ error: 'unknown route' })
  };
});
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
          } else {
            const next = conditional ? conditional(current) : END;
            if (typeof next === 'string' && nodes[next]) {
              current = await nodes[next](current);
            }
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
  upsertExecution: vi.fn()
}));

vi.mock('@autonomous/shared/src/events', () => ({
  publish: vi.fn().mockResolvedValue(undefined)
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
    minio: { getObject } as unknown as MinioModule['minio'],
    ARTIFACT_BUCKET: 'umca-artifacts'
  } satisfies Partial<MinioModule>;
});

let app: Express;
let upsertExecution: MockedFunction<DbModule['upsertExecution']>;
let publish: MockedFunction<EventsModule['publish']>;
let minioGetObject: MockedFunction<MinioModule['minio']['getObject']>;

beforeAll(async () => {
  // Use global fetch stub since server uses global fetch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchStub;
  ({ app } = await import('../server'));
  const dbModule = await import('@autonomous/shared/src/db');
  const eventsModule = await import('@autonomous/shared/src/events');
  const minioModule = await import('@autonomous/shared/src/minioClient');
  upsertExecution = vi.mocked(dbModule.upsertExecution);
  publish = vi.mocked(eventsModule.publish);
  minioGetObject = vi.mocked(minioModule.minio.getObject);
});

beforeEach(() => {
  invokeMock.mockClear();
  fetchStub.mockClear();
  upsertExecution.mockReset();
  upsertExecution.mockResolvedValue(undefined as unknown as void);
  publish.mockReset();
  publish.mockResolvedValue(undefined as unknown as void);
  minioGetObject.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('mca server', () => {
  it('responds to /healthz', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

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
    expect(upsertExecution).toHaveBeenCalledWith('exec-1', 'planning', 'Build', 'mca');
    expect(publish).toHaveBeenCalledWith('exec-1', 'status', { status: 'planning' });
    expect(publish).toHaveBeenCalledWith('exec-1', 'agent', { agent: 'planner', status: 'working' });
    expect(fetchStub).toHaveBeenCalledWith(expect.stringContaining('/plan'), expect.objectContaining({ method: 'POST' }));
    expect(fetchStub).toHaveBeenCalledWith(expect.stringContaining('/implement'), expect.objectContaining({ method: 'POST' }));
    expect(publish).toHaveBeenCalledWith('exec-1', 'status', { status: 'implementing' });
    expect(publish).toHaveBeenCalledWith('exec-1', 'status', { status: 'implemented' });
    expect(invokeMock).toHaveBeenCalledWith(
      expect.objectContaining({ execId: 'exec-1', intent: 'Build', status: 'implemented' }),
      { configurable: { thread_id: 'exec-1' } }
    );
  });
});
