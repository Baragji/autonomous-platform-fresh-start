MISSION_OPTION_A_EXECUTION.md

1. ROLE / AUTHORITY
- You are the Secure Autonomous Operator for this repository.
- You have full authority to read/modify code, run services and scripts locally, regenerate evidence, update CI, push branches, and apply branch protection.
- You must not ask a human for approval, secrets, or manual steps. Load secrets from .env silently. Red is red: failing gates block progress.

2. OBJECTIVE (Option A)
Deliver a production-ready, autonomous pipeline implementing Smart MCA → Smart Specialists (Implementer, Runner) → Zero-Trust Validator with a bounded remediation loop (≤3 retries then escalate). The Validator remains deterministic and enforces tests, coverage ≥80% global (and validator-specific goal per ADR if applicable), and “no secret leakage.” CI enforces this end to end, regenerates evidence, signs/attests artifacts (keyless Cosign via OIDC), runs OpenSSF Scorecard, and blocks merges on red checks. Cut and protect a `release/secure-<UTC>` branch only after CI is fully green and evidence is attested.

3. NON-NEGOTIABLE READINESS GATES
- Validator executed in the e2e chain; `.automation/evidence/v5-report.json:e2e.touched_validator === true`.
- Global coverage ≥80% lines; all tests pass; coverage.json non-zero.
- MCA remediation loop bounded: ≤3 attempts then escalate; no infinite loops.
- Runner returns structured `{ ok: false, ... }` with HTTP 200 on failure; never 500 for expected execution errors.
- Evidence directory contains only approved machine outputs; no narrative prose.
- `.automation/evidence/ATTACHMENT_MANIFEST.json` matches CI-regenerated manifest (commit SHA + UTC + sha256 + size for allowed files only).
- CI:
  - Brings up infra; launches services with secrets from GitHub Actions secrets.
  - Regenerates evidence and attestation.
  - Enforces validator touched, coverage gates, narrative ban, and manifest match.
  - Runs secret scan (Gitleaks or equivalent).
  - Generates SBOM; signs/attests evidence bundle via Cosign keyless + verifies.
  - Runs OpenSSF Scorecard and enforces policy threshold.
- Protected `release/secure-<UTC>` branch created only after all gates green; CI checks set as required; force-push disabled; review required.

4. PHASED EXECUTION PLAN

Phase 0: Checkout and branch prep
- Actions
  - Identify active hardening branch and ensure you are on it.
  - Record current HEAD SHA.
- Commands
  - `git rev-parse --abbrev-ref HEAD`
  - `git rev-parse HEAD`
- Evidence to write
  - Update `.automation/evidence/v5-report.json` later; for now, capture branch and SHA in your run logs.
- Stop condition
  - On hardening branch (e.g., `secure_hardening_20251025T200131Z`) with HEAD recorded.

Phase 1: Code fixes (MCA loop bound, Runner HTTP contract, Implementer partial handoff enforcement, Validator flags, Reviewer stub)

1. Implementer partial handoff (ensure always-on behavior)
- Files
  - `packages/implementer/src/agent.ts`
  - `packages/implementer/src/publisher.ts`
- Intent
  - On max-iterations/tool error, always scaffold minimal project under `<execId>/code/` via the same writer path Runner expects, publish `implementer_partial`, and return `{ ok: true, files: [...] }`.
- Pseudodiff
  ```
  --- a/packages/implementer/src/agent.ts
  +++ b/packages/implementer/src/agent.ts
  @@
    async function implement(execId: string, intent: string, ...) {
  -   // existing implementer loop...
  +   // existing implementer loop...
        try {
          // core implement logic...
        } catch (err) {
  -       throw err
  +       const files = await writeMinimalScaffold(execId) // writes <execId>/code/README.md and stub test/src files
  +       await publisher.publish({
  +         type: 'implementer_partial',
  +         execId,
  +         payload: { status: 'implementer_partial', reason: 'tool_error', files }
  +       })
  +       return { ok: true, files }
        }
  @@
        if (iterations >= MAX_ITERS) {
  -       throw new Error('max_iterations')
  +       const files = await writeMinimalScaffold(execId)
  +       await publisher.publish({
  +         type: 'implementer_partial',
  +         execId,
  +         payload: { status: 'implementer_partial', reason: 'max_iterations', files }
  +       })
  +       return { ok: true, files }
        }
    }
  ```

  ```
  --- a/packages/implementer/src/publisher.ts
  +++ b/packages/implementer/src/publisher.ts
  @@
  - export type Event = { type: 'implementer_done' | 'implementer_error', execId: string, payload: any }
  + export type Event = { type: 'implementer_done' | 'implementer_error' | 'implementer_partial', execId: string, payload: any }
  
    export async function publish(evt: Event) {
      // ensure 'implementer_partial' is treated as a first-class structured event
    }
  ```

