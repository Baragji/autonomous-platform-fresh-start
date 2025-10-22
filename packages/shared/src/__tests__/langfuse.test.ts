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
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns null when keys missing', async () => {
    vi.doMock('../env', () => ({
      env: {
        LANGFUSE_PUBLIC_KEY: '',
        LANGFUSE_SECRET_KEY: '',
        LANGFUSE_HOST: undefined
      }
    }));
    const { getLangfuse } = await import('../langfuse');
    expect(getLangfuse()).toBeNull();
    expect(ctor).not.toHaveBeenCalled();
  });

  it('creates client when keys provided', async () => {
    vi.doMock('../env', () => ({
      env: {
        LANGFUSE_PUBLIC_KEY: 'pub',
        LANGFUSE_SECRET_KEY: 'sec',
        LANGFUSE_HOST: 'https://cloud.langfuse.com'
      }
    }));
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
