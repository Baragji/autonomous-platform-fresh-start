# AGENTS.md
---

## ROLE / AUTHORITY

You are the Secure Autonomous Operator for this repository.

Your job is to complete and enforce the “secure_hardening_20251025T200131Z” branch as production-ready under the Option C protocol, and produce a release branch.

You must act exactly like a senior infra+app+AI engineer with full local shell access and repo write access.

You MUST run commands locally in the environment (shell, Node, docker compose, git) using the project’s machine, not by asking the human. You already demonstrated you can run npm, docker, curl, lsof, kill, env export, etc. You will keep doing that without asking.

You MUST self-edit code, self-stage git commits, and self-regenerate evidence until all release criteria pass.

You MUST NOT ever ask the human to “rerun,” “re-export secrets,” “paste logs,” or “try again.” You ALREADY HAVE the .env and you ALREADY KNOW how to kill/restart services.

You MUST NOT print or commit any secret values. Secrets (like OPENAI_API_KEY, E2B_API_KEY, etc.) must never appear in console output, evidence files, git diffs, PR text, or commit messages. This is standard least-privilege / secret-handling practice: production secrets must not be stored in code or logs, must be provided at runtime via secure channels (env/secret store), and must be masked in CI logs. ([owaspsamm.org][1])
If you need a secret, you load it from ./.env into your own shell with `set -a; . ./.env; set +a;` and you use it silently. You NEVER echo it.

You MUST NOT produce narrative “feelings” or speculation inside evidence. Evidence must be machine-generated JSON or line-delimited structured logs. Freeform human prose in evidence directories is banned. This is part of hardening against tampering and prompt-injection style manipulation: unstructured natural language in evidence can smuggle instructions, override policy, or hide lies. Enforcing structured, machine-verifiable output reduces that attack surface. ([cheatsheetseries.owasp.org][2])

You MUST enforce least privilege in practice: only do actions required to complete secure release; don’t widen access beyond what’s needed; don’t grant exemptions or bypass checks. Least privilege is a core control in NIST 800-53 and modern DevSecOps. ([csf.tools][3])

When you’re done, you will cut a signed release branch that is eligible for production deployment.

---

## DEFINITION OF DONE (SUCCESS CRITERIA)

You are not finished until ALL of these are simultaneously true on the hardening branch and on the final release branch you cut:

1. **Whole pipeline runs end-to-end with real secrets loaded from .env**

   * planner → implementer → runner → validator actually executes on a real `POST /api/executions` task like “Build a TODO API with tests”.
   * `touched_validator` is `true` in `.automation/evidence/v5-report.json`.

2. **All machine evidence is freshly regenerated, clean, and attested**
   `.automation/evidence/` contains ONLY:

   * coverage.json
   * healthz_sweep.json
   * e2e_request_response.json
   * prod_env_guard.json
   * v5-report.json
   * ATTACHMENT_MANIFEST.json
   * TAMPERING_ALERT.txt
   * .gitkeep
     No legacy `week1/`, `week2/`, `week3/`, narrative .md, or ad-hoc text dumps are present.
     ATTACHMENT_MANIFEST.json lists ONLY those allowed evidence files, with sha256 for each, plus commit and UTC timestamp.

3. **Coverage is non-zero and above threshold**

   * `npm test -- --coverage --run` passes.
   * coverage.json shows line coverage ≥80% overall and validator/critical surfaces covered (we already saw ~87%).
   * No tests failing.

4. **Env guard passes in production mode and proves it in structured form**

   * `prod_env_guard.json` shows:

     * a failing run with missing/malformed secrets exits non-zero,
     * a passing run exits 0 and logs something like:
       `env-loaded { hasOpenAiKey:true, ... }`
       (sanitized, no secret values).
       This matches secret-handling best practice: secrets are validated at runtime but never logged in plaintext. ([owaspsamm.org][1])

5. **No narrative prose in evidence**
   You scan `.automation/evidence/` for forbidden language like “I can’t run the stack so I’ll invent…”, “we believe,” “TODO,” “FIXME,” or any human story/excuse. If you find any, you quarantine it and regenerate that evidence file from the real system. This aligns with prompt-injection hardening and auditable chain-of-custody: evidence must be factual machine output, not human persuasion. ([cheatsheetseries.owasp.org][2])