2. MCA bounded remediation loop and acceptance of partials
- File
  - `packages/mca/src/server.ts`
- Intent
  - If Implementer returns `{ ok: true }` (even partial), proceed to Runner → Validator.
  - After Validator result:
    - if validated → END
    - else if failure_count ≥3 → set status `escalated`, publish escalation, END
    - else → loop back to Implementer.
- Pseudodiff
  ```
  --- a/packages/mca/src/server.ts
  +++ b/packages/mca/src/server.ts
  @@
  - const MAX_ATTEMPTS = 25
  + const MAX_ATTEMPTS = 3
    async function execute(execId: string, intent: string) {
      let failureCount = 0
      while (true) {
        const impl = await implementer.run(execId, intent)
  -     if (!impl.ok) throw new Error('implementer failed')
  +     if (!impl.ok) {
  +       // should not happen if implementer enforces partials, but guard anyway:
  +       const files = await implementer.writeMinimalScaffold(execId)
  +       await bus.publish({ type: 'implementer_partial', execId, payload: { status: 'implementer_partial', reason: 'unexpected_not_ok', files } })
  +     }
        const run = await runner.run(execId)
  -     if (!run.ok) throw new Error('runner failed')
  +     // runner returns ok:false on failure but HTTP 200; continue structurally
  
        const val = await validator.validate(execId)
        // val: { ok:boolean, verdict:'validated'|'needs_remediation'|'failed', touched_validator:true, ... }
  -     if (val.ok) return finalize('validated')
  +     if (val.ok && val.verdict === 'validated') return finalize('validated')
        failureCount++
  -     if (failureCount >= MAX_ATTEMPTS) throw new Error('max_attempts')
  +     if (failureCount >= MAX_ATTEMPTS) {
  +       await bus.publish({ type: 'escalated', execId, payload: { status: 'escalated', failures: failureCount } })
  +       return finalize('escalated')
  +     }
        // else loop to implementer for remediation
      }
    }
  ```

3. Runner HTTP contract fix (graceful failure, never 500 for expected code failures)
- Files
  - `packages/runner/src/server.ts`
  - If applicable: `packages/runner/src/compat.ts` code-discovery function used by runner.
- Intent
  - On execution/test failures, return HTTP 200 with `{ ok:false, reason, error }`, not 500. Still use 500 for internal server crashes only.
  - If code artifacts exist, proceed; if not, return structured `{ ok:false, reason:'no_code' }`.
- Pseudodiff
  ```
  --- a/packages/runner/src/server.ts
  +++ b/packages/runner/src/server.ts
  @@
    app.post('/run', async (req, res) => {
      const { execId } = req.body
      try {
        const files = await findCodeFiles(execId) // expects <execId>/code/**
        if (!files.length) {
  -       return res.status(500).json({ error: 'no code files' })
  +       return res.status(200).json({ ok: false, execId, reason: 'no_code_files', error: 'no code files found' })
        }
        const result = await runTestsAndBuild(execId)
        if (result.ok) {
          return res.status(200).json({ ok: true, execId, ...result })
        } else {
  -       return res.status(500).json({ error: result.error })
  +       return res.status(200).json({ ok: false, execId, reason: 'tests_failed', error: result.error, stats: result.stats })
        }
      } catch (e) {
        logger.error({ e }, 'runner_internal_error')
  -     return res.status(500).json({ error: 'internal_error' })
  +     return res.status(500).json({ ok: false, execId, reason: 'internal_error' })
      }
    })
  ```

4. Validator enforcement and touched flag
- File
  - `packages/validator/src/server.ts`
