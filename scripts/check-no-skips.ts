import { spawn } from 'node:child_process';

function runVitestJson(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['vitest', 'run', '--reporter=json'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('close', (code) => {
      if (code !== 0 && !out) return reject(new Error(err || `vitest exited ${code}`));
      resolve(out);
    });
  });
}

import fs from 'node:fs';
import path from 'node:path';

async function readOrRun(): Promise<string> {
  const p = process.env.VITEST_JSON_PATH || path.resolve('.automation', 'evidence', 'ci-tests.json');
  try {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  } catch {}
  return runVitestJson();
}

async function main() {
  const output = await readOrRun();
  const line = output.split('\n').find((l) => l.trim().startsWith('{') && l.includes('numTotalTestSuites'));
  if (!line) {
    console.error('Could not find Vitest JSON summary in output.');
    process.exit(1);
  }
  const report = JSON.parse(line) as {
    numPendingTests?: number; numPendingTestSuites?: number; success?: boolean
  };
  const pending = Number(report.numPendingTests || 0) + Number(report.numPendingTestSuites || 0);
  if (pending > 0) {
    console.error(`Found ${pending} skipped tests/suites. Failing due to no-skips policy.`);
    process.exit(1);
  }
  if (report.success !== true) {
    console.error('Vitest reported failure.');
    process.exit(1);
  }
  console.log('No skipped tests.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
