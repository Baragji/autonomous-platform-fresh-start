import { Redis } from 'ioredis';
import { env } from './env';

// Pub/Sub for SSE via Redis
export const redisPub = new Redis(env.REDIS_URL);
export const redisSub = new Redis(env.REDIS_URL);

export function execChannel(execId: string) {
  return `exec:${execId}`;
}

export async function publish(execId: string, event: string, data: any) {
  const payload = JSON.stringify({ event, data, ts: Date.now() });
  await redisPub.publish(execChannel(execId), payload);
}

export async function subscribe(execId: string, onMessage: (msg: { event: string; data: any; ts: number }) => void) {
  const ch = execChannel(execId);
  await redisSub.subscribe(ch);
  const handler = (channel: string, message: string) => {
    if (channel === ch) {
      try { onMessage(JSON.parse(message)); } catch {}
    }
  };
  redisSub.on('message', handler);
  return () => {
    redisSub.removeListener('message', handler);
    redisSub.unsubscribe(ch);
  };
}