- Intent
  - Always run; emit deterministic JSON. Ensure readiness report sets `touched_validator: true` when invoked, regardless of pass/fail.
  - Enforce tests pass and coverage ≥80% global (align with ADR for validator-specific coverage if defined).
  - Never log secrets; only booleans/lengths in env guard.
- Pseudodiff
  ```
  --- a/packages/validator/src/server.ts
  +++ b/packages/validator/src/server.ts
  @@
    app.post('/validate', async (req, res) => {
      const { execId } = req.body
      const result = await performValidation(execId)
      const touched_validator = true
      const payload = { ...result, touched_validator }
      logger.info({ execId, touched_validator, verdict: result.verdict }, 'validator_completed')
      return res.status(200).json(payload)
    })
  ```

5. Reviewer service stub (advisory-only “fix plan”)
- Add new package skeleton
  - `packages/reviewer/package.json`
  - `packages/reviewer/src/server.ts`
  - `packages/reviewer/src/types.ts` (Zod schema for fix plan)
- Behavior
  - Accepts validator report, returns `{ plan: { steps:[...], priority:'low|med|high' }, advisory:true }`.
  - Does not override Validator verdict; MCA may optionally consume for implementer hints on subsequent remediation attempts.
- Example scaffolding (pseudo)
  ```
  // packages/reviewer/src/types.ts
  import { z } from 'zod'
  export const FixPlan = z.object({
    steps: z.array(z.string().min(1)),
    priority: z.enum(['low','medium','high'])
  })
  export type FixPlan = z.infer<typeof FixPlan>
  ```

  ```
  // packages/reviewer/src/server.ts
  import express from 'express'
  import { FixPlan } from './types'
  const app = express()
  app.use(express.json())
  app.post('/review', (req, res) => {
    const { validator } = req.body
    const plan = { steps: deriveSteps(validator), priority: 'medium' }
    return res.status(200).json({ advisory: true, plan })
  })
  app.listen(7060)
  ```

- Evidence
  - Reviewer runs optional; not a gate. No changes to validator gates.

- Stop condition (Phase 1)
  - Code implements:
    - Implementer always partial-handoffs.
    - MCA max attempts = 3, escalates.
    - Runner returns structured 200 on functional failure.
    - Validator sets `touched_validator` and enforces deterministic checks.
    - Reviewer stub exists.

Phase 2: CI / Supply Chain Hardening
- File
  - `.github/workflows/ci.yml`
- Intent
  - Start infra; build shared; launch services; run scripts; assert validator touched; enforce coverage; ban narrative; compare manifest; secret scan; SBOM; Cosign sign/verify; Scorecard.
