import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type Proc = { name: string; proc: ReturnType<typeof spawn> };
function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForHttp(url: string, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url); if (r.ok || r.status === 503) return; } catch {}
    await sleep(1000);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function main() {
  const outDir = path.resolve('.automation', 'evidence');
  ensureDir(outDir);
  // Best-effort: in local/dev we bring up compose infra. In CI we already have
  // service containers; this will no-op if docker or compose is unavailable.
  try {
    spawnSync('docker', ['compose', '-f', 'infrastructure/docker-compose.yml', 'up', '-d', 'postgres', 'redis', 'minio', 'tempo', 'grafana'], { stdio: 'ignore' });
  } catch {}

  // Ensure shared dist exists before starting services that import it at runtime (runner compat)
  try {
    spawnSync('npm', ['--prefix', 'packages/shared', 'run', 'build'], { stdio: 'ignore' });
  } catch {}
  const env = {
    ...process.env,
    // Prefer CI-provided env; fallback to compose defaults for local dev
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://umca:umcapassword@localhost:5433/umca',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6380',
    MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
    MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || 'minioadmin123',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-local-dummy',
    E2B_API_KEY: process.env.E2B_API_KEY || 'e2b_local_dummy'
  };
  const procs: Proc[] = [
    { name: 'gateway', proc: spawn('npm', ['--prefix', 'packages/gateway', 'run', 'dev'], { env, stdio: 'ignore' }) },
    { name: 'mca', proc: spawn('npm', ['--prefix', 'packages/mca', 'run', 'dev'], { env, stdio: 'ignore' }) },
    { name: 'planner', proc: spawn('npm', ['--prefix', 'packages/planner', 'run', 'dev'], { env, stdio: 'ignore' }) },
    { name: 'implementer', proc: spawn('npm', ['--prefix', 'packages/implementer', 'run', 'dev'], { env, stdio: 'ignore' }) },
    { name: 'runner', proc: spawn('npm', ['--prefix', 'packages/runner', 'run', 'dev'], { env, stdio: 'ignore' }) },
    { name: 'validator', proc: spawn('npm', ['--prefix', 'packages/validator', 'run', 'dev'], { env, stdio: 'ignore' }) }
  ];
  try {
    const targets = [
      { service: 'gateway', url: 'http://localhost:3030/healthz' },
      { service: 'mca', url: 'http://localhost:7010/healthz' },
      { service: 'planner', url: 'http://localhost:7020/healthz' },
      { service: 'implementer', url: 'http://localhost:7030/healthz' },
      { service: 'runner', url: 'http://localhost:7040/healthz' },
      { service: 'validator', url: 'http://localhost:7050/healthz' }
    ];
    for (const t of targets) await waitForHttp(t.url, 120000);
    const results: any[] = []; const ts = 'STATIC';
    for (const t of targets) {
      try { const r = await fetch(t.url); const body = await r.text(); let json: unknown = null; try { json = JSON.parse(body); } catch { json = { raw: body }; } results.push({ service: t.service, url: t.url, status: r.status, body: json }); }
      catch (e) { results.push({ service: t.service, url: t.url, error: (e as Error).message }); }
    }
    fs.writeFileSync(path.join(outDir, 'healthz_sweep.json'), JSON.stringify({ timestamp_utc: ts, services: results }, null, 2));
    // Persist PIDs for optional later shutdown
    const pidFile = process.env.UMCA_PID_FILE || '/tmp/umca-pids.json';
    const pidPayload = procs.map(p => ({ name: p.name, pid: p.proc.pid }));
    fs.writeFileSync(pidFile, JSON.stringify({ pids: pidPayload }, null, 2));
  } finally {
    // If KEEP_RUNNING=1, leave services alive for subsequent steps (e2e intent)
    if (process.env.KEEP_RUNNING !== '1') {
      for (const p of procs) { try { p.proc.kill('SIGINT'); } catch {} }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