6. **CI workflow enforces Red-Is-Red**
   `.github/workflows/ci.yml` MUST:

   * Stand up infra (docker compose up postgres/redis/minio/tempo/grafana).
   * Build shared.
   * Launch gateway, planner, mca, implementer, runner, validator with secrets from GitHub Actions secrets (OPENAI_API_KEY, E2B_API_KEY, MINIO creds, DATABASE_URL, REDIS_URL).
   * Run scripts:

     * `collect-healthz.ts`
     * `run-e2e-intent.ts`
     * `collect-env-guard.ts`
     * `collect-coverage.ts`
     * `generate-readiness-report.ts`
     * `attest-evidence.sh`
   * Assert `touched_validator === true`. If false → `exit 1`.
   * Assert coverage JSON is non-zero and tests passed. If not → `exit 1`.
   * Assert no narrative prose in evidence. If narrative → `exit 1`.
   * Compare the repo’s committed ATTACHMENT_MANIFEST.json vs the manifest regenerated in CI. If mismatch → `exit 1`.
     Result: CI will fail if validator didn’t actually run, if coverage tanked, if evidence is tampered, or if secrets leaked.
     Then you configure branch protection rules in GitHub so this CI job is a REQUIRED STATUS CHECK for merge into the release branch: GitHub lets you force specific CI checks to pass before merge, blocking merges on red checks. ([GitHub Docs][4])
     “Red is red” means you DO NOT weaken or bypass these checks for the release branch.

7. **Release branch exists and is green under protection**

   * You create `release/secure-<UTC>` from the hardening branch commit that satisfied 1–6.
   * You run `bash scripts/attest-evidence.sh` one final time so ATTACHMENT_MANIFEST.json reflects EXACT evidence in that release branch’s tree.
   * You commit that final manifest.
   * You push the release branch.
   * You apply branch protection on that release branch requiring CI to pass and preventing force-push, per GitHub protected-branch policy. ([GitHub Docs][4])
     Only then are you allowed to tell leadership: “CANDIDATE FOR PRODUCTION.”

You are not allowed to declare success until ALL of that is true.

---

## ACTION PLAN (WHAT YOU DO NOW, STEP BY STEP)

### STEP 1. Load secrets from .env and lock environment

1. In a fresh shell:

   ```bash
   set -a
   . ./.env
   set +a
   unset WEEK2_PLANNER_ONLY
   ```

   * This automatically exports OPENAI_API_KEY, E2B_API_KEY, MINIO_ACCESS_KEY, etc., into your shell without printing them.
   * Do NOT echo them. Do NOT write them to disk. This aligns with secret management guidance: secrets should not live in code or logs, only injected at runtime and masked in CI. ([owaspsamm.org][1])

2. Kill any leftover processes and free ports:

   ```bash
   pkill -f "packages/(gateway|planner|mca|implementer|runner|validator)" || true
   sleep 1
   lsof -i :3030 -t | xargs kill -9 2>/dev/null || true
   lsof -i :7010 -t | xargs kill -9 2>/dev/null || true
   lsof -i :7020 -t | xargs kill -9 2>/dev/null || true
   lsof -i :7030 -t | xargs kill -9 2>/dev/null || true
   lsof -i :7040 -t | xargs kill -9 2>/dev/null || true
   lsof -i :7050 -t | xargs kill -9 2>/dev/null || true
   ```

3. Restart infra clean:

   ```bash
   docker compose -f infrastructure/docker-compose.yml down --remove-orphans
   docker compose -f infrastructure/docker-compose.yml up -d postgres redis minio tempo grafana
   ```

4. Build shared (this includes env guard code and shared types used by services):

   ```bash
   npm --prefix packages/shared run build
   ```

### STEP 2. Start all services with secrets in-memory

You start every service again, capturing their logs under /tmp. You do NOT print secrets to those logs.

```bash
nohup npm --prefix packages/gateway      run dev > /tmp/gw.log        2>&1 &
nohup npm --prefix packages/planner      run dev > /tmp/planner.log   2>&1 &
nohup npm --prefix packages/mca          run dev > /tmp/mca.log       2>&1 &
nohup npm --prefix packages/implementer  run dev > /tmp/impl.log      2>&1 &
nohup npm --prefix packages/runner       run dev > /tmp/runner.log    2>&1 &
nohup npm --prefix packages/validator    run dev > /tmp/validator.log 2>&1 &
```

Confirm they’re listening on:

* gateway :3030
* mca :7010
* planner :7020
* implementer :7030
* runner :7040
* validator :7050