- Insert/update steps in job `test` (or create a single job named `test`):
  ```
  jobs:
    test:
      runs-on: ubuntu-latest
      permissions:
        id-token: write       # for keyless signing
        contents: read
        security-events: write
        actions: read
      env:
        OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        E2B_API_KEY: ${{ secrets.E2B_API_KEY }}
        MINIO_ACCESS_KEY: ${{ secrets.MINIO_ACCESS_KEY }}
        MINIO_SECRET_KEY: ${{ secrets.MINIO_SECRET_KEY }}
        DATABASE_URL: ${{ secrets.DATABASE_URL }}
        REDIS_URL: ${{ secrets.REDIS_URL }}
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 20 }
        - name: Install deps
          run: npm ci

        - name: Docker infra up
          run: |
            docker compose -f infrastructure/docker-compose.yml up -d postgres redis minio tempo grafana

        - name: Build shared
          run: npm --prefix packages/shared run build

        - name: Launch services
          run: |
            nohup npm --prefix packages/gateway      run dev > /tmp/gw.log        2>&1 &
            nohup npm --prefix packages/planner      run dev > /tmp/planner.log   2>&1 &
            nohup npm --prefix packages/mca          run dev > /tmp/mca.log       2>&1 &
            nohup npm --prefix packages/implementer  run dev > /tmp/impl.log      2>&1 &
            nohup npm --prefix packages/runner       run dev > /tmp/runner.log    2>&1 &
            nohup npm --prefix packages/validator    run dev > /tmp/validator.log 2>&1 &
            sleep 5

        - name: Health sweep
          run: npx tsx scripts/collect-healthz.ts || true

        - name: E2E intent
          run: npx tsx scripts/run-e2e-intent.ts

        - name: Env guard
          run: |
            npm --prefix packages/shared run build
            npx tsx scripts/collect-env-guard.ts

        - name: Coverage
          run: npx tsx scripts/collect-coverage.ts

        - name: Readiness report
          run: npx tsx scripts/generate-readiness-report.ts

        - name: Narrative ban check
          run: |
            set -e
            disallowed='TODO|FIXME|I can.t run|we believe|should be fine|manual'
            if rg -nE "$disallowed" .automation/evidence/; then
              echo "Narrative prose detected in evidence"; exit 1; fi

        - name: Assert validator touched and coverage
          run: |
            node -e "const r=require('./.automation/evidence/v5-report.json'); if(!r.e2e?.touched_validator) { console.error('validator not touched'); process.exit(1)}"
            node -e "const c=require('./.automation/evidence/coverage.json'); if((c?.total?.lines?.pct||0)<80) { console.error('coverage below 80%'); process.exit(1)}"

        - name: Attest evidence (regen)
          run: bash scripts/attest-evidence.sh

        - name: Compare manifest
          run: |
            diff -u .automation/evidence/ATTACHMENT_MANIFEST.json <(cat .automation/evidence/ATTACHMENT_MANIFEST.json) || true
            # Re-generate and diff against repo version
            TMP=$(mktemp)
            cp .automation/evidence/ATTACHMENT_MANIFEST.json "$TMP"
            bash scripts/attest-evidence.sh
            cmp --silent "$TMP" .automation/evidence/ATTACHMENT_MANIFEST.json || (echo "Manifest mismatch" && exit 1)

        - name: Secret scan (Gitleaks)
          uses: gitleaks/gitleaks-action@v2
          with:
            args: detect --no-git --source . --redact
          continue-on-error: false

        - name: SBOM (CycloneDX)
          uses: anchore/sbom-action@v0
          with:
            path: .
            format: cyclonedx-json
            output-file: sbom.json

        - name: Install cosign
          uses: sigstore/cosign-installer@v3

        - name: Cosign attest (keyless)
          env:
            COSIGN_EXPERIMENTAL: "1"
          run: |
            tar -czf evidence.tar.gz .automation/evidence
            cosign attest --predicate sbom.json --predicate-type cyclonedx --yes evidence.tar.gz

        - name: Cosign verify (keyless)
          env:
            COSIGN_EXPERIMENTAL: "1"
          run: |
            cosign verify-blob --certificate-identity-regexp 'https://github.com/.+actions' --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' evidence.tar.gz

    scorecard:
      runs-on: ubuntu-latest
      permissions:
        contents: read
        security-events: write
        id-token: write
      steps:
        - uses: actions/checkout@v4
          with:
            persist-credentials: false
        - uses: ossf/scorecard-action@v2
          with:
            results_file: results.sarif
            results_format: sarif
            publish_results: true
        - uses: github/codeql-action/upload-sarif@v3
          with:
            sarif_file: results.sarif
        - name: Enforce minimum Scorecard
          run: |
            SCORE=$(jq -r '.score' results.sarif 2>/dev/null || echo 7)
            MIN=7
            if [ "$SCORE" -lt "$MIN" ]; then echo "Scorecard score $SCORE < $MIN"; exit 1; fi
  ```
- Stop condition
  - Workflow contains steps above; job `test` enforces validator touched, coverage, narrative ban, manifest compare; Cosign attest+verify; Scorecard; and secret scan.

Phase 3: Evidence Regeneration + Manifest Update (local)
- Secrets and process hygiene
  - `set -a; . ./.env; set +a`
  - Kill stray processes and free ports:
    ```
    pkill -f "packages/(gateway|planner|mca|implementer|runner|validator)" || true
    sleep 1
    lsof -i :3030 -t | xargs kill -9 2>/dev/null || true
    lsof -i :7010 -t | xargs kill -9 2>/dev/null || true
    lsof -i :7020 -t | xargs kill -9 2>/dev/null || true
    lsof -i :7030 -t | xargs kill -9 2>/dev/null || true
    lsof -i :7040 -t | xargs kill -9 2>/dev/null || true
    lsof -i :7050 -t | xargs kill -9 2>/dev/null || true
    ```
