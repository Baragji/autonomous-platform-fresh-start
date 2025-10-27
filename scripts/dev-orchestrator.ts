#!/usr/bin/env -S node --enable-source-maps
/*
  Dev Orchestrator
  - Single-command up/down/status with strict verbose logging and evidence capture
  - Starts infra + services + UI, validates health, and persists evidence bundle
  - Produces human-readable logs while retaining machine-parseable traces (.ndjson)
*/
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import dotenv from 'dotenv';

type Proc = { name: string; proc: ReturnType<typeof spawn> };

const EVID_ROOT = path.resolve('.automation', 'evidence');
const RUN_DIR = path.join(EVID_ROOT, `dev_run_${new Date().toISOString().replace(/[:.]/g, '-')}`);
const LOGS_NDJSON = path.join(RUN_DIR, 'logs.ndjson');
const HEALTH_JSON = path.join(RUN_DIR, 'health.json');
const TRACE_JSON = path.join(RUN_DIR, 'trace.json');
const UI_HEAD_HTML = path.join(RUN_DIR, 'ui_head.html');
const UI_SCREENSHOT = path.join(RUN_DIR, 'ui_screenshot.png');
const PIDS_FILE = '/tmp/umca-pids.json';

function ts() { return new Date().toISOString(); }
function log(level: 'INFO'|'WARN'|'ERROR', msg: string, ctx: Record<string, unknown> = {}) {
  const line = { time: ts(), level, msg, ...ctx };
  const text = `${line.time} [${level}] ${msg}${Object.keys(ctx).length? ' ' + JSON.stringify(ctx): ''}`;
  console.log(text);
  try { fs.mkdirSync(path.dirname(LOGS_NDJSON), { recursive: true }); fs.appendFileSync(LOGS_NDJSON, JSON.stringify(line) + '\n'); } catch {}
}

async function waitHttp(url: string, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await fetchSafe(url);
    if (ok) return; await sleep(1000);
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function fetchSafe(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 2000);
    fetch(url, { signal: ctrl.signal as any }).then((r) => { clearTimeout(to); resolve(r.ok || r.status === 503); }).catch(() => { clearTimeout(to); resolve(false); });
  });
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; stdio?: any } = {}) {
  log('INFO', `spawn ${cmd} ${args.join(' ')}`, { cwd: opts.cwd });
  return spawn(cmd, args, { stdio: 'ignore', ...opts });
}

async function writeTrace(phase: string, data: Record<string, unknown> = {}) {
  const now = ts();
  const rec = { time: now, phase, ...data };
  await fsp.mkdir(path.dirname(TRACE_JSON), { recursive: true });
  let current: any[] = [];
  try { current = JSON.parse(await fsp.readFile(TRACE_JSON, 'utf8')); } catch {}
  current.push(rec);
  await fsp.writeFile(TRACE_JSON, JSON.stringify(current, null, 2));
}

async function infraUp() {
  log('INFO', 'infra: docker compose up (postgres, redis, minio, tempo, grafana)');
  spawnSync('docker', ['compose', '-f', 'infrastructure/docker-compose.yml', 'up', '-d', 'postgres', 'redis', 'minio', 'tempo', 'grafana'], { stdio: 'ignore' });
}

async function buildShared() {
  log('INFO', 'build: vfs + shared');
  spawnSync('npm', ['--prefix', 'packages/vfs', 'run', 'build'], { stdio: 'ignore' });
  spawnSync('npm', ['--prefix', 'packages/shared', 'run', 'build'], { stdio: 'ignore' });
}

async function servicesUp(): Promise<Proc[]> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://umca:umcapassword@localhost:5433/umca',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6380',
    MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
    MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || 'minioadmin123'
  };
  const procs: Proc[] = [
    { name: 'gateway', proc: run('npx', ['-y', 'tsx', 'packages/gateway/src/server.ts'], { env }) },
    { name: 'mca', proc: run('npx', ['-y', 'tsx', 'packages/mca/src/server.ts'], { env }) },
    { name: 'planner', proc: run('npx', ['-y', 'tsx', 'packages/planner/src/server.ts'], { env }) },
    { name: 'implementer', proc: run('npx', ['-y', 'tsx', 'packages/implementer/src/server.ts'], { env }) },
    { name: 'runner', proc: run('npx', ['-y', 'tsx', 'packages/runner/src/server.ts'], { env }) },
    { name: 'validator', proc: run('npx', ['-y', 'tsx', 'packages/validator/src/server.ts'], { env }) }
  ];
  await fsp.writeFile(PIDS_FILE, JSON.stringify({ pids: procs.map((p) => ({ name: p.name, pid: p.proc.pid })) }, null, 2));
  log('INFO', 'services: pids recorded', { file: PIDS_FILE });
  return procs;
}

