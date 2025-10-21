import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './server';

describe('planner server', () => {
  it('400 on missing fields', async () => {
    const res = await request(app).post('/plan').send({});
    expect(res.status).toBe(400);
  });
});

