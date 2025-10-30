import { describe, it, expect } from 'vitest';
import http from 'http';
import { registerShutdown } from '../shutdown';

class MockRedis {
  public called = false;
  async quit() { this.called = true; }
}

class MockDb {
  public called = false;
  async end() { this.called = true; }
}

describe('registerShutdown', () => {
  it('closes server, quits redis, and ends db without exiting process', async () => {
    const server = http.createServer((_req, res) => { res.statusCode = 200; res.end('ok'); });
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));

    const redis1 = new MockRedis();
    const redis2 = new MockRedis();
    const db = new MockDb();

    const logger = { info: () => {}, error: () => {} } as const;
    const { shutdown } = registerShutdown({ server, redisClients: [redis1, redis2], db, logger, exit: false, timeoutMs: 2000 });

    await shutdown('TEST');

    expect(server.listening).toBe(false);
    expect(redis1.called).toBe(true);
    expect(redis2.called).toBe(true);
    expect(db.called).toBe(true);
  });
});