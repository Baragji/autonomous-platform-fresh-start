import fs from 'fs';
import path from 'path';

type Facts = {
  has_packages_dir: boolean;
  services: string[];
  evidence: {
    coverage_final_json: boolean;
    sbom_json: boolean;
  };
  dependencies: Record<string, { hasAnthropic: boolean }>;
  openapi_specs: string[];
  require_openapi_contracts?: boolean;
};

function listDirs(p: string): string[] {
  try {
    return fs.readdirSync(p, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }
}

function findOpenApiSpecs(root: string): string[] {
  const matches: string[] = [];
  function walk(dir: string) {
    const ents = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of ents) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/\.openapi\.(ya?ml|json)$/i.test(ent.name)) matches.push(full);
    }
  }
  walk(root);
  return matches;
}

function readJson(p: string): any {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

(function main() {
  const root = process.cwd();
  const packagesDir = path.join(root, 'packages');
  const hasPackages = fs.existsSync(packagesDir);
  const services = hasPackages ? listDirs(packagesDir) : [];

  const dependencies: Facts['dependencies'] = {};
  for (const svc of services) {
    const pkgJsonPath = path.join(packagesDir, svc, 'package.json');
    const pkg = readJson(pkgJsonPath) || {};
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } as Record<string, string>;
    const hasAnthropic = Object.keys(deps).some(k => /anthropic/i.test(k));
    dependencies[svc] = { hasAnthropic };
  }

  const facts: Facts = {
    has_packages_dir: hasPackages,
    services,
    evidence: {
      coverage_final_json: fs.existsSync(path.join(root, 'coverage', 'coverage-final.json')),
      sbom_json: fs.existsSync(path.join(root, '.automation', 'evidence', 'compliance', 'sbom.json')),
    },
    dependencies,
    openapi_specs: findOpenApiSpecs(root),
    require_openapi_contracts: /^1|true|yes$/i.test(String(process.env.COMPLIANCE_REQUIRE_OPENAPI || ''))
  };

  const outDir = path.join(root, '.automation', 'evidence', 'compliance');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'facts.json');
  fs.writeFileSync(outPath, JSON.stringify(facts, null, 2));
  // also echo path for convenience
  process.stdout.write(`${outPath}\n`);
})();
