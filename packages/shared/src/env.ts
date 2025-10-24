import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load local .env (package CWD)
dotenv.config();
// Also try repo root .env (three levels up from shared/src)
try {
  const rootEnv = path.resolve(__dirname, '../../..', '.env');
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  }
} catch {}

const WEAK_DEFAULTS = ['umcapassword', 'minioadmin', 'minioadmin123'];

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

// Production environment guards
if (process.env.NODE_ENV === 'production') {
  // Enforce required secrets
  if (!env.OPENAI_API_KEY) {
    // eslint-disable-next-line no-console
    console.error('[FATAL] Production environment requires OPENAI_API_KEY');
    process.exit(1);
  }

  // Reject weak defaults
  const hasWeakDefaults = [
    env.DATABASE_URL,
    env.MINIO_ACCESS_KEY,
    env.MINIO_SECRET_KEY
  ].some(val => WEAK_DEFAULTS.some(weak => val.includes(weak)));

  if (hasWeakDefaults) {
    // eslint-disable-next-line no-console
    console.error('[FATAL] Production environment detected weak default credentials (umcapassword, minioadmin)');
    process.exit(1);
  }
}
