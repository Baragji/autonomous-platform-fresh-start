import { Redis } from 'ioredis';
import { env } from './env';
import { createLogger, getActiveTraceIds } from './logger';

const log = createLogger('shared:events');

// Backoff window tracking for rate-limited error logs
let currentBackoffMs = 1000; // starts at 1s, grows with retry strategy
let lastErrorLogAt = 0;

const redisOptions = {
  // Avoid connecting before we attach error listeners; commands (publish/subscribe) will trigger connect
  lazyConnect: true,
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
      log.error({ err, client: name, backoffMs: currentBackoffMs, ...getActiveTraceIds() }, 'Redis client error');
    }
  });
}

attachErrorLogging('pub', redisPub);
attachErrorLogging('sub', redisSub);

// Proactively connect after listeners are attached to avoid unhandled errors
void redisPub.connect().catch(() => {});
void redisSub.connect().catch(() => {});

export function execChannel(execId: string) {
  return `exec:${execId}`;
}

export type SSEMessage = { event: string; data: unknown; ts: number };

export async function publish(execId: string, event: string, data: unknown) {
  const payload = JSON.stringify({ event, data, ts: Date.now() } satisfies SSEMessage);
  try {
    await redisPub.publish(execChannel(execId), payload);
  } catch (err) {
    log.warn({ err, execId, event, ...getActiveTraceIds() }, 'Failed to publish SSE message');
    throw err; // do not silently swallow publish errors
  }
}

// Publish with trace enrichment so UI can link to traces
export async function publishWithTrace(execId: string, event: string, data: unknown) {
  const { trace_id } = getActiveTraceIds();
  const enriched = { ...(data as Record<string, unknown>), trace_id } as unknown;
  return publish(execId, event, enriched);
}

export async function subscribe(
  execId: string,
  onMessage: (msg: SSEMessage) => void,
  onError?: (err: unknown) => void
) {
  const ch = execChannel(execId);
  // Attach an error forwarder specific to this subscription lifecycle
  const errorHandler = (err: unknown) => {
    if (onError) {
      try {
        onError(err);
      } catch (e) {
        // Avoid throwing from event handlers; just log
        log.debug({ err: e }, 'onError handler threw');
      }
    }
  };
  redisSub.on('error', errorHandler);

  try {
    await redisSub.subscribe(ch);
  } catch (err) {
    log.warn({ err, execId, channel: ch }, 'Failed to subscribe to channel');
    // Remove error handler since subscribe failed and we won't keep the sub
    redisSub.removeListener('error', errorHandler);
    throw err; // propagate to caller
  }

  const messageHandler = (channel: string, message: string) => {
    if (channel === ch) {
      try {
        onMessage(JSON.parse(message) as SSEMessage);
      } catch (err) {
        // Malformed payloads should not crash subscriber; log at debug level
        log.debug({ err, channel }, 'Failed to parse SSE message payload');
      }
    }
  };
  redisSub.on('message', messageHandler);

  return () => {
    redisSub.removeListener('message', messageHandler);
    redisSub.removeListener('error', errorHandler);
    // best-effort; caller does not await
    void redisSub.unsubscribe(ch);
  };
}