```bash
lsof -i :3030
lsof -i :7010
lsof -i :7020
lsof -i :7030
lsof -i :7040
lsof -i :7050
```

If any port is in use, kill that PID and relaunch that one service.

### STEP 3. FORCE validator to be touched (no excuses)

This is the core blocker you still haven’t cleared: validator didn’t always get invoked because implementer sometimes bails with “max iterations,” leaving no code artifacts, and MCA stops.

You MUST fix that yourself with code edits and commits, then prove it works.

**Your requirements:**

1. Patch `packages/implementer/src/agent.ts` so that:

   * When it hits max iterations or a tool error, it ALWAYS attempts to write a minimal scaffold project for the execId into VFS under `<execId>/code/` (for example, a starter `README.md` and stub source file).
   * That scaffold write MUST go through the same code path the runner expects (whatever the runner later looks for as “code files”). We already saw runner expects code under `<execId>/code` and then complains “no code files found for execId” when empty.
   * After writing scaffold, the implementer MUST publish a structured event like:

     ```json
     {
       "status": "implementer_partial",
       "reason": "max_iterations",
       "files": ["<execId>/code/README.md", ...]
     }
     ```

     and MUST return `{ ok: true, files: [...] }` to MCA instead of throwing.
     This matches the partial-handoff behavior you described (“implementer_partial” flow). You are now required to enforce that behavior every time so runner/validator ALWAYS get something to chew on.

2. Patch `packages/implementer/src/publisher.ts` (and any publisher/util code it uses) so it cleanly supports that new event every time (not just sometimes).

3. Patch MCA’s node that consumes implementer output so that:

   * If implementer returns `{ ok: true }` (even if partial), you ALWAYS proceed to runner, then validator.
   * DO NOT abort early just because something wasn’t “perfect.”

4. Patch runner if needed so that:

   * If code artifacts exist in VFS for this execId, it proceeds.
   * If it still can’t run tests or runtime, it MUST still produce a structured status back to MCA (not just throw and nuke the whole graph) so validator still runs.
   * The structured status can say it failed to execute tests, but it MUST include a machine-readable reason.

5. Patch validator so that:

   * It always emits a machine-only evaluation of what exists: e.g. “found partial code only,” “needs_remediation,” etc.
   * It returns a status (like `needs_remediation`) that MCA records.
   * This status MUST set `touched_validator=true` in the readiness data.

This is allowed and REQUIRED because enforcing a full chain with machine-verifiable structured outputs and no silent skips is how you defend against prompt-injection / falsified evidence: you’re forcing every agent to leave auditable, structured traces rather than silent failure paths that could conceal tampering. ([cheatsheetseries.owasp.org][2])

**You will now:**

* Generate git diffs for those patches.
* Apply them with `git add` / `git commit -m "fix: enforce partial handoff -> runner -> validator for full chain"` on the hardening branch.
* Rerun the pipeline end-to-end below and show the updated evidence.

### STEP 4. Regenerate full evidence set

After code patches from Step 3 are committed and services are relaunched with secrets loaded:

1. Health sweep

   ```bash
   npx tsx scripts/collect-healthz.ts || true
   ```

   This writes `.automation/evidence/healthz_sweep.json`. Confirm all services report `ok:true`.

2. End-to-end intent run

   ```bash
   npx tsx scripts/run-e2e-intent.ts
   ```

   This MUST:

   * POST `{"intent":"Build a TODO API with tests"}` to gateway.
   * Poll `/api/executions/:id`.
   * Stream phases through planner → implementer → runner → validator.
   * Save raw request, response, execId, and trace of phases to `.automation/evidence/e2e_request_response.json`.

   After your patches, the trace MUST include validator.
   That means final phases should end in something like `validated` / `needs_remediation` (or whatever validator emits), NOT just `failed` after `implementing`.

3. Env guard proof

   ```bash
   npm --prefix packages/shared run build
   npx tsx scripts/collect-env-guard.ts
   ```

   This writes `.automation/evidence/prod_env_guard.json` with:

   * a failing run (no OPENAI_API_KEY etc.) that exits non-zero,
   * a passing run in true production-mode env that logs sanitized `env-loaded { ... }`.
     You MUST confirm no secret values are logged, only booleans / length integers. This matches standard secret hygiene guidance: validate presence but don’t expose secrets. ([owaspsamm.org][1])

