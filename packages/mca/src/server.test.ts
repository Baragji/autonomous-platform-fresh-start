import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './server';

describe('mca server', () => {
  it('400 on missing fields', async () => {
    const res = await request(app).post('/start').send({});
    expect(res.status).toBe(400);
  });
});

