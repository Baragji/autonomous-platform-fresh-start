#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const facts = {
  has_packages_dir: false,
  services: [],
  forbidden_deps: [],
  evidence_week1_ok: false,
  evidence_week2_ok: false,
  week2_claimed_complete: false
};

// packages/*
const pkgsDir = path.join(root, 'packages');
if (fs.existsSync(pkgsDir)) {
  facts.has_packages_dir = true;
  const subs = fs.readdirSync(pkgsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  facts.services.push(...subs);
}

// dependencies across root and packages/*
function collectDeps(pkgPath) {
  if (!fs.existsSync(pkgPath)) return [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return Object.keys({ ...(pkg.dependencies||{}), ...(pkg.devDependencies||{}) });
  } catch { return []; }
}

const depSet = new Set(collectDeps(path.join(root, 'package.json')));
if (facts.has_packages_dir) {
  for (const svc of facts.services) {
    collectDeps(path.join(pkgsDir, svc, 'package.json')).forEach(d => depSet.add(d));
  }
}
const allDeps = Array.from(depSet);
if (allDeps.includes('@anthropic-ai/sdk')) facts.forbidden_deps.push('@anthropic-ai/sdk');

// evidence
function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
const w1 = path.join(root, '.automation/evidence/week1/WEEK1_SUMMARY.md');
facts.evidence_week1_ok = exists(w1);
const w2 = path.join(root, '.automation/evidence/week2/WEEK2_SUMMARY.md');
facts.evidence_week2_ok = exists(w2);

// simple heuristic: if Week2 summary exists and shows all PASS, mark claimed complete
if (facts.evidence_week2_ok) {
  const txt = fs.readFileSync(w2, 'utf-8');
  if (txt.includes('G1-API: PASS') && txt.includes('G2-DB: PASS') && txt.includes('G3-PLAN: PASS') && txt.includes('G4-TRACE: PASS')) {
    facts.week2_claimed_complete = true;
  }
}

const outDir = path.join(root, '.automation/evidence/compliance');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'facts.json'), JSON.stringify(facts, null, 2));
console.log(JSON.stringify(facts, null, 2));