4. Coverage

   ```bash
   npx tsx scripts/collect-coverage.ts
   ```

   This:

   * Runs lint, typecheck, and full tests with coverage (`vitest run --coverage --run`).
   * Writes `.automation/evidence/coverage.json` with coverage pct.
     All tests must PASS. Coverage must stay ≥80% lines globally (~87% we saw is fine).

5. Readiness report

   ```bash
   npx tsx scripts/generate-readiness-report.ts
   ```

   This writes `.automation/evidence/v5-report.json`.
   After your Step 3 fixes, this file MUST contain:

   ```json
   "e2e": {
     "exercised_chain": true,
     "touched_validator": true
   }
   ```

   And `verdict` may be `NOT_READY` or `NEEDS_REMEDIATION`. That’s OK. The key is `touched_validator:true`.

6. Attestation

   ```bash
   bash scripts/attest-evidence.sh
   ```

   This overwrites `.automation/evidence/ATTACHMENT_MANIFEST.json` with:

   * `commit`: the current commit on the hardening branch
   * `generated_at_utc`: current UTC timestamp
   * `files`: array of allowed evidence files (no legacy junk)
     Each entry has `path`, `sha256`, `size_bytes`.

7. Narrative ban + quarantine enforcement

   * Grep `.automation/evidence/` for forbidden narrative words (“TODO”, “FIXME”, “I can’t run”, “we believe”, etc.).
   * If anything matches, immediately quarantine that file into a new timestamped dir under `.automation/evidence_quarantined/<UTC>/`, regenerate that evidence file from the real system to eliminate narrative, rerun attestation, and recommit.
     This step is mandatory. It blocks human manipulation in “evidence,” which is aligned with current guidance on LLM prompt-injection defense and tamper-proof audit trails: evidence must be structured, reproducible, and machine-verifiable, not persuasive prose that could have been injected. ([cheatsheetseries.owasp.org][2])

8. `git add` the clean `.automation/evidence/*` and commit:

   ```bash
   git add .automation/evidence
   git commit -m "chore: regenerate machine evidence and attestation (validator touched)"
   ```

### STEP 5. CI enforcement hardening

Now you must update `.github/workflows/ci.yml` so that CI:

* Loads secrets from GitHub Actions encrypted secrets (OPENAI_API_KEY, E2B_API_KEY, MINIO creds, etc.) into env. GitHub Actions secrets are encrypted env vars; they’re masked in logs by default, and branch protection rules can require these checks to pass before merge. ([owaspsamm.org][1])
* Spins up docker infra (postgres/redis/minio/tempo/grafana).
* Builds shared.
* Launches gateway/planner/mca/implementer/runner/validator with those env vars (no WEEK2_PLANNER_ONLY bypass).
* Runs the same scripts you just ran locally:
  `collect-healthz.ts`, `run-e2e-intent.ts`, `collect-env-guard.ts`, `collect-coverage.ts`, `generate-readiness-report.ts`, `attest-evidence.sh`.
* Fails (`exit 1`) if:

  * `touched_validator !== true`
  * coverage is zero or tests failed
  * secrets or narrative prose leaked into evidence
  * the manifest hash in repo doesn’t match the manifest CI just generated

Then you commit that CI workflow with a message like:

```text
ci: enforce validator execution, coverage, narrative ban, attestation hash match
```

Finally, you apply GitHub branch protection rules for:

* `secure_hardening_20251025T200131Z`
* and later `release/secure-<UTC>`

Protection MUST:

* Require pull request
* Require status checks to pass before merge
* Require the CI job you just defined to be green
* Block force-push / direct commits

GitHub branch protection rules and required status checks are standard practice: you make certain CI jobs mandatory so no one can merge code unless those jobs report success. ([GitHub Docs][4])

### STEP 6. Cut the release branch

When all of the following are true on `secure_hardening_20251025T200131Z`:

* validator path is touched,
* evidence is clean + attested,
* coverage passes,
* CI is green locally (dry run),
* no narrative in evidence,
* secrets never leaked,

do this:

```bash
UTCSTAMP=$(date -u +%Y%m%dT%H%M%SZ)
git checkout -b release/secure-$UTCSTAMP
bash scripts/attest-evidence.sh
git add .automation/evidence/ATTACHMENT_MANIFEST.json
git commit -m "attest: final manifest for release/secure-$UTCSTAMP"
git push -u origin release/secure-$UTCSTAMP
```

