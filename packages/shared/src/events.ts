import { Redis } from 'ioredis';
import { env } from './env';
import { createLogger } from './logger';

const log = createLogger('shared:events');

// Backoff window tracking for rate-limited error logs
let currentBackoffMs = 1000; // starts at 1s, grows with retry strategy
let lastErrorLogAt = 0;

const redisOptions = {
  // Exponential backoff with cap at 30s; cache delay for logging window
  retryStrategy(times: number) {
    const delay = Math.min(1000 * 2 ** times, 30000);
    currentBackoffMs = delay;
    return delay;
  },
  // Reconnect on known transient errors
  reconnectOnError(err: Error) {
    const m = err.message || '';
    return m.includes('READONLY') || m.includes('ECONNRESET') || m.includes('EPIPE');
  }
} as const;

// Pub/Sub for SSE via Redis
export const redisPub = new Redis(env.REDIS_URL, redisOptions);
export const redisSub = new Redis(env.REDIS_URL, redisOptions);

function attachErrorLogging(name: 'pub' | 'sub', client: Redis) {
  client.on('error', (err: unknown) => {
    const now = Date.now();
    if (now - lastErrorLogAt >= currentBackoffMs) {
      lastErrorLogAt = now;
      log.error({ err, client: name, backoffMs: currentBackoffMs }, 'Redis client error');
    }
  });
}

attachErrorLogging('pub', redisPub);
attachErrorLogging('sub', redisSub);

export function execChannel(execId: string) {
  return `exec:${execId}`;
}

export type SSEMessage = { event: string; data: unknown; ts: number };

export async function publish(execId: string, event: string, data: unknown) {
  const payload = JSON.stringify({ event, data, ts: Date.now() } satisfies SSEMessage);
  try {
    await redisPub.publish(execChannel(execId), payload);
  } catch (err) {
    log.warn({ err, execId, event }, 'Failed to publish SSE message');
    throw err; // do not silently swallow publish errors
  }
}

export async function subscribe(execId: string, onMessage: (msg: SSEMessage) => void) {
  const ch = execChannel(execId);
  try {
    await redisSub.subscribe(ch);
  } catch (err) {
    log.warn({ err, execId, channel: ch }, 'Failed to subscribe to channel');
    throw err; // do not silently swallow subscribe errors
  }
  const handler = (channel: string, message: string) => {
    if (channel === ch) {
      try {
        onMessage(JSON.parse(message) as SSEMessage);
      } catch (err) {
        // Malformed payloads should not crash subscriber; log at debug level
        log.debug({ err, channel }, 'Failed to parse SSE message payload');
      }
    }
  };
  redisSub.on('message', handler);
  return () => {
    redisSub.removeListener('message', handler);
    // best-effort; caller does not await
    void redisSub.unsubscribe(ch);
  };
}
