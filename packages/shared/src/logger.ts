import pino, { type Logger as PinoLogger } from 'pino';
import type { Request, Response, NextFunction } from 'express';
import { context, trace } from '@opentelemetry/api';

export type Logger = PinoLogger;

// Create a structured JSON logger for a given service
export function createLogger(service: string): Logger {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL || 'info',
    base: { service }
  });
}

// Helper to fetch current trace/span ids from active OTEL context
export function getActiveTraceIds(): { trace_id?: string; span_id?: string } {
  const span = trace.getSpan(context.active());
  // spanContext is a method on SDK spans; optional chaining in case unavailable
  const spanCtx = (span as unknown as { spanContext?: () => { traceId: string; spanId: string } } | undefined)?.spanContext?.();
  return spanCtx ? { trace_id: spanCtx.traceId, span_id: spanCtx.spanId } : {};
}

// Express middleware to log request/response with trace correlation
export function createHttpLogger(logger: Logger) {
  return function httpLogger(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const { trace_id, span_id } = getActiveTraceIds();
      logger.info({
        msg: 'http',
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration_ms: durationMs,
        trace_id,
        span_id
      });
    });
    next();
  };
}