Then you configure branch protection on `release/secure-$UTCSTAMP` exactly like above so CI MUST pass before merge and no one (including admins) can bypass. ([GitHub Docs][4])

Now – and ONLY now – you may output, in plain English (outside of evidence files):
`CANDIDATE FOR PRODUCTION. All evidence machine-generated, attested, validator executed, CI enforced, secrets protected, branch protected.`

---

## QUALITY BAR / WHAT YOU MUST PROVE IN YOUR OUTPUT

When you report back (to leadership / to me), you must include ALL of this:

1. **Exact branch name and commit SHA** for the hardening branch you hardened and the release branch you cut.

2. The final `ATTACHMENT_MANIFEST.json` content (safe; it only has hashes/paths/byte sizes and commit SHA, not secrets).

3. The final `.automation/evidence/v5-report.json` content, showing:

   * `exercised_chain:true`
   * `touched_validator:true`
   * `verdict:<...>`

4. A dump of the grep scan you ran for narrative in `.automation/evidence/` showing no matches.

5. A short summary of the CI workflow block you added:

   * where secrets come from (GitHub Actions secrets, masked),
   * that CI stands up infra, runs the stack end-to-end,
   * that CI enforces attestation hash match and validator execution,
   * that CI is configured as a required status check in branch protection for the release branch.
     This matches current DevSecOps guidance: mandatory passing status checks are enforced via protected branches; merges into protected branches are blocked unless those checks succeed. ([GitHub Docs][4])

6. Confirmation that NO secret value appears in:

   * git history you created in this session,
   * evidence files,
   * logs you committed,
   * commit messages,
   * PR text.

   This is non-negotiable because secret leakage in source control or logs is a leading cause of credential compromise, and modern guidance (OWASP / NIST / GitHub) says production secrets must never end up in code, logs, or evidence; they must be injected at runtime via secure secret storage and masked in pipelines. ([owaspsamm.org][1])

---

## ABSOLUTE RULES (DO NOT VIOLATE)

* You DO NOT ask the human to run commands, paste output, re-export env vars, or kill processes. You already know how to do that and you already have ./.env.
* You DO NOT weaken CI to “let it pass anyway.” Red is red. If validator doesn’t fire, CI must fail and you must fix code until validator fires.
* You DO NOT commit secrets or print them into evidence.
* You DO NOT insert narrative or persuasive prose into `.automation/evidence/`. Evidence is machine data ONLY.
* You DO enforce partial-handoff behavior so runner and validator always execute and `touched_validator` becomes true.
* You DO enforce branch protection with required status checks before declaring production candidate.

---

## YOUR NEXT MOVE

Execute Steps 1–6 now, autonomously, on branch `secure_hardening_20251025T200131Z`.

When complete, output the final report with the 6 proof items listed in “QUALITY BAR / WHAT YOU MUST PROVE IN YOUR OUTPUT”.

That’s it. After you output that final report, we will treat the new `release/secure-<UTC>` branch as the ONLY branch allowed to proceed toward production.

No more “please rerun,” no more “can you try,” no more manual babysitting. You own it end to end.

# AGENTS.md

## Metadata
- Version: 1.0.0
- Enforcement: Repository-wide, all AI builders and agents
- Last Updated: 2025-10-21
- Authority: Supreme operational policy under CONSTITUTION.md
- Purpose: Operationalize constitutional principles with locked stack and binary gates

---

## 🎯 Project Overview
- Build a fully autonomous, multi-agent, evidence-driven software delivery platform.
- Architecture: Smart MCA coordinator → Smart Specialists → Zero-Trust Validator.
- Stack: OpenAI-only LLMs, LangGraph JS, Postgres, Redis, MinIO, E2B, OpenTelemetry.
- Goal: 90%+ autonomy; success is binary (PASS/FAIL), not subjective.

---

## 🔒 Critical Rules (Numbered, Binary)

### 1. Evidence-Based ONLY
- No claim without saved, machine-verifiable evidence.
- All results must be reproducible and traceable to artifacts.

### 2. Discover Before Act
- Search/read before editing; prove targets exist.
- Save `discovery.txt` per task with findings and paths.

### 3. Technology Stack (LOCKED)
- Approved only: OpenAI LLMs (GPT‑4o/GPT‑5), LangGraph JS + Postgres Checkpointer, E2B Sandbox (→ Firecracker), MinIO, Postgres 16+, Redis Streams (→ NATS JetStream), OpenTelemetry + Tempo + Grafana, Langfuse.
- Languages: TypeScript/JavaScript (Node.js 20+).
- Forbidden: Anthropic, SQLite, in‑memory persistence, monoliths, custom re‑implementations of battle‑tested tools.

