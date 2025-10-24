import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';

describe('env production guards', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.resetModules();
  });

  it('should not fail in non-production environment', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.OPENAI_API_KEY;
    const envImport = import('../env');
    await expect(envImport).resolves.toBeDefined();
  });

  it('should fail in production without OPENAI_API_KEY', async () => {
    return new Promise<void>((resolve) => {
      const testScript = path.resolve(__dirname, '../env.ts');
      const proc = spawn('node', ['--import', 'tsx/esm', '--eval', 
        `process.env.NODE_ENV='production'; delete process.env.OPENAI_API_KEY; await import('${testScript}')`
      ], {
        env: { ...process.env, NODE_ENV: 'production', OPENAI_API_KEY: '' },
        stdio: 'pipe'
      });

      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        expect(code).toBe(1);
        expect(stderr).toContain('OPENAI_API_KEY');
        resolve();
      });
    });
  });

  it('should fail in production with weak defaults', async () => {
    return new Promise<void>((resolve) => {
      const testScript = path.resolve(__dirname, '../env.ts');
      const proc = spawn('node', ['--import', 'tsx/esm', '--eval',
        `process.env.NODE_ENV='production'; process.env.OPENAI_API_KEY='sk-test'; process.env.DATABASE_URL='postgresql://umca:umcapassword@localhost:5433/umca'; await import('${testScript}')`
      ], {
        env: { 
          ...process.env, 
          NODE_ENV: 'production', 
          OPENAI_API_KEY: 'sk-test',
          DATABASE_URL: 'postgresql://umca:umcapassword@localhost:5433/umca'
        },
        stdio: 'pipe'
      });

      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        expect(code).toBe(1);
        expect(stderr).toContain('weak default');
        resolve();
      });
    });
  });

  it('should succeed in production with valid secrets', async () => {
    return new Promise<void>((resolve) => {
      const testScript = path.resolve(__dirname, '../env.ts');
      const proc = spawn('node', ['--import', 'tsx/esm', '--eval',
        `process.env.NODE_ENV='production'; process.env.OPENAI_API_KEY='sk-valid-key-12345'; process.env.DATABASE_URL='postgresql://user:strongpass@localhost:5433/db'; process.env.MINIO_ACCESS_KEY='validkey'; process.env.MINIO_SECRET_KEY='validsecretsecret'; await import('${testScript}'); process.exit(0);`
      ], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          OPENAI_API_KEY: 'sk-valid-key-12345',
          DATABASE_URL: 'postgresql://user:strongpass@localhost:5433/db',
          MINIO_ACCESS_KEY: 'validkey',
          MINIO_SECRET_KEY: 'validsecretsecret'
        },
        stdio: 'pipe'
      });

      proc.on('close', (code) => {
        expect(code).toBe(0);
        resolve();
      });
    });
  });
});
