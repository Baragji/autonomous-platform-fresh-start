import { createLogger } from './logger';
import { context, propagation } from '@opentelemetry/api';

export type FetchRetryOptions = {
  timeoutMs?: number; // timeout per attempt
  retries?: number; // number of additional attempts after the first
  retryDelayBaseMs?: number; // base backoff in ms
  retryJitterMs?: number; // max jitter added to backoff
  // HTTP status codes that should be retried
  retryOnStatuses?: number[];
};

const defaultOptions: Required<FetchRetryOptions> = {
  timeoutMs: 5000,
  retries: 2,
  retryDelayBaseMs: 200,
  retryJitterMs: 150,
  retryOnStatuses: [408, 425, 429, 500, 502, 503, 504],
};

const httpLogger = createLogger('shared:http');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Create a signal that aborts when any of the provided signals aborts
function anySignal(signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const valid = signals.filter((s): s is AbortSignal => !!s);
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  const controller = new AbortController();
  for (const s of valid) {
    if (s.aborted) {
      controller.abort();
      return controller.signal;
    }
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

// Inject W3C Trace Context headers into a RequestInit
export function withTraceHeaders(init: RequestInit = {}): RequestInit {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  const headers = new Headers(init.headers as HeadersInit | undefined);
  for (const [k, v] of Object.entries(carrier)) headers.set(k, v);
  return { ...init, headers };
}

type AbortSignalWithTimeout = typeof AbortSignal & { timeout: (ms: number) => AbortSignal };

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchRetryOptions = {}
): Promise<Response> {
  const opts = { ...defaultOptions, ...options };

  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const attemptLabel = `${attempt + 1}/${opts.retries + 1}`;
    // Create a timeout signal per attempt
    const AbortSignalT = AbortSignal as unknown as AbortSignalWithTimeout;
    const timeoutSignal = opts.timeoutMs > 0 && typeof AbortSignalT.timeout === 'function' ? AbortSignalT.timeout(opts.timeoutMs) : undefined;
    const signal = anySignal([init.signal as AbortSignal | undefined, timeoutSignal]);

    try {
      const res = await fetch(input as RequestInfo, { ...init, signal });
      if (res.ok) return res;

      if (!opts.retryOnStatuses.includes(res.status) || attempt === opts.retries) {
        return res; // return non-ok response if not retryable or out of retries
      }

      const delay = opts.retryDelayBaseMs * Math.pow(2, attempt) + Math.floor(Math.random() * opts.retryJitterMs);
      httpLogger.warn({ url: String(input), status: res.status, attempt: attemptLabel, delay }, 'retrying fetch due to HTTP status');
      await sleep(delay);
      continue;
    } catch (err) {
      lastError = err;
      // AbortErrors and network errors should be retried up to limit
      if (attempt === opts.retries) {
        throw err;
      }
      const delay = opts.retryDelayBaseMs * Math.pow(2, attempt) + Math.floor(Math.random() * opts.retryJitterMs);
      httpLogger.warn({ url: String(input), err: (err as Error).message, attempt: attemptLabel, delay }, 'retrying fetch due to error');
      await sleep(delay);
      continue;
    }
  }
  // Should not reach here; throw last error for safety
  throw lastError instanceof Error ? lastError : new Error('fetchWithTimeout failed');
}