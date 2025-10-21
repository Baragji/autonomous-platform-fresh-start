import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './server';

describe('gateway server', () => {
  it('rejects missing intent', async () => {
    const res = await request(app).post('/api/executions').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for missing execution status', async () => {
    const res = await request(app).get('/api/executions/non-existent-id');
    expect(res.status).toBe(404);
  });
});
