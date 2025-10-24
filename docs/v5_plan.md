# Version 5 Production Readiness Playbook

This playbook synthesizes findings from reports `v1` through `v4b` and defines the concrete steps, evidence requirements, and automation needed to produce a definitive Version 5 validation report.

## 1. Comparative analysis of existing versions

### 1.1 High-level differences
- **V1 – "Evidence snapshot"**: Aggregated repo evidence without a rigid rubric. Highlighted the global coverage failure (70.78% < 80%) and partial health/startup guard implementations.
- **V2 – Criterion-by-criterion validation**: Introduced the eight-criterion rubric with explicit file and line citations. Marked the system *Not Production Ready* due to logging gaps, unsafe defaults, missing health checks, and absent validator coverage enforcement.
- **V3a/V3b – Evidence expansion**: Retained the eight-criterion rubric while upgrading secrets scanning to a PASS via an in-repo regex suite plus tests. Coverage (≈70.19% lines), health checks, and validator coverage enforcement remained unresolved.
- **V4a/V4b – Polished summaries**: Language tightened but findings mirrored V3. Secrets scanning stayed PASS; coverage, operational readiness, logging, and artifact provenance remained failing criteria.

### 1.2 Evaluation focus across versions
- Logging parity via the shared `createLogger` utility; Gateway and Planner never adopted it.
- Configuration safety in `packages/shared/src/env.ts`, where production credentials remain hardcoded without runtime guards.
- Error-handling and negative-test expectations for Runner and Validator endpoints.
- Secrets scanning evolution from external tooling (V1) to the tested regex suite (V3/V4).
- Coverage thresholds (≥80% global, ≥90% validator) and their missing CI enforcement.
- MCA remediation loop behavior and escalation handling.
- Artifact checksum generation versus missing MinIO metadata persistence.
- Operational readiness signals: `/healthz` endpoints and startup secret validation.

### 1.3 Trend summary
Only the secrets scanning criterion improved across versions (PARTIAL → PASS in V3). Every other critical gap persisted through V4b, keeping the overall verdict at **Not Production Ready**.

## 2. Agreements and discrepancies ledger

Two supplemental CSV artifacts capture the unified evidence ledger:
- [`docs/validation_comparison_matrix.csv`](validation_comparison_matrix.csv) — version-by-version criterion status comparison.
- [`docs/master_validation_claims.csv`](master_validation_claims.csv) — consolidated claims with agreement/discrepancy notes.

### 2.1 Consistent agreements (multi-version)
- **Coverage remains below thresholds** — global ≈70% (target 80%), validator coverage neither reaches 90% nor runs in CI.
- **Logging parity missing** — Gateway and Planner still rely on `process.stdout.write` instead of the shared logger.
- **Operational readiness incomplete** — Gateway, Planner, MCA, and Implementer lack `/healthz`; startup does not fail on missing secrets.
- **Artifact provenance incomplete** — Validator computes SHA-256 digests but MinIO metadata lacks those hashes.
- **MCA remediation loop** — Continues to satisfy the requirement with failure counting and escalation publishing.

### 2.2 Notable discrepancies (improvements)
- **Secrets scanning** — Upgraded from PARTIAL in V2 (limited patterns, no tests) to PASS in V3 onward after adding regex coverage and dedicated tests.

## 3. Specification for Version 5

### 3.1 Mandatory code references
Each Version 5 assertion must quote a ≤25 line excerpt and include filename, line range, blob SHA, and a SHA-256 digest of the excerpt text.

| Area | Required source references |
| --- | --- |
| Logging parity | `packages/gateway/src/server.ts`, `packages/planner/src/server.ts` — show pre-fix usage of `process.stdout.write` and post-fix adoption of `createLogger('gateway'|'planner')`. |
| Environment safety | `packages/shared/src/env.ts` lines covering database and MinIO defaults, plus new production guards that exit on weak credentials or missing secrets. |
| Coverage enforcement | `scripts/check-coverage.ts`, `.github/workflows/ci.yml`, and `packages/validator/vitest.config.ts` — demonstrate the wired coverage checks including the validator ≥90% command. |
| Negative tests | `packages/runner/src/__tests__/server.test.ts` and new validator negative tests to cover missing `execId`, code files, and E2B tokens. |
| Artifact provenance | `packages/validator/src/server.ts` checksum block and extended `packages/vfs/src/minio.ts` logic that persists `x-amz-meta-sha256`. |
| Health endpoints | Added `/healthz` handlers in Gateway, Planner, MCA, and Implementer alongside existing Runner and Validator endpoints. |

