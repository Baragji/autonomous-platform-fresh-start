import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

function runGuard(env: Record<string, string | undefined>) {
  const entry = './packages/shared/dist/packages/shared/src/env.js';
  const r = spawnSync('node', ['-e', `require('${entry}')`], { env: { ...process.env, ...env }, encoding: 'utf-8' });
  return { exitCode: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function main() {
  const outDir = path.resolve('.automation', 'evidence');
  ensureDir(outDir);

  const bad = runGuard({ NODE_ENV: 'production', OPENAI_API_KEY: '', DATABASE_URL: 'postgresql://umca:umcapassword@localhost:5433/umca', MINIO_ACCESS_KEY: 'minioadmin', MINIO_SECRET_KEY: 'minioadmin' });
  const good = runGuard({ NODE_ENV: 'production', OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-secure-1234567890', DATABASE_URL: 'postgresql://umca:StrongPass123!@localhost:5433/umca', MINIO_ACCESS_KEY: 'strongaccesskey123456', MINIO_SECRET_KEY: 'strongsecretkey1234567890', LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk' });
  const payload = { timestamp_utc: 'STATIC', fail_run: { exitCode: bad.exitCode, stdout: bad.stdout, stderr: bad.stderr }, pass_run: { exitCode: good.exitCode, stdout: good.stdout, stderr: good.stderr } };
  fs.writeFileSync(path.join(outDir, 'prod_env_guard.json'), JSON.stringify(payload, null, 2));
}

main();
