import fs from 'fs';
import path from 'path';

const COVERAGE_PATH = path.resolve(process.cwd(), 'coverage', 'coverage-final.json');
const OUT_DIR = path.resolve(process.cwd(), '.automation', 'evidence', 'compliance', 'valid');
const OUT_FILE = path.join(OUT_DIR, 'coverage.json');
const THRESHOLD = Number(process.env.COVERAGE_LINES_THRESHOLD || 80);

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function main() {
  if (!fs.existsSync(COVERAGE_PATH)) {
    console.error(`coverage-final.json not found at ${COVERAGE_PATH}. Run tests with coverage enabled.`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf-8')) as Record<string, any>;

  let total = 0;
  let covered = 0;
  let mode: 'lines' | 'statements' = 'lines';

  for (const [_file, metrics] of Object.entries<any>(data)) {
    if (metrics?.lines && (typeof metrics.lines.total === 'number')) {
      total += Number(metrics.lines.total || 0);
      covered += Number(metrics.lines.covered || 0);
      mode = 'lines';
    } else if (metrics?.s && typeof metrics.s === 'object') {
      const sObj = metrics.s as Record<string, number>;
      const fileTotal = Object.keys(sObj).length;
      const fileCovered = Object.values(sObj).filter((v) => Number(v) > 0).length;
      total += fileTotal;
      covered += fileCovered;
      mode = 'statements';
    }
  }

  const pct = total > 0 ? (covered / total) * 100 : 0;
  const summary = {
    threshold: THRESHOLD,
    metric: mode,
    total,
    covered,
    pct: Number(pct.toFixed(2)),
    pass: pct >= THRESHOLD,
    note: mode === 'statements' ? 'lines metric missing; using statements coverage as proxy' : undefined
  };

  ensureDir(OUT_DIR);
  fs.writeFileSync(OUT_FILE, JSON.stringify(summary, null, 2));
  if (!summary.pass) {
    console.error(`Coverage (${summary.metric}) ${summary.pct}% is below threshold ${THRESHOLD}%.`);
    process.exit(1);
  }
  console.log(`Coverage (${summary.metric}) ${summary.pct}% >= ${THRESHOLD}% ✓`);
}

main();
