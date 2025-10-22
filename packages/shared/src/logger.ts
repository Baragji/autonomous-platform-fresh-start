import pino, { type Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

export function createLogger(service: string): Logger {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL || 'info',
    base: { service }
  });
}
