import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createLogger } from './logger';

// Load local .env (package CWD)
dotenv.config();
// Also try repo root .env (three levels up from shared/src)
try {
  const rootEnv = path.resolve(__dirname, '../../..', '.env');
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  }
} catch {}

export const env = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://umca:umcapassword@localhost:5433/umca',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6380',
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || 'minioadmin123',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
  LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY || '',
  LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY || '',
  LANGFUSE_HOST: process.env.LANGFUSE_HOST || undefined
};

if (process.env.NODE_ENV === 'production') {
  const logger = createLogger('env');
  const fail = (reason: string) => {
    logger.fatal({ reason }, 'production environment validation failed');
    process.exit(1);
  };

  if (!env.OPENAI_API_KEY) {
    fail('OPENAI_API_KEY missing');
  }

  const weakDefaults: string[] = [];
  if (env.DATABASE_URL.includes('umcapassword')) {
    weakDefaults.push('DATABASE_URL');
  }
  if (env.MINIO_ACCESS_KEY === 'minioadmin') {
    weakDefaults.push('MINIO_ACCESS_KEY');
  }
  if (['minioadmin', 'minioadmin123'].includes(env.MINIO_SECRET_KEY)) {
    weakDefaults.push('MINIO_SECRET_KEY');
  }

  if (weakDefaults.length > 0) {
    fail(`Weak defaults detected: ${weakDefaults.join(', ')}`);
  }
}