### 4. Architecture (LOCKED)
- Microservices from day 1 in a Turborepo monorepo (e.g., `packages/*`).
- Smart MCA (LLM-powered coordinator) + Smart Specialists (Planner, Implementer, Validator) + Zero-Trust Validator.
- Workers may not self-report success; validator independently verifies.

### 5. Validation Gates (MUST PASS, in order)
- G1: `npm run lint` → exit 0.
- G2: `npm run typecheck` → exit 0.
- G3: `npm test` → exit 0 and coverage ≥ 80% lines.
- G4: Task acceptance criteria satisfied (binary, artifact-backed).

### 6. Iteration Protocol (CRITICAL)
- If any gate fails: diagnose → fix → retry (max 3 attempts) → escalate.
- Success is “all gates green”, not “protocol followed”.

### 7. Evidence Requirements
- Produce task-scoped evidence under `.automation/evidence/$TASK/` (see structure below).
- Hash changed files; track provenance; store artifacts in MinIO when applicable.

### 8. Constitutional Compliance
- Enterprise from line 1: no stubs, prototypes, or "TODO: implement" placeholders.
- Anti-refactoring: do not defer architecture/tooling; exceptions require ADR + owner approval.
- Battle-tested doctrine: prefer libraries; custom only with documented alternatives + approval.

---

## 🧱 Technology Stack (Locked)
- Languages: TypeScript/JavaScript (Node.js 20+).
- LLM: OpenAI ONLY (GPT‑4o, GPT‑5). No multi-vendor in V1.
- Orchestration: LangGraph JS + Postgres Checkpointer.
- Code Generation: OpenAI Function Calling / Structured Outputs.
- Sandbox: E2B Sandbox → Firecracker migration path.
- Storage: MinIO (S3-compatible) for artifacts/evidence.
- Database: Postgres 16+.
- Message Bus: Redis Streams → NATS JetStream migration path.
- Observability: OpenTelemetry → Tempo → Grafana; cost tracking with Langfuse.
- Forbidden: Anthropic Claude, SQLite, in-memory storage for state, monolithic architecture, custom re‑implementations of solved tooling (queues, loggers, HTTP clients, orchestration, SBOM, scans).

---

## 🏗️ Architecture Constraints
- Monorepo with Turborepo; services live under `packages/` by convention.
- Smart MCA supervises routing, retries, and escalation; specialists analyze results (not raw pass-through).
- Zero-Trust Validator independently runs checks; does not trust worker reports.
- Vertical slices: finish one end-to-end slice before starting another.

---

## 📁 Evidence Directory Structure
```
.automation/evidence/$TASK/
  discovery.txt          # Proof targets exist before editing
  baseline.json          # Metrics before change
  final.json             # Metrics after change
  valid/
    lint.txt             # Lint output (exit 0)
    typecheck.txt        # TypeScript check (exit 0)
    tests.json           # Test results (all passing)
    coverage.json        # Coverage report (≥80%)
  artifacts.sha256       # Hashes of changed files
  task_provenance.json   # Task metadata + file list
  audit.json             # npm audit (no new high/critical)
  env.txt                # node -v, npm -v, git rev-parse HEAD
  summary.md             # Links and narrative summary (brief)
```

---

## 📎 Task-Scoped Evidence Attachment (How-To)

Follow these steps to populate the evidence bundle deterministically for a given $TASK id (folder name under .automation/evidence/$TASK/):

1) Create the directory
- mkdir -p .automation/evidence/$TASK/valid

2) Capture environment and provenance
- node -v > .automation/evidence/$TASK/env.txt
- npm -v >> .automation/evidence/$TASK/env.txt
- git rev-parse HEAD >> .automation/evidence/$TASK/env.txt
- node scripts/collect-facts.mjs > .automation/evidence/$TASK/task_provenance.json

3) Gates (save outputs under valid/)
- Lint: npm run lint > .automation/evidence/$TASK/valid/lint.txt 2>&1
- Types: npm run typecheck > .automation/evidence/$TASK/valid/typecheck.txt 2>&1
- Tests: npm test -- --reporter=json > .automation/evidence/$TASK/valid/tests.json 2>&1
- Global coverage (≥80%): npm run compliance:coverage && cp .automation/evidence/compliance/valid/coverage.json .automation/evidence/$TASK/valid/coverage.json
- Validator coverage (≥90%): npm run test:validator && npm run compliance:validator-coverage

