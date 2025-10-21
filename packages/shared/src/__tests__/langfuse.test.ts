import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ctor = vi.fn();

vi.mock('langfuse', () => ({
  Langfuse: vi.fn().mockImplementation((opts) => {
    ctor(opts);
    return { trace: vi.fn(() => ({ generation: vi.fn(), flush: vi.fn() })) };
  })
}));

describe('getLangfuse', () => {
  beforeEach(() => {
    vi.resetModules();
    ctor.mockReset();
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_HOST;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns null when keys missing', async () => {
    const { getLangfuse } = await import('../langfuse');
    expect(getLangfuse()).toBeNull();
    expect(ctor).not.toHaveBeenCalled();
  });

  it('creates client when keys provided', async () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pub';
    process.env.LANGFUSE_SECRET_KEY = 'sec';
    process.env.LANGFUSE_HOST = 'https://cloud.langfuse.com';
    const { getLangfuse } = await import('../langfuse');
    const client = getLangfuse();
    expect(client).not.toBeNull();
    expect(ctor).toHaveBeenCalledWith({
      publicKey: 'pub',
      secretKey: 'sec',
      baseUrl: 'https://cloud.langfuse.com'
    });
  });
});