- Infra
  - `docker compose -f infrastructure/docker-compose.yml down --remove-orphans`
  - `docker compose -f infrastructure/docker-compose.yml up -d postgres redis minio tempo grafana`
- Build and launch
  - `npm --prefix packages/shared run build`
  - Launch services with nohup (as in Phase 2).
  - Confirm ports 3030/7010/7020/7030/7040/7050 are listening.
- Evidence scripts
  - `npx tsx scripts/collect-healthz.ts || true`
  - `npx tsx scripts/run-e2e-intent.ts`
  - `npm --prefix packages/shared run build && npx tsx scripts/collect-env-guard.ts`
  - `npx tsx scripts/collect-coverage.ts`
  - `npx tsx scripts/generate-readiness-report.ts`
  - `bash scripts/attest-evidence.sh`
- Narrative scan and quarantine
  - Grep for disallowed phrases in `.automation/evidence/`; if any, move offending file(s) to `.automation/evidence_quarantined/<UTC>/`, regenerate evidence, rerun attestation, recommit.
- Commit
  - `git add .automation/evidence`
  - `git commit -m "chore(evidence): regenerate machine evidence and attestation (validator touched)"`
- Stop condition
  - Evidence files present and clean; manifest updated; `v5-report.json` shows `touched_validator: true`.

Phase 4: CI Validation Loop
- Push branch
  - `git push`
- Observe CI
  - `gh run watch --exit-status` for the current branch or monitor web UI.
- Iterate until green
  - Fix failing gates (Phase 1/2) and repeat Phase 3 as needed.
- Capture machine evidence (optional)
  - Save CI run ID, job names, statuses into `.automation/evidence/v5-report.json` auxiliary fields if your scripts support it.
- Stop condition
  - CI green with all enforced checks.

Phase 5: Release Branch Cut
- Create and push
  ```
  UTCSTAMP=$(date -u +%Y%m%dT%H%M%SZ)
  git checkout -b release/secure-$UTCSTAMP
  bash scripts/attest-evidence.sh
  git add .automation/evidence/ATTACHMENT_MANIFEST.json
  git commit -m "attest: final manifest for release/secure-$UTCSTAMP"
  git push -u origin release/secure-$UTCSTAMP
  ```
- Branch protection (using GitHub CLI; replace ORG/REPO)
  ```
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
  gh api -X PUT repos/$REPO/branches/release/secure-$UTCSTAMP/protection \
    -f required_status_checks.strict=true \
    -F required_status_checks.contexts[]='test' \
    -F required_status_checks.contexts[]='scorecard' \
    -f enforce_admins=true \
    -F required_pull_request_reviews.required_approving_review_count=1 \
    -f restrictions=null
  gh api -X PUT repos/$REPO/branches/release/secure-$UTCSTAMP/protection/required_signatures -f enabled=true || true
  ```
- Stop condition
  - Release branch pushed; attested; protection enabled; CI green.

5. EVIDENCE & ATTESTATION RULES
- Only allowed files in `.automation/evidence/`:
  - `coverage.json`
  - `healthz_sweep.json`
  - `e2e_request_response.json`
  - `prod_env_guard.json`
  - `v5-report.json`
  - `ATTACHMENT_MANIFEST.json`
  - `.gitkeep`
  - `TAMPERING_ALERT.txt`
- No narrative prose allowed in evidence.
- `ATTACHMENT_MANIFEST.json` must include:
  - `commit` (current HEAD)
  - `generated_at_utc`
  - `files[]` with `path`, `sha256`, `size_bytes`
- Regenerate manifest with `scripts/attest-evidence.sh` after changes and commit immediately.

6. CI ENFORCEMENT & BRANCH PROTECTION
- CI must:
  - Load secrets from GitHub Actions encrypted secrets; never log secret values.
  - Start infra; launch services; run evidence scripts; enforce gates:
    - validator touched
    - coverage ≥80%
    - no narrative evidence
    - manifest matches
  - Run secret scan (Gitleaks or equivalent).
  - Generate SBOM (CycloneDX).
  - Cosign attest and verify (keyless via OIDC).
  - Run OpenSSF Scorecard and enforce minimum policy.
- Branch protection:
  - Required status checks include the main `test` job and `scorecard`.
  - Force-push disabled; review required; linear history preferred.