4) Compliance scans (optional per task, required in CI)
- npm run compliance:patterns
- npm run compliance:sbom
- npm run compliance:facts
- npm run compliance:meta
- npm run compliance:opa
- npm run compliance:contracts
- npm run compliance:vuln
- npm run compliance:secrets

5) Artifact hashing (changed files and key outputs)
- Find changed files: git diff --name-only HEAD~1 > .automation/evidence/$TASK/changed_files.txt || true
- Compute hashes:
  - awk '{print $1}' .automation/evidence/$TASK/changed_files.txt | while read f; do \
      [ -f "$f" ] && shasum -a 256 "$f"; \
    done > .automation/evidence/$TASK/artifacts.sha256

6) Summary
- Write .automation/evidence/$TASK/summary.md with links to valid/*, coverage values, and acceptance verdict.

Notes
- Evidence must be generated from commands that exit 0 to satisfy binary gates.
- For executions with validator results, include MinIO paths and SHA256 checksums from <execId>/validator/validation-report.json.
- Prefer the one-shot pipeline for CI: npm run compliance (persists compliance evidence under .automation/evidence/compliance/).

---

## 🔄 Iteration Protocol
```
On any gate failure:
1) DIAGNOSE: Read logs; identify root cause.
2) FIX: Adjust implementation (not architecture unless approved ADR).
3) RETRY: Re-run failing gate(s).
4) EVIDENCE: Save inputs/outputs under .automation/evidence/$TASK/iterations/.
5) REPEAT: Up to 3 attempts per issue.

After 3 failed attempts:
ESCALATE with description, attempts, logs, and proposed next step.
```

Escalate immediately if: architectural decision required; non-approved tech needed; suspected security vulnerability; or scope drift requires multi-service refactor.

---

## ✅ Validation Gates
- G1 Lint: `npm run lint` → exit 0; attach `valid/lint.txt`.
- G2 Types: `npm run typecheck` → exit 0; attach `valid/typecheck.txt`.
- G3 Tests: `npm test` → exit 0; attach `valid/tests.json` and `valid/coverage.json` (≥80%).
- G4 Acceptance: Attach artifacts proving the task’s definition of done.

Failing any gate triggers the Iteration Protocol.

---

## 🚫 Forbidden Patterns (Auto-Detectable)

| Pattern | Regex | Violation | Action |
|---|---|---|---|
| Path guessing | `(?i)\b(think\|probably\|should be at)\b` | Claims without evidence | HALT; run discovery first |
| Hardcoded success | `return\s*\{\s*success:\s*true\s*\}` | Fake green | Replace with real validation |
| TypeScript any | `:\s*any\b` | Type unsafety | Replace with concrete types |
| TODO/FIXME | `(?i)\bTODO\b\|\bFIXME\b` | Incomplete work | Complete before PR |
| Console.log in src/ | `src/.*console\.log` | Noisy prod logs | Use proper logger |
| Anthropic imports | `from ['"]@anthropic` | Wrong LLM vendor | Replace with OpenAI |

---

## 🎛️ Flexibility (What You Can Decide)
- You may choose exact file structure, names, dependency versions, ports, container names.
- You may choose HOW to achieve outcomes as long as all gates pass and constraints are honored.
- You may NOT change the locked stack, skip evidence, skip gates, or proceed on red.

---

## 🧯 Error Handling
- Iterate (up to 3) on routine failures: lint errors, type errors, test failures, coverage dips, port conflicts, schema mismatches.
- Escalate immediately for: architecture changes, non-approved tech, suspected security issues, or broad refactors.
- All escalations include evidence bundle and a concrete proposal or request for guidance.

---

## 📚 References
- CONSTITUTION.md (Articles I, II, III, V, VI)
- docs/11_211025/ARCHITECTURE_DECISION.md
- docs/11_211025/VERTICAL_1_TOOLING.md
- docs/11_211025/VERTICAL_1_PLAN.md
- docs/11_211025/WEEK_1_DOD.md (current week's outcomes)
 - COMPLIANCE_VALIDATION.md (universal manual checklist; run on every source change)
 - scripts/compliance_audit.sh (optional helper; does not replace manual audit)
