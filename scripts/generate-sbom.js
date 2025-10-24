const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
// Workspaces can be array or object.packages
const workspaces = Array.isArray(pkgJson.workspaces)
  ? pkgJson.workspaces
  : (pkgJson.workspaces && Array.isArray(pkgJson.workspaces.packages))
  ? pkgJson.workspaces.packages
  : [];
const outDir = path.join(root, 'compliance', 'sbom');
fs.mkdirSync(outDir, { recursive: true });

function resolveWorkspaceDirs(patterns) {
  const dirs = [];
  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      const baseRel = pattern.slice(0, -2);
      const base = path.join(root, baseRel);
      if (fs.existsSync(base)) {
        const entries = fs.readdirSync(base, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) dirs.push(path.join(base, e.name));
        }
      }
    } else {
      const dir = path.join(root, pattern);
      if (fs.existsSync(dir)) dirs.push(dir);
    }
  }
  return dirs;
}
function cyclonedxBin() {
  const bin = path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'cyclonedx-npm.cmd' : 'cyclonedx-npm'
  );
  if (!fs.existsSync(bin)) {
    console.error('cyclonedx-npm not found. Install with: npm i -D @cyclonedx/cyclonedx-npm');
    process.exitCode = 1;
  }
  return bin;
}

function runCycloneDX(cwd, outFile) {
  const bin = cyclonedxBin();
  const args = ['--of', 'JSON', '-o', outFile];
  console.log(`Generating SBOM: ${outFile}`);
  const res = spawnSync(bin, args, { cwd, stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`Failed for ${cwd} (exit ${res.status})`);
  }
}

function pkgName(cwd) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    return p && p.name ? p.name.replace(/[@/]/g, '_') : path.basename(cwd);
  } catch {
    return path.basename(cwd);
  }
}
// Root SBOM
runCycloneDX(root, path.join(outDir, 'root.bom.json'));

// Workspace SBOMs
const wsDirs = resolveWorkspaceDirs(workspaces);
for (const dir of wsDirs) {
  if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
  const hasLock = fs.existsSync(path.join(dir, 'package-lock.json')) || fs.existsSync(path.join(dir, 'npm-shrinkwrap.json'));
  const hasNodeModules = fs.existsSync(path.join(dir, 'node_modules'));
  if (!hasLock && !hasNodeModules) {
    // Skip workspaces without local evidence; root SBOM already aggregates workspaces
    continue;
  }
  const name = pkgName(dir);
  runCycloneDX(dir, path.join(outDir, `${name}.bom.json`));
}

// Index file
const files = fs.readdirSync(outDir).filter(f => f.endsWith('.json'));
fs.writeFileSync(
  path.join(outDir, 'index.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2)
);
console.log(`SBOMs written to ${outDir}`);
