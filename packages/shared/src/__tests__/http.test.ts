import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchWithTimeout } from '../http';

// Helper to create AbortError similar to what fetch would throw
function createAbortError(): Error {
  try {
    const DomEx = (globalThis as unknown as { DOMException?: new (message?: string, name?: string) => Error }).DOMException;
    if (DomEx) return new DomEx('Aborted', 'AbortError');
  } catch {
    // ignore
  }
  const e = new Error('Aborted');
  (e as unknown as { name: string }).name = 'AbortError';
  return e;
}

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('aborts and retries on timeout, then throws after max retries', async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal: AbortSignal | undefined = init?.signal as AbortSignal | undefined;
        if (signal?.aborted) {
          reject(createAbortError());
          return;
        }
        signal?.addEventListener('abort', () => reject(createAbortError()), { once: true });
        // never resolve; rely on abort
      });
    });
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    await expect(fetchWithTimeout('http://example.local/test', {}, { timeoutMs: 10, retries: 1, retryDelayBaseMs: 1, retryJitterMs: 0 }))
      .rejects.toThrow(/Aborted|AbortError/);
    // 2 attempts (initial + 1 retry)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on retryable status and eventually succeeds', async () => {
    const first = new Response('retry', { status: 503 });
    const ok = new Response('ok', { status: 200 });
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(ok);
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    const res = await fetchWithTimeout('http://example.local/retry', {}, { timeoutMs: 100, retries: 2, retryDelayBaseMs: 1, retryJitterMs: 0 });
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns immediately on non-retryable status', async () => {
    const notFound = new Response('nope', { status: 404 });
    const mockFetch = vi.fn().mockResolvedValueOnce(notFound);
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    const res = await fetchWithTimeout('http://example.local/404', {}, { timeoutMs: 100, retries: 3, retryDelayBaseMs: 1, retryJitterMs: 0 });
    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});