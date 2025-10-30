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

// Mock logger used by events module for deterministic assertions
const loggerMock = {
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
};
vi.mock('../logger', () => ({
  createLogger: () => loggerMock
}));

let events: typeof import('../events');

beforeEach(async () => {
  redisInstances.length = 0;
  vi.resetModules();
  events = await import('../events');
});

afterEach(() => {
  redisInstances.length = 0;
  loggerMock.error.mockReset();
  loggerMock.warn.mockReset();
  loggerMock.debug.mockReset();
});

describe('events helpers', () => {
  it('builds execution channel', () => {
    expect(events.execChannel('abc')).toBe('exec:abc');
  });

  it('attaches error listeners to pub and sub clients', () => {
    const [pubInstance, subInstance] = redisInstances;
    expect(pubInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(subInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('throttles error logs within backoff window', () => {
    const [pubInstance] = redisInstances;
    // Find the attached error handler
    const errorCall = pubInstance.on.mock.calls.find(([evt]) => evt === 'error') as [string, (err: unknown) => void] | undefined;
    expect(errorCall).toBeTruthy();
    const errorHandler = errorCall![1];

    // Spy on Date.now to control time progression
    const nowSpy = vi.spyOn(Date, 'now');
    // Start at 1000ms so first error passes (1000 - 0 >= 1000)
    nowSpy.mockReturnValue(1000);

    // First error should log
    errorHandler(new Error('ECONNRESET'));
    expect(loggerMock.error).toHaveBeenCalledTimes(1);

    // Within initial backoff (1s), next error should NOT log
    nowSpy.mockReturnValue(1500);
    errorHandler(new Error('ECONNRESET'));
    expect(loggerMock.error).toHaveBeenCalledTimes(1);

    // Advance beyond backoff window → should log again
    nowSpy.mockReturnValue(2100);
    errorHandler(new Error('ECONNRESET'));
    expect(loggerMock.error).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
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

    const messageCall = subInstance.on.mock.calls.find(([event]) => event === 'message') as [string, (channel: string, payload: string) => void] | undefined;
    expect(messageCall).toBeTruthy();
    const handler = messageCall![1];
    handler('exec:abc', JSON.stringify({ event: 'test', data: { foo: 'bar' }, ts: 1 }));
    expect(messages).toEqual([{ event: 'test', data: { foo: 'bar' }, ts: 1 }]);

    unsub();
    expect(subInstance.removeListener).toHaveBeenCalled();
    expect(subInstance.unsubscribe).toHaveBeenCalledWith('exec:abc');
  });
});
