import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RedisMocks = {
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

const redisInstances: RedisMocks[] = [];

vi.mock('ioredis', () => ({
  Redis: class {
    publish = vi.fn().mockResolvedValue(1);
    subscribe = vi.fn().mockResolvedValue(1);
    unsubscribe = vi.fn().mockResolvedValue(1);
    removeListener = vi.fn();
    on = vi.fn();

    constructor() {
      redisInstances.push({
        publish: this.publish,
        subscribe: this.subscribe,
        unsubscribe: this.unsubscribe,
        removeListener: this.removeListener,
        on: this.on
      });
    }
  }
}));

let events: typeof import('../events');

beforeEach(async () => {
  redisInstances.length = 0;
  vi.resetModules();
  events = await import('../events');
});

afterEach(() => {
  redisInstances.length = 0;
});

describe('events helpers', () => {
  it('builds execution channel', () => {
    expect(events.execChannel('abc')).toBe('exec:abc');
  });

  it('publishes messages via redis', async () => {
    const [pub] = redisInstances;
    await events.publish('abc', 'status', { ok: true });
    expect(pub.publish).toHaveBeenCalledWith('exec:abc', expect.stringContaining('"event":"status"'));
  });

  it('subscribes and returns cleanup handler', async () => {
    const [, subInstance] = redisInstances;
    const messages: unknown[] = [];
    const unsub = await events.subscribe('abc', (msg) => messages.push(msg));
    expect(subInstance.subscribe).toHaveBeenCalledWith('exec:abc');
    expect(subInstance.on).toHaveBeenCalledWith('message', expect.any(Function));

    const handler = subInstance.on.mock.calls[0][1] as (channel: string, payload: string) => void;
    handler('exec:abc', JSON.stringify({ event: 'test', data: { foo: 'bar' }, ts: 1 }));
    expect(messages).toEqual([{ event: 'test', data: { foo: 'bar' }, ts: 1 }]);

    unsub();
    expect(subInstance.removeListener).toHaveBeenCalled();
    expect(subInstance.unsubscribe).toHaveBeenCalledWith('exec:abc');
  });
});
