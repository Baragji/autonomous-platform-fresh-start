import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fatalMock = vi.fn();

vi.mock('../logger', () => ({
  createLogger: vi.fn(() => ({
    fatal: fatalMock
  }))
}));

const originalEnv = { ...process.env };

describe('env production guards', () => {
  beforeEach(() => {
    vi.resetModules();
    fatalMock.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('exits when OPENAI_API_KEY missing in production', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      OPENAI_API_KEY: '',
      DATABASE_URL: 'postgresql://user:secure@localhost:5432/app',
      MINIO_ACCESS_KEY: 'securekey',
      MINIO_SECRET_KEY: 'securesecret'
    };
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    await expect(import('../env')).rejects.toThrow('exit 1');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fatalMock).toHaveBeenCalledWith(
      { reason: 'OPENAI_API_KEY missing' },
      'production environment validation failed'
    );
  });

  it('exits when weak defaults detected', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      OPENAI_API_KEY: 'key',
      DATABASE_URL: 'postgresql://umca:umcapassword@localhost:5433/umca',
      MINIO_ACCESS_KEY: 'minioadmin',
      MINIO_SECRET_KEY: 'minioadmin123'
    };
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    await expect(import('../env')).rejects.toThrow('exit 1');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fatalMock).toHaveBeenCalledWith(
      { reason: expect.stringContaining('Weak defaults detected') },
      'production environment validation failed'
    );
  });

  it('allows production when secrets are strong', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      OPENAI_API_KEY: 'sk-strong',
      DATABASE_URL: 'postgresql://user:securepass@db:5432/app',
      MINIO_ACCESS_KEY: 'strongkey',
      MINIO_SECRET_KEY: 'strongsecret'
    };
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const mod = await import('../env');
    expect(mod.env.OPENAI_API_KEY).toBe('sk-strong');
    expect(exitSpy).not.toHaveBeenCalled();
    expect(fatalMock).not.toHaveBeenCalled();
  });
});
