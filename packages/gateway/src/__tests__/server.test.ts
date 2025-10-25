import request from 'supertest';
import { EventEmitter } from 'events';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express, Request, Response } from 'express';
import type { MockedFunction } from 'vitest';
type DbModule = typeof import('@autonomous/shared/src/db');
type EventsModule = typeof import('@autonomous/shared/src/events');

vi.mock('@autonomous/shared/src/db', () => ({
  upsertExecution: vi.fn(),
  getExecution: vi.fn(),
  pool: {
    query: vi.fn()
  }
}));

vi.mock('@autonomous/shared/src/events', () => ({
  publish: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(() => {}),
  redisPub: { ping: vi.fn().mockResolvedValue('PONG') },
  redisSub: { ping: vi.fn().mockResolvedValue('PONG') }
}));

let app: Express;
let upsertExecution: MockedFunction<DbModule['upsertExecution']>;
let getExecution: MockedFunction<DbModule['getExecution']>;
let publish: MockedFunction<EventsModule['publish']>;
let subscribe: MockedFunction<EventsModule['subscribe']>;
let poolQuery: MockedFunction<DbModule['pool']['query']>;
let redisPubPing: MockedFunction<EventsModule['redisPub']['ping']>;
let redisSubPing: MockedFunction<EventsModule['redisSub']['ping']>;
const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

beforeAll(async () => {
  ({ app } = await import('../server'));
  const dbModule = await import('@autonomous/shared/src/db');
  const eventsModule = await import('@autonomous/shared/src/events');
  upsertExecution = vi.mocked(dbModule.upsertExecution);
  getExecution = vi.mocked(dbModule.getExecution);
  poolQuery = vi.mocked(dbModule.pool.query);
  publish = vi.mocked(eventsModule.publish);
  subscribe = vi.mocked(eventsModule.subscribe);
  redisPubPing = vi.mocked(eventsModule.redisPub.ping);
  redisSubPing = vi.mocked(eventsModule.redisSub.ping);
});

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  upsertExecution.mockResolvedValue(undefined as unknown as void);
  getExecution.mockResolvedValue({ id: 'abc', status: 'planned' } as unknown as Record<string, unknown>);
  publish.mockResolvedValue(undefined as unknown as void);
  subscribe.mockReset();
  subscribe.mockResolvedValue(() => {});
  poolQuery.mockResolvedValue({} as never);
  redisPubPing.mockResolvedValue('PONG');
  redisSubPing.mockResolvedValue('PONG');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('gateway server', () => {
  it('rejects missing intent', async () => {
    const res = await request(app).post('/api/executions').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'intent required' });
    expect(upsertExecution).not.toHaveBeenCalled();
  });

  it('returns 404 when execution not found', async () => {
    getExecution.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/executions/unknown');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('accepts execution and triggers MCA', async () => {
    const res = await request(app).post('/api/executions').send({ intent: 'Build something' });
    expect(res.status).toBe(202);
    expect(res.headers.location).toMatch(/\/api\/executions\//);
    expect(res.body).toHaveProperty('id');
    expect(res.body.location).toBe(res.headers.location);

    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchMock).toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(expect.any(String), 'status', { status: 'accepted' });
  });

  it('streams SSE updates and cleans up on close', async () => {
    const writes: string[] = [];
    subscribe.mockImplementation(async (_id, handler) => {
      handler({ event: 'status', data: { ok: true }, ts: Date.now() });
      return () => {};
    });

    const stack = (app as unknown as { _router: { stack: Array<{ route?: { path: string; stack: Array<{ handle: unknown }> } }> } })._router.stack;
    const layer = stack.find((l) => l.route?.path === '/api/executions/:id/stream');
    expect(layer).toBeDefined();
    const handler = layer!.route!.stack[0].handle as (req: Request, res: Response) => Promise<void>;

    const req = new EventEmitter() as Request & { params: Record<string, string> };
    req.params = { id: 'exec-42' };

    const resHeaders: Record<string, string> = {};
    const res = {
      setHeader: (key: string, value: string) => {
        resHeaders[key] = value;
      },
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: vi.fn()
    } as unknown as Response;

    await handler(req, res);
    expect(resHeaders['Content-Type']).toBe('text/event-stream');
    expect(resHeaders['Cache-Control']).toBe('no-cache');
    expect(resHeaders['Connection']).toBe('keep-alive');
    expect(res.write).toHaveBeenCalled();
    expect(writes.join('')).toContain('event: status');

    req.emit('close');
    expect(res.end).toHaveBeenCalled();
  });

  it('exposes healthz endpoint', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, checks: { db: true, redisPub: true, redisSub: true } });
    expect(poolQuery).toHaveBeenCalledWith('SELECT 1');
    expect(redisPubPing).toHaveBeenCalled();
    expect(redisSubPing).toHaveBeenCalled();
  });

  it('returns 503 when a dependency check fails', async () => {
    poolQuery.mockRejectedValueOnce(new Error('db down'));
    redisPubPing.mockRejectedValueOnce(new Error('redis pub down'));
    redisSubPing.mockRejectedValueOnce(new Error('redis sub down'));

    const res = await request(app).get('/healthz');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, checks: { db: false, redisPub: false, redisSub: false } });
    expect(poolQuery).toHaveBeenCalledWith('SELECT 1');
    expect(redisPubPing).toHaveBeenCalled();
    expect(redisSubPing).toHaveBeenCalled();
  });
});
