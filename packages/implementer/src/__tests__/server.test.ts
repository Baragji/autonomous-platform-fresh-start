import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../agent', () => {
  class MockAgent { async run() { return { ok: true, files: ['src/app.ts'] }; } }
  return { ImplementerAgent: MockAgent };
});

const listFilesMock = vi.fn(async () => []);

vi.mock('@autonomous/shared/src/vfs', () => ({
  createVfs: vi.fn(async () => ({
    writeFile: async () => {},
    readFile: async () => Buffer.from('x'),
    listFiles: listFilesMock,
    listVersions: async () => []
  }))
}));

vi.mock('@autonomous/shared/src/langfuse', () => ({ getLangfuse: () => null }));

describe('implementer server', () => {
  let app: import('express').Express;
  beforeEach(async () => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = 'test-key';
    const mod = await import('../server');
    app = mod.app;
    listFilesMock.mockClear();
  });

  it('returns 200 for valid request', async () => {
    const plan = { tasks: [{ id: '1', title: 'a', description: 'a' }, { id: '2', title: 'b', description: 'b' }], acceptance_criteria: ['x'] };
    const res = await request(app).post('/implement').send({ execId: 'e1', plan });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.files).toContain('src/app.ts');
  });

  it('400 on invalid body', async () => {
    const res = await request(app).post('/implement').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid request');
  });

  it('500 when agent throws', async () => {
    vi.resetModules();
    vi.doMock('../agent', () => {
      class BadAgent { async run() { throw new Error('boom'); } }
      return { ImplementerAgent: BadAgent };
    });
    const mod = await import('../server');
    const badApp = mod.app;
    const plan = { tasks: [{ id: '1', title: 'a', description: 'a' }, { id: '2', title: 'b', description: 'b' }], acceptance_criteria: ['x'] };
    const res = await request(badApp).post('/implement').send({ execId: 'e2', plan });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('boom');
  });

  it('reports healthy when dependencies succeed', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, checks: { minio: true, openaiKey: true } });
    expect(listFilesMock).toHaveBeenCalled();
  });

  it('returns 503 when OPENAI_API_KEY is missing', async () => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = '';
    const envModule = await import('@autonomous/shared/src/env');
    const originalKey = envModule.env.OPENAI_API_KEY;
    envModule.env.OPENAI_API_KEY = '';

    const mod = await import('../server');
    const unhealthyApp = mod.app;

    const res = await request(unhealthyApp).get('/healthz');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, checks: { minio: true, openaiKey: false } });

    envModule.env.OPENAI_API_KEY = originalKey || 'test-key';
    process.env.OPENAI_API_KEY = 'test-key';
  });
});