async function waitAllHealthy() {
  const targets = [
    { service: 'gateway', url: 'http://localhost:3030/healthz' },
    { service: 'mca', url: 'http://localhost:7010/healthz' },
    { service: 'planner', url: 'http://localhost:7020/healthz' },
    { service: 'implementer', url: 'http://localhost:7030/healthz' },
    { service: 'runner', url: 'http://localhost:7040/healthz' },
    { service: 'validator', url: 'http://localhost:7050/healthz' }
  ];
  log('INFO', 'health: waiting for services');
  await Promise.all(targets.map((t) => waitHttp(t.url).catch((e) => log('WARN', 'health wait failed', { service: t.service, err: String(e) }))));
  const results: any[] = [];
  for (const t of targets) {
    const ok = await fetchSafe(t.url);
    results.push({ service: t.service, url: t.url, ok });
  }
  await fsp.writeFile(HEALTH_JSON, JSON.stringify({ timestamp_utc: ts(), services: results }, null, 2));
  log('INFO', 'health: snapshot saved', { file: HEALTH_JSON });
}

async function uiUp() {
  log('INFO', 'ui: ensure deps');
  // try to ensure web node_modules exists at least once
  try {
    if (!fs.existsSync('apps/web/node_modules')) {
      spawnSync('npm', ['--prefix', 'apps/web', 'install', '--no-audit', '--fund=false'], { stdio: 'ignore' });
    }
  } catch {}
  log('INFO', 'ui: starting dev server on :4000');
  const uiEnv = { ...process.env, UI_BACKEND_MODE: 'live', UI_GATEWAY_BASE: process.env.UI_GATEWAY_BASE || 'http://localhost:3030', UI_EVIDENCE_DIR: '../../.automation/evidence' };
  run('npm', ['-w', 'apps/web', 'run', 'dev'], { env: uiEnv });
  // Wait up to 30s
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const ok = await fetchSafe('http://localhost:4000');
    if (ok) return;
    await sleep(1000);
  }
  throw new Error('UI did not become ready on :4000');
}

async function captureUiEvidence() {
  log('INFO', 'ui: capture evidence (html + optional screenshot)');
  try {
    const res = await fetch('http://localhost:4000');
    const html = await res.text();
    await fsp.writeFile(UI_HEAD_HTML, html);
  } catch (e) {
    log('WARN', 'ui: failed to fetch HTML', { err: String(e) });
  }
  // Try Playwright (optional) for screenshot
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.screenshot({ path: UI_SCREENSHOT, fullPage: true });
    await browser.close();
    log('INFO', 'ui: screenshot saved', { file: UI_SCREENSHOT });
  } catch (e) {
    log('WARN', 'ui: screenshot skipped (playwright not available)', { err: String(e) });
  }
}

async function up() {
  await writeTrace('start');
  await infraUp();
  await buildShared();
  const procs = await servicesUp();
  await waitAllHealthy();
  await uiUp();
  await captureUiEvidence();
  await writeTrace('ready', { pids_file: PIDS_FILE, run_dir: RUN_DIR });
  log('INFO', 'UP COMPLETE', { run_dir: RUN_DIR });
}

async function down() {
  log('INFO', 'shutdown: stopping services');
  try {
    const raw = await fsp.readFile(PIDS_FILE, 'utf8');
    const j = JSON.parse(raw) as { pids?: Array<{ name: string; pid: number }> };
    for (const p of j.pids || []) {
      try { process.kill(p.pid, 'SIGINT'); log('INFO', 'killed', { name: p.name, pid: p.pid }); } catch {}
    }
  } catch {}
  spawnSync('docker', ['compose', '-f', 'infrastructure/docker-compose.yml', 'down', '--remove-orphans'], { stdio: 'ignore' });
  await writeTrace('stopped');
  log('INFO', 'DOWN COMPLETE');
}

async function status() {
  await waitAllHealthy().catch(() => {});
  log('INFO', `status written to ${HEALTH_JSON}`);
}

async function main() {
  // Load repo .env (silently)
  try { dotenv.config({ path: path.resolve(process.cwd(), '.env') }); } catch {}
  await fsp.mkdir(RUN_DIR, { recursive: true });
  const cmd = process.argv[2] || 'up';
  try {
    if (cmd === 'up') await up();
    else if (cmd === 'down') await down();
    else if (cmd === 'status') await status();
    else throw new Error(`unknown command: ${cmd}`);
  } catch (e) {
    log('ERROR', 'orchestrator failed', { err: String(e) });
    process.exit(1);
  }
}

main();
