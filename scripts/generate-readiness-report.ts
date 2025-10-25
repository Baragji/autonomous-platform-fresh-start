import fs from 'node:fs';
import path from 'node:path';

function readJson<T = unknown>(p: string): T | null { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as T; } catch { return null; } }

function main() {
  const base = path.resolve('.automation', 'evidence');
  const coverage = readJson<any>(path.join(base, 'coverage.json'));
  const healthz = readJson<any>(path.join(base, 'healthz_sweep.json'));
  const envguard = readJson<any>(path.join(base, 'prod_env_guard.json'));
  const e2e = readJson<any>(path.join(base, 'e2e_request_response.json'));

  const coveragePct = Number(coverage?.coverage?.pct || 0);
  const healthAllOk = Array.isArray(healthz?.services) ? healthz.services.every((s: any) => s?.body?.ok === true) : false;
  const guardPassOk = Number(envguard?.pass_run?.exitCode) === 0 && typeof envguard?.pass_run?.stdout === 'string';
  const guardFailOk = Number(envguard?.fail_run?.exitCode) !== 0 && typeof envguard?.fail_run?.stdout === 'string';
  const trace = Array.isArray(e2e?.execution_trace) ? e2e.execution_trace : [];
  const phases = trace.map((t: any) => String(t.phase || ''));
  const touchedValidator = phases.includes('validated') || phases.includes('needs_remediation');
  const exercisedChain = ['planned','implementing','implemented','tested','validated','needs_remediation'].some((p) => phases.includes(p));

  const report = {
    timestamp_utc: new Date().toISOString(),
    coverage: { pct: coveragePct },
    healthz: { all_ok: healthAllOk },
    env_guard: { pass_ok: guardPassOk, fail_ok: guardFailOk },
    e2e: { exercised_chain: exercisedChain, touched_validator: touchedValidator },
    verdict: (coveragePct >= 80 && healthAllOk && guardPassOk && guardFailOk && touchedValidator) ? 'POTENTIAL_READY' : 'NOT_READY'
  };
  fs.writeFileSync(path.join(base, 'v5-report.json'), JSON.stringify(report, null, 2));
}

main();