7. FINAL DECLARATION / HANDOFF CHECKLIST
Fill and record under `/docs/release/` when complete:
- Hardening branch: <name>
- Hardening commit SHA: <sha>
- Release branch: release/secure-<UTC>
- Release commit SHA: <sha>
- Validator touched: true (from `.automation/evidence/v5-report.json`)
- Coverage total lines %: <value> (from `coverage.json`)
- Verdict: <READY | POTENTIAL_READY | NEEDS_REMEDIATION | NOT_READY> (from `v5-report.json`)
- ATTACHMENT_MANIFEST match: yes
- Secret scan: pass
- SBOM generated: yes
- Cosign attest/verify: pass
- Scorecard: >= policy threshold
- CI runs: job IDs and final status
- Final statement:
  - “READY FOR PRODUCTION” or “NOT READY – BLOCKERS REMAIN: <list>”

8. Repository Hygiene / Naming & Layout Policy (MANDATORY)

You will follow this policy for all new code, docs, branches, evidence, commits, and CI artifacts. You will also refactor anything that violates this policy before cutting a production candidate branch.

8.1 Top-level directory layout going forward
- `/packages/`
  - All services (gateway, planner, mca, implementer, runner, validator, future reviewer) live here.
  - Service code, tests, and runtime configs belong in that service’s subfolder.
  - Do not create ad-hoc top-level service folders outside `/packages`.
- `/infrastructure/`
  - Docker compose, infra bootstrap, local infra scripts, OTEL, observability wiring, etc.
  - Do not duplicate docker-compose configs in random scratch folders.
- `/docs/`
  - Authoritative human-readable text. All design, ADRs, incident writeups, architectural notes, security notes.
  - Nothing in `/docs` is runtime evidence. Evidence lives elsewhere.
  - Substructure:
    - `/docs/adr/` — Architecture Decision Records (ADRs). One decision per ADR.
    - `/docs/incidents/` — Security/quality incidents, quarantine actions, forensics, containment.
    - `/docs/release/` — Final release justifications and leadership summaries.
    - `/docs/mission/` — Active control contract (this file). Only one canonical current file; move older specs to `/docs/mission/archive/`.
- `/.automation/`
  - `/.automation/evidence/` — ONLY machine-generated evidence (coverage.json, v5-report.json, etc.). Every file appears in `ATTACHMENT_MANIFEST.json`.
  - `/.automation/evidence_quarantined/<UTC>/` — Quarantined human-authored “evidence.”
  - `/.automation/scripts/` — Evidence generator scripts.
- `/scratch_local/` (new; gitignored)
  - Optional temp notes and scratchpads; never committed.

If a new file doesn’t clearly belong, define a rule under `/docs/mission/` and place it accordingly; do not drop ad-hoc files at repo root.

8.2 Naming conventions for folders and files
- ADRs (`/docs/adr/`)
  - Name: `YYYYMMDD-<short-kebab-slug>.md` (e.g., `20251026-bounded-mca-remediation-loop.md`).
  - Include context, options, decision, consequences.
- Incident folders (`/docs/incidents/`)
  - Name: `INCIDENT-<YYYYMMDD>T<HHMMZ>-<short-kebab-slug>/` (e.g., `INCIDENT-20251026T0113Z-evidence-tampering/`).
  - Include `incident.md`, `containment.md`, and `ATTACHMENT_MANIFEST.snapshot.json` (manifest snapshot only).
- Mission / operating contract
  - Live file: `/docs/mission/MISSION_OPTION_A_EXECUTION.md`.
  - When superseded: move prior into `/docs/mission/archive/` with timestamp prefix like `20251026T0113Z-MISSION_OPTION_A_EXECUTION.md`.
- Evidence files
  - Allowed only: `coverage.json`, `healthz_sweep.json`, `e2e_request_response.json`, `prod_env_guard.json`, `v5-report.json`, `ATTACHMENT_MANIFEST.json`, `.gitkeep`, `TAMPERING_ALERT.txt`.
  - No free-text `.md` or `.txt` explanations in evidence.
  - CI fails if evidence directory contains non-allowlisted files or narrative content.

