import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import type { MockedFunction } from 'vitest';
type DbModule = typeof import('@autonomous/shared/src/db');
type EventsModule = typeof import('@autonomous/shared/src/events');

const invokeMock = vi.fn();
const fetchStub = vi.fn().mockImplementation(async (_url: string, init?: Record<string, unknown>) => {
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : { execId: 'exec-1' };
  return {
    ok: true,
    json: async () => ({ object: `${body.execId}/plan.json` })
  };
});

vi.mock('node-fetch', () => ({
  __esModule: true,
  default: fetchStub
}));
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
          if (nodes.supervisor) {
            current = await nodes.supervisor(current);
          }
          const next = conditional ? conditional(current) : END;
          if (typeof next === 'string' && nodes[next]) {
            current = await nodes[next](current);
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

let app: Express;
let upsertExecution: MockedFunction<DbModule['upsertExecution']>;
let publish: MockedFunction<EventsModule['publish']>;

beforeAll(async () => {
  ({ app } = await import('../server'));
  const dbModule = await import('@autonomous/shared/src/db');
  const eventsModule = await import('@autonomous/shared/src/events');
  upsertExecution = vi.mocked(dbModule.upsertExecution);
  publish = vi.mocked(eventsModule.publish);
});

beforeEach(() => {
  invokeMock.mockClear();
  fetchStub.mockClear();
  upsertExecution.mockReset();
  upsertExecution.mockResolvedValue(undefined as unknown as void);
  publish.mockReset();
  publish.mockResolvedValue(undefined as unknown as void);
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
    expect(upsertExecution).toHaveBeenCalledWith('exec-1', 'planning', 'Build', 'mca');
    expect(publish).toHaveBeenCalledWith('exec-1', 'status', { status: 'planning' });
    expect(publish).toHaveBeenCalledWith('exec-1', 'agent', { agent: 'planner', status: 'working' });
    expect(fetchStub).toHaveBeenCalledWith(expect.stringContaining('/plan'), expect.objectContaining({ method: 'POST' }));
    expect(invokeMock).toHaveBeenCalledWith(
      expect.objectContaining({ execId: 'exec-1', intent: 'Build', status: 'planned' }),
      { configurable: { thread_id: 'exec-1' } }
    );
  });
});
