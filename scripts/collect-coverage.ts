import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type Result = { exitCode: number; ok: boolean };

function run(cmd: string, args: string[], opts: { cwd?: string } = {}): Result {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: opts.cwd, env: process.env });
  return { exitCode: r.status ?? 1, ok: (r.status ?? 1) === 0 };
}

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

function computeCoverage(): { metric: 'lines' | 'statements'; total: number; covered: number; pct: number } {
  const covPath = path.resolve('coverage', 'coverage-final.json');
  if (!fs.existsSync(covPath)) return { metric: 'lines', total: 0, covered: 0, pct: 0 };
  const data = JSON.parse(fs.readFileSync(covPath, 'utf-8')) as Record<string, any>;
  let total = 0, covered = 0; let metric: 'lines' | 'statements' = 'lines';
  for (const [, m] of Object.entries<any>(data)) {
    if (m?.lines && typeof m.lines.total === 'number') {
      total += Number(m.lines.total || 0);
      covered += Number(m.lines.covered || 0);
      metric = 'lines';
    } else if (m?.s && typeof m.s === 'object') {
      const sObj = m.s as Record<string, number>;
      total += Object.keys(sObj).length;
      covered += Object.values(sObj).filter((v) => Number(v) > 0).length;
      metric = 'statements';
    }
  }
  const pct = total > 0 ? Number(((covered / total) * 100).toFixed(2)) : 0;
  return { metric, total, covered, pct };
}

function main() {
  const outDir = path.resolve('.automation', 'evidence');
  ensureDir(outDir);
  const lint = run('npm', ['run', 'lint']);
  const typecheck = run('npm', ['run', 'typecheck']);
  const test = run('npm', ['test', '--', '--coverage', '--run']);
  const cov = computeCoverage();
  const payload = { lint, typecheck, test, coverage: cov };
  fs.writeFileSync(path.join(outDir, 'coverage.json'), JSON.stringify(payload, null, 2));
}

main();

