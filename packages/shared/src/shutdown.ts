import type { Server } from 'http';

export type QuitLike = { quit: () => Promise<unknown> | unknown };
export type EndLike = { end: () => Promise<unknown> | unknown };

export type RegisterShutdownOptions = {
  server: Server;
  redisClients?: QuitLike[];
  db?: EndLike | EndLike[];
  extra?: Array<() => Promise<void> | void>;
  logger?: { info?: (...args: unknown[]) => unknown; error?: (...args: unknown[]) => unknown };
  exit?: boolean; // default true; set false for tests
  timeoutMs?: number; // default 15000
};

/**
 * Registers graceful shutdown handlers for SIGINT/SIGTERM.
 * - Closes HTTP server first to stop accepting new connections
 * - Then quits Redis clients and ends DB pools (if provided)
 * - Runs optional extra cleanup callbacks
 * - Optionally exits the process (default true)
 */
export function registerShutdown(opts: RegisterShutdownOptions) {
  const {
    server,
    redisClients = [],
    db,
    extra = [],
    logger = {},
    exit = true,
    timeoutMs = 15000
  } = opts;

  let shuttingDown = false;

  const closeServer = () =>
    new Promise<void>((resolve, reject) => {
      // Enforce timeout to avoid hanging forever
      const timer = setTimeout(() => reject(new Error('server.close timeout')), timeoutMs);
      server.close((err?: Error) => {
        clearTimeout(timer);
        if (err) return reject(err);
        resolve();
      });
    });

  const quitRedis = async () => {
    for (const client of redisClients) {
      try { await client.quit(); } catch {}
    }
  };

  const closeDb = async () => {
    const dbs = Array.isArray(db) ? db : (db ? [db] : []);
    for (const d of dbs) {
      try { await d.end(); } catch {}
    }
  };

  const runExtra = async () => {
    for (const fn of extra) {
      try { await fn(); } catch {}
    }
  };

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      logger.info?.({ signal }, 'graceful shutdown start');
      await closeServer();
      await quitRedis();
      await closeDb();
      await runExtra();
      logger.info?.('graceful shutdown complete');
      if (exit) process.exit(0);
    } catch (err) {
      logger.error?.({ err: (err as Error).message }, 'graceful shutdown error');
      if (exit) process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  return { shutdown };
}