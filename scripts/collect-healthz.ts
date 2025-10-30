import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

type Proc = { name: string; proc: ReturnType<typeof spawn> };
function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForTcp(host: string, port: number, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const tryOnce = () => {
      const s = net.createConnection({ host, port });
      let done = false;
      const finish = (err?: Error) => {
        if (done) return; done = true; s.destroy();
        if (err) {
          if (Date.now() - start >= timeoutMs) return reject(new Error(`Timeout waiting for tcp ${host}:${port}`));
          setTimeout(tryOnce, 1000);
        } else {
          resolve();
        }
      };
      s.once('connect', () => finish());
      s.once('error', () => finish(new Error('connect error')));
    };
    tryOnce();
  });
}

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
  console.log('[collect-healthz] ensuring infra containers...');
  // Best-effort: in local/dev we bring up compose infra. In CI we already have
  // service containers; this will no-op if docker or compose is unavailable.
  try {
    spawnSync('docker', ['compose', '-f', 'infrastructure/docker-compose.yml', 'up', '-d', 'postgres', 'redis', 'minio', 'tempo', 'grafana'], { stdio: 'ignore' });
  } catch {}

  // Wait for core infra ports to be reachable to avoid service crashes on boot
  try {
    console.log('[collect-healthz] waiting for core infra ports (postgres:5433, redis:6380, minio:9000)...');
    await Promise.all([
      waitForTcp('127.0.0.1', 5433, 120000),
      waitForTcp('127.0.0.1', 6380, 120000),
      waitForTcp('127.0.0.1', 9000, 120000)
    ]);
  } catch (e) {
    console.error('[collect-healthz] infra ports not ready:', (e as Error).message);
  }

  // Ensure shared dist exists before starting services that import it at runtime (runner compat)
  try {
    console.log('[collect-healthz] building vfs + shared...');
    // Build VFS first since shared runtime vfs.js requires '@autonomous/vfs/dist/index.js'
    spawnSync('npm', ['--prefix', 'packages/vfs', 'run', 'build'], { stdio: 'ignore' });
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
  console.log('[collect-healthz] starting services (gateway, mca, planner, implementer, runner, validator)...');
  const procs: Proc[] = [
    { name: 'gateway', proc: spawn('npx', ['-y', 'tsx', 'packages/gateway/src/server.ts'], { env, stdio: 'ignore' }) },
    { name: 'mca', proc: spawn('npx', ['-y', 'tsx', 'packages/mca/src/server.ts'], { env, stdio: 'ignore' }) },
    { name: 'planner', proc: spawn('npx', ['-y', 'tsx', 'packages/planner/src/server.ts'], { env, stdio: 'ignore' }) },
    { name: 'implementer', proc: spawn('npx', ['-y', 'tsx', 'packages/implementer/src/server.ts'], { env, stdio: 'ignore' }) },
    { name: 'runner', proc: spawn('npx', ['-y', 'tsx', 'packages/runner/src/server.ts'], { env, stdio: 'ignore' }) },
    { name: 'validator', proc: spawn('npx', ['-y', 'tsx', 'packages/validator/src/server.ts'], { env, stdio: 'ignore' }) }
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
    const results: any[] = []; const ts = 'STATIC';
    if (process.env.FAST === '1') {
      console.log('[collect-healthz] FAST=1 → skipping waits, snapshotting current status');
    } else {
      console.log('[collect-healthz] waiting for services to become healthy...');
      await Promise.all(targets.map((t) => waitForHttp(t.url, 120000).catch((e) => e)));
    }
    for (const t of targets) {
      try {
        // short timeout snapshot to avoid hanging
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 2000).unref?.();
        const r = await fetch(t.url, { signal: ctrl.signal as any });
        const body = await r.text();
        let json: unknown = null; try { json = JSON.parse(body); } catch { json = { raw: body }; }
        results.push({ service: t.service, url: t.url, status: r.status, body: json });
      } catch (e) {
        results.push({ service: t.service, url: t.url, error: (e as Error).message });
      }
    }
    fs.writeFileSync(path.join(outDir, 'healthz_sweep.json'), JSON.stringify({ timestamp_utc: ts, services: results }, null, 2));
    console.log('[collect-healthz] wrote .automation/evidence/healthz_sweep.json');
    // Persist PIDs for optional later shutdown
    const pidFile = process.env.UMCA_PID_FILE || '/tmp/umca-pids.json';
    const pidPayload = procs.map(p => ({ name: p.name, pid: p.proc.pid }));
    fs.writeFileSync(pidFile, JSON.stringify({ pids: pidPayload }, null, 2));
    console.log('[collect-healthz] services started; pid file:', pidFile);
  } finally {
    // If KEEP_RUNNING=1, leave services alive for subsequent steps (e2e intent)
    if (process.env.KEEP_RUNNING !== '1') {
      for (const p of procs) { try { p.proc.kill('SIGINT'); } catch {} }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
