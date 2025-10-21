import fs from 'fs';
import path from 'path';

const factsPath = path.join(process.cwd(), '.automation', 'evidence', 'compliance', 'facts.json');

function fail(msg: string) {
  process.stderr.write(`❌ ${msg}\n`);
  process.exitCode = 1;
}

(function main() {
  if (!fs.existsSync(factsPath)) {
    fail('facts.json not found; run collect-facts first');
    return;
  }
  const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8')) as {
    has_packages_dir: boolean;
    services: string[];
    evidence: { coverage_final_json: boolean };
    dependencies: Record<string, { hasAnthropic: boolean }>;
  };

  if (!facts.has_packages_dir || facts.services.length === 0) {
    fail('Monorepo packages/ missing or empty (microservices required)');
  }

  for (const [svc, d] of Object.entries(facts.dependencies)) {
    if (d.hasAnthropic) {
      fail(`Forbidden dependency detected in ${svc}: Anthropic SDK`);
    }
  }

  if (!facts.evidence.coverage_final_json) {
    fail('Coverage evidence missing: coverage/coverage-final.json');
  }

  if (process.exitCode) {
    process.stderr.write('Meta checks FAILED\n');
  } else {
    process.stdout.write('Meta checks PASS\n');
  }
})();
