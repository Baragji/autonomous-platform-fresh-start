import fs from 'fs';
import path from 'path';

const PKG_SUMMARY = path.resolve(process.cwd(), 'packages', 'validator', 'coverage', 'coverage-summary.json');
const ROOT_COVERAGE = path.resolve(process.cwd(), 'coverage', 'coverage-final.json');
const PKG_PREFIX = path.join('packages', 'validator');

function main() {
  // Prefer package-level summary when available (istanbul provider)
  if (fs.existsSync(PKG_SUMMARY)) {
    const sum = JSON.parse(fs.readFileSync(PKG_SUMMARY, 'utf-8')) as { total?: { lines?: { pct?: number } } };
    const pct = Number(sum?.total?.lines?.pct ?? 0);
    const THRESHOLD = Number(process.env.VALIDATOR_COVERAGE_LINES_THRESHOLD || 90);
    const OUT_DIR = path.resolve(process.cwd(), '.automation', 'evidence', 'compliance', 'valid');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'validator-coverage.json'), JSON.stringify({ threshold: THRESHOLD, pct, pass: pct >= THRESHOLD, source: 'package-summary' }, null, 2));
    if (pct < THRESHOLD) {
      console.error(`Validator coverage ${pct}% is below threshold ${THRESHOLD}%`);
      process.exit(1);
    }
    console.log(`Validator coverage ${pct}% >= ${THRESHOLD}% ✓`);
    return;
  }

  // Fallback: compute from root coverage-final by summing statements under validator/src
  if (!fs.existsSync(ROOT_COVERAGE)) {
    console.error(`coverage-final.json not found at ${ROOT_COVERAGE}. Run root tests with coverage enabled.`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(ROOT_COVERAGE, 'utf-8')) as Record<string, any>;
  let total = 0;
  let covered = 0;

  for (const [file, metrics] of Object.entries<any>(data)) {
    // Only include validator package source files
    if (!file.includes(`${PKG_PREFIX}/src/`)) continue;
    // Use statement coverage for stability across sourcemaps; fallback to lines if needed
    if (metrics?.s && typeof metrics.s === 'object') {
      const sObj = metrics.s as Record<string, number>;
      const fileTotal = Object.keys(sObj).length;
      const fileCovered = Object.values(sObj).filter((v) => Number(v) > 0).length;
      total += fileTotal;
      covered += fileCovered;
    } else if (metrics?.lines && (typeof metrics.lines.total === 'number')) {
      total += Number(metrics.lines.total || 0);
      covered += Number(metrics.lines.covered || 0);
    }
  }

  const pct = total > 0 ? (covered / total) * 100 : 0;
  const THRESHOLD = Number(process.env.VALIDATOR_COVERAGE_LINES_THRESHOLD || 90);
  const summary = {
    threshold: THRESHOLD,
    total,
    covered,
    pct: Number(pct.toFixed(2)),
    pass: pct >= THRESHOLD
  };
  const OUT_DIR = path.resolve(process.cwd(), '.automation', 'evidence', 'compliance', 'valid');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'validator-coverage.json'), JSON.stringify(summary, null, 2));

  if (!summary.pass) {
    console.error(`Validator coverage ${summary.pct}% is below threshold ${THRESHOLD}%`);
    process.exit(1);
  }
  console.log(`Validator coverage ${summary.pct}% >= ${THRESHOLD}% ✓`);
}

main();