### 3.2 Reproducible verification steps
For each criterion include the exact command sequence and expected outcome:
- **Logging** — Boot Gateway and Planner, then grep logs for the structured prefix emitted by `createLogger`.
- **Environment guards** — Run with `NODE_ENV=production` and assert a non-zero exit when weak defaults are present; demonstrate a clean start with valid secrets.
- **Health checks** — `curl` each service's `/healthz` and capture the `200 {"ok":true}` responses.
- **Coverage** — Execute `npm test -- --coverage --run`, `npm run compliance:coverage`, and `npm run compliance:validator-coverage`; include resulting JSON summaries.
- **Secrets scanning** — Run validator tests that exercise the regex suite against seeded secrets to prove detection.
- **Artifact provenance** — Upload artifacts and inspect MinIO object metadata for `x-amz-meta-sha256`.

### 3.3 Commit and blob identity requirements
Embed repository identity in the report header:
- `repo_remote`, `branch`, `commit` (`git rev-parse --verify HEAD`)
- `tree` (`git rev-parse HEAD^{tree}`)

For every excerpt include:
- `blob_sha` (`git ls-tree -r HEAD <path> | awk '{print $3}'`)
- `line_range` (e.g., `L17-L26`)
- `sha256_excerpt` (hash of the literal excerpt text)

## 4. Automation toolkit for Version 5

### 4.1 Validation entrypoint script
Create `scripts/validate-production-readiness.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_URL="$(git remote get-url --push origin 2>/dev/null || echo unknown)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
COMMIT="$(git rev-parse --verify HEAD)"
TREE="$(git rev-parse HEAD^{tree})"

mkdir -p .automation/evidence

node scripts/tools/assert-logger-consistency.mjs
NODE_ENV=production node scripts/tools/assert-env-guards.mjs
node scripts/tools/assert-healthz.mjs

npm test -- --coverage --run
npm run compliance:coverage
npm run test:validator -- --coverage --run || true
npm run compliance:validator-coverage

npm run test:validator -- --reporter=verbose
node scripts/tools/verify-checksums.mjs

node scripts/reporters/build-v5-report.mjs \
  --repo "$REPO_URL" --branch "$BRANCH" --commit "$COMMIT" --tree "$TREE"
```

### 4.2 Targeted tooling scripts
- `scripts/tools/assert-logger-consistency.mjs` — Fails if Gateway or Planner skip `createLogger` or still call `process.stdout.write`.
- `scripts/tools/assert-env-guards.mjs` — Ensures production environments exit when weak defaults or missing secrets are detected.
- `scripts/tools/assert-healthz.mjs` — Polls `/healthz` endpoints for Gateway, Planner, Implementer, Runner, Validator, and MCA.
- `scripts/tools/verify-checksums.mjs` — Emits SHA-256 digests for critical evidence artifacts, failing if any are missing.
- `scripts/reporters/build-v5-report.mjs` — Produces both machine-readable (`.automation/evidence/v5-report.json`) and human-readable (`.automation/evidence/v5-report.md`) outputs containing per-claim evidence and hashes.

### 4.3 Traceability conventions
For each validation claim capture:
- Source metadata: `path`, `blob_sha`, `line_range`, `sha256_excerpt`.
- Claim metadata: `criterion_id`, `assertion`, `status` (PASS/FAIL).
- Test metadata: executed command, stdout log path, and exit code.
- Artifact metadata: artifact path or URL plus SHA-256 digest.
- Commit metadata: values recorded at the start of the validation run.

Store the aggregated data in `.automation/evidence/v5-report.json` and summarize it in `.automation/evidence/v5-report.md`.

### 4.4 Observability assets
Use Playwright to exercise `/healthz` checks and capture video evidence:
```bash
npx playwright test \
  --reporter=html \
  --video=on \
  --output=.automation/evidence/playwright
```
Archive the generated HTML report and videos, then record their file paths and SHA-256 hashes inside the Version 5 report bundle.

## 5. Evidence handling rules
- No claim is valid without reproducible, machine-verifiable evidence saved under `.automation/evidence/`.
- Follow the repository gates (`npm run lint`, `npm run typecheck`, `npm test`, coverage thresholds) and store outputs in the task evidence bundle.
- Hash all changed files and key artifacts; persist hashes alongside the reports for later verification.

This playbook is the authoritative checklist for assembling the Version 5 validation package. Execute the automation scripts, collect the required evidence, and embed commit-linked excerpts to deliver an auditable PASS/FAIL verdict.
