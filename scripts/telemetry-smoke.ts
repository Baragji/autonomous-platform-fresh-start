import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

type FetchResult = { ok: boolean; status?: number; body?: unknown; error?: string };

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

async function fetchJson(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, { method: 'GET' });
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return { ok: res.ok, status: res.status, body: json };
    } catch {
      return { ok: res.ok, status: res.status, body: text };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function run(cmd: string, args: string[]): string {
  try {
    return execSync([cmd, ...args].join(' '), { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function main() {
  const TASK = process.env.TASK || 'telemetry_smoke';
  const baseDir = path.resolve('.automation', 'evidence', TASK);
  const validDir = path.join(baseDir, 'valid');
  ensureDir(validDir);

  // Environment snapshot (no secrets)
  try {
    const nodeV = run('node', ['-v']);
    const npmV = run('npm', ['-v']);
    const gitSha = run('git', ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(baseDir, 'env.txt'), [nodeV, npmV, gitSha].filter(Boolean).join('\n'));
  } catch {}

  // Optional observability endpoints (best-effort; do not fail script)
  const endpoints = [
    { name: 'tempo_ready', url: process.env.TEMPO_READY_URL || 'http://localhost:3200/ready', out: 'tempo_ready.txt' },
    { name: 'grafana_health', url: process.env.GRAFANA_HEALTH_URL || 'http://localhost:3001/api/health', out: 'grafana_health.json' },
    { name: 'gateway_healthz', url: process.env.GATEWAY_HEALTH_URL || 'http://localhost:3030/healthz', out: 'gateway_health.json' },
    { name: 'mca_healthz', url: process.env.MCA_HEALTH_URL || 'http://localhost:7010/healthz', out: 'mca_health.json' },
    { name: 'planner_healthz', url: process.env.PLANNER_HEALTH_URL || 'http://localhost:7020/healthz', out: 'planner_health.json' },
    { name: 'implementer_healthz', url: process.env.IMPLEMENTER_HEALTH_URL || 'http://localhost:7030/healthz', out: 'implementer_health.json' },
    { name: 'runner_healthz', url: process.env.RUNNER_HEALTH_URL || 'http://localhost:7040/healthz', out: 'runner_health.json' },
    { name: 'validator_healthz', url: process.env.VALIDATOR_HEALTH_URL || 'http://localhost:7050/healthz', out: 'validator_health.json' }
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetchJson(ep.url);
      const file = path.join(baseDir, ep.out);
      fs.writeFileSync(file, JSON.stringify({ url: ep.url, ...res }, null, 2));
    } catch (e) {
      const file = path.join(baseDir, ep.out);
      fs.writeFileSync(file, JSON.stringify({ url: ep.url, ok: false, error: (e as Error).message }, null, 2));
    }
  }

  // Minimal summary
  const summary = {
    task: TASK,
    artifacts: endpoints.map((e) => ({ name: e.name, file: e.out }))
  };
  fs.writeFileSync(path.join(baseDir, 'summary.md'), `Telemetry smoke summary\n\n${JSON.stringify(summary, null, 2)}\n`);
}

main().catch(() => process.exit(0));