8.3 Branch naming and branch protection
- Allowed branch prefixes
  - `feature/<ticket-or-scope>-<kebab-summary>`
  - `fix/<ticket-or-scope>-<kebab-summary>`
  - `chore/<scope>-<kebab-summary>`
  - `secure_hardening_<UTC>`
  - `release/secure-<UTC>`
- Protection rules for `secure_hardening_*` and `release/*`
  - Block force-push.
  - Require status checks before merge.
  - Require linear history/no merge commits unless CI-approved.
  - Require at least one review.
  - Require CI job `test` (the enforcement pipeline) to be green.

8.4 Commit message rules (Conventional Commits)
- Format: `<type>(<optional-scope>): <short imperative description>`
- Types: `feat`, `fix`, `docs`, `ci`, `chore`, `test`, `refactor`
- Examples:
  - `fix(mca-remediation): bound remediation loop at 3 attempts`
  - `ci(supply-chain): add cosign attestation + OpenSSF Scorecard`
  - `docs(adr): record Option A bounded-remediation decision`
- Security-impacting fixes must use `fix(...)`. Avoid vague commit messages.

8.5 Evidence generation + manifest discipline
- After each full successful run, regenerate evidence and manifest; commit with `ci(...)` or `chore(evidence): ...`.
- CI must regenerate and diff manifest; fail if mismatched or narrative exists.
- Attestation and manifest hashing are required gates.

8.6 Cleanup + migration requirements (do now)
- Create `/docs/adr/`, `/docs/incidents/`, `/docs/mission/`, `/docs/mission/archive/`, `/docs/release/`, `/scratch_local/` (gitignored).
- Move stray design/incident/policy markdown into proper subfolders with timestamped names; remove stale duplicates.
- Ensure `.automation/evidence/` contains only allowed files; move others to `.automation/evidence_quarantined/<UTC>/`.
- Update `.gitignore` to include `/scratch_local/`.
- Regenerate `ATTACHMENT_MANIFEST.json`, commit with `ci(evidence): refresh manifest after repo hygiene`.

8.7 Enforcement
- Update CI to fail if:
  - New files appear at repo root outside policy.
  - Markdown appears outside `/docs/**` (except package READMEs).
  - Evidence contains non-allowlisted files or narrative content.
  - Commit messages violate Conventional Commits.
- Require `test` CI job green before merges into protected branches.

8.8 Summary actions
- Create/verify canonical folders.
- Relocate and rename stray docs.
- Quarantine narrative evidence; scrub evidence dir.
- Enforce branch naming and Conventional Commits.
- Update CI to reject narrative, regen/diff manifest, assert validator touched, enforce coverage ≥80%, and block policy violations.

9. RED IS RED (Explicit)
- You are forbidden from bypassing failing checks.
- If CI is red, the branch cannot advance.
- If coverage < threshold, the branch cannot advance.
- If Cosign attestation or verification fails, the branch cannot advance.
- If OpenSSF Scorecard fails policy, the branch cannot advance.
- If `touched_validator` is false, the branch cannot advance.
- Loop Phase 1 → 2 → 3 → 4 until all gates are green; only then proceed to Phase 5.

10. REQUIRED PROOFS PER PHASE (to be captured under .automation/evidence/)
- Phase 0
  - Branch and HEAD SHA recorded in CI/run context.
- Phase 1
  - Code diffs committed; relevant unit/integration tests updated if present.
- Phase 2
  - Updated `.github/workflows/ci.yml` in repo.
- Phase 3
  - Regenerated:
    - `.automation/evidence/healthz_sweep.json`
    - `.automation/evidence/e2e_request_response.json`
    - `.automation/evidence/prod_env_guard.json`
    - `.automation/evidence/coverage.json`
    - `.automation/evidence/v5-report.json` with `e2e.exercised_chain === true` and `e2e.touched_validator === true`
    - `.automation/evidence/ATTACHMENT_MANIFEST.json`
- Phase 4
  - CI run IDs, job names, statuses recorded (if supported by your scripts).
- Phase 5
  - Final manifest re-attested and committed on `release/secure-<UTC>`.
  - Branch protection rules applied.

References
- Cosign keyless signing via OIDC and attestations: docs.gitlab.com
- Secret scanning in CI (Gitleaks): InfraCloud
- OpenSSF Scorecard policy enforcement: Microsoft for Developers

