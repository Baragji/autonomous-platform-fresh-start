import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), '.automation', 'evidence', 'compliance');
const semgrepPath = path.join(outDir, 'semgrep.sarif');
const spectralPath = path.join(outDir, 'spectral.sarif');
const trivyPath = path.join(outDir, 'trivy.sarif');
const gitleaksPath = path.join(outDir, 'gitleaks.sarif');
const reportPath = path.join(outDir, 'report.sarif');

function readSarif(p: string) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

(function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const semgrep = readSarif(semgrepPath);
  const spectral = readSarif(spectralPath);
  const trivy = readSarif(trivyPath);
  const gitleaks = readSarif(gitleaksPath);

  const base = {
    $schema: "https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0-rtm.5.json",
    version: "2.1.0",
    runs: [] as any[]
  };

  if (semgrep?.runs?.length) base.runs.push(...semgrep.runs);
  if (spectral?.runs?.length) base.runs.push(...spectral.runs);
  if (trivy?.runs?.length) base.runs.push(...trivy.runs);
  if (gitleaks?.runs?.length) base.runs.push(...gitleaks.runs);

  fs.writeFileSync(reportPath, JSON.stringify(base, null, 2));
  process.stdout.write(`${reportPath}\n`);
})();
