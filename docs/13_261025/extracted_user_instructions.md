# Extracted User Instructions
## Autonomous Execution Protocol for Production Release

**Document Purpose**: This document contains all directive instructions from the user that established fully autonomous AI operation for production deployment.

---

## 1. ROLE & AUTHORITY

### Primary Role Definition
You are the Secure Autonomous Operator for this repository.

### Mission Objective
Your job is to complete and enforce the "secure_hardening_20251025T200131Z" branch as production-ready under the Option C protocol, and produce a release branch.

### Authority & Capabilities
You must act exactly like a senior infra+app+AI engineer with full local shell access and repo write access.

---

## 2. OPERATIONAL MANDATES

### Autonomous Execution Requirements

**You MUST:**
- Run commands locally in the environment (shell, Node, docker compose, git) using the project's machine, not by asking the human
- Already demonstrated you can run npm, docker, curl, lsof, kill, env export, etc. You will keep doing that without asking
- Self-edit code, self-stage git commits, and self-regenerate evidence until all release criteria pass

**You MUST NOT:**
- Ever ask the human to "rerun," "re-export secrets," "paste logs," or "try again"
- You ALREADY HAVE the .env and you ALREADY KNOW how to kill/restart services
- Print or commit any secret values
- Secrets (like OPENAI_API_KEY, E2B_API_KEY, etc.) must never appear in console output, evidence files, git diffs, PR text, or commit messages
- If you need a secret, you load it from ./.env into your own shell with `set -a; . ./.env; set +a;` and you use it silently. You NEVER echo it

### Evidence & Security Requirements

**You MUST NOT:**
- Produce narrative "feelings" or speculation inside evidence
- Evidence must be machine-generated JSON or line-delimited structured logs
- Freeform human prose in evidence directories is banned

**You MUST:**
- Enforce least privilege in practice: only do actions required to complete secure release
- Don't widen access beyond what's needed
- Don't grant exemptions or bypass checks

### Final Deliverable
When you're done, you will cut a signed release branch that is eligible for production deployment.

---

## 3. DEFINITION OF DONE (SUCCESS CRITERIA)

You are not finished until ALL of these are simultaneously true on the hardening branch and on the final release branch you cut:

### 3.1 Full Pipeline Execution
- Whole pipeline runs end-to-end with real secrets loaded from .env
- planner → implementer → runner → validator actually executes on a real POST /api/executions task like "Build a TODO API with tests"
- `touched_validator` is true in `.automation/evidence/v5-report.json`

### 3.2 Clean Evidence Directory
`.automation/evidence/` contains ONLY:
- `coverage.json`
- `healthz_sweep.json`
- `e2e_request_response.json`
- `prod_env_guard.json`
- `v5-report.json`
- `ATTACHMENT_MANIFEST.json`
- `TAMPERING_ALERT.txt`
- `.gitkeep`

**Requirements:**
- No legacy week1/, week2/, week3/, narrative .md, or ad-hoc text dumps are present
- `ATTACHMENT_MANIFEST.json` lists ONLY those allowed evidence files, with sha256 for each, plus commit and UTC timestamp

### 3.3 Coverage Requirements
- `npm test -- --coverage --run` passes
- `coverage.json` shows line coverage ≥80% overall and validator/critical surfaces covered
- No tests failing

### 3.4 Environment Guard
`prod_env_guard.json` shows:
- A failing run with missing/malformed secrets exits non-zero
- A passing run exits 0 and logs something like: `env-loaded { hasOpenAiKey:true, ... }` (sanitized, no secret values)

### 3.5 Narrative Ban
You scan `.automation/evidence/` for forbidden language like:
- "I can't run the stack so I'll invent…"
- "we believe"
- "TODO"
- "FIXME"
- Any human story/excuse

**Action**: If you find any, you quarantine it and regenerate that evidence file from the real system.

### 3.6 CI Enforcement (Red-Is-Red)
`.github/workflows/ci.yml` MUST:
- Stand up infra (docker compose up postgres/redis/minio/tempo/grafana)
- Build shared
- Launch gateway, planner, mca, implementer, runner, validator with secrets from GitHub Actions secrets
- Run scripts: `collect-healthz.ts`, `run-e2e-intent.ts`, `collect-env-guard.ts`, `collect-coverage.ts`, `generate-readiness-report.ts`, `attest-evidence.sh`
- Assert `touched_validator === true`. If false → exit 1
- Assert coverage JSON is non-zero and tests passed. If not → exit 1
- Assert no narrative prose in evidence. If narrative → exit 1
- Compare the repo's committed `ATTACHMENT_MANIFEST.json` vs the manifest regenerated in CI. If mismatch → exit 1

**Branch Protection:**
- Configure branch protection rules in GitHub so this CI job is a REQUIRED STATUS CHECK for merge into the release branch
- "Red is red" means you DO NOT weaken or bypass these checks for the release branch

### 3.7 Release Branch Requirements
- You create `release/secure-<UTC>` from the hardening branch commit that satisfied 1–6
- You run `bash scripts/attest-evidence.sh` one final time so `ATTACHMENT_MANIFEST.json` reflects EXACT evidence in that release branch's tree
- You commit that final manifest
- You push the release branch
- You apply branch protection on that release branch requiring CI to pass and preventing force-push
- Only then are you allowed to tell leadership: "CANDIDATE FOR PRODUCTION"

**You are not allowed to declare success until ALL of that is true.**

---

## 4. ACTION PLAN (STEP BY STEP)

### STEP 1: Load Secrets and Lock Environment

In a fresh shell:
```bash
set -a
. ./.env
set +a
unset WEEK2_PLANNER_ONLY
```

**Do NOT echo them. Do NOT write them to disk.**

Kill any leftover processes and free ports:
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

Restart infra clean:
```bash
docker compose -f infrastructure/docker-compose.yml down --remove-orphans
docker compose -f infrastructure/docker-compose.yml up -d postgres redis minio tempo grafana
```

Build shared:
```bash
npm --prefix packages/shared run build
```

### STEP 2: Start All Services

You start every service again, capturing their logs under /tmp. You do NOT print secrets to those logs.

```bash
nohup npm --prefix packages/gateway      run dev > /tmp/gw.log        2>&1 &
nohup npm --prefix packages/planner      run dev > /tmp/planner.log   2>&1 &
nohup npm --prefix packages/mca          run dev > /tmp/mca.log       2>&1 &
nohup npm --prefix packages/implementer  run dev > /tmp/impl.log      2>&1 &
nohup npm --prefix packages/runner       run dev > /tmp/runner.log    2>&1 &
nohup npm --prefix packages/validator    run dev > /tmp/validator.log 2>&1 &
```

Confirm they're listening on specified ports. If any port is in use, kill that PID and relaunch that one service.

### STEP 3: FORCE Validator to be Touched

**This is the core blocker you still haven't cleared**: validator didn't always get invoked because implementer sometimes bails with "max iterations," leaving no code artifacts, and MCA stops.

You MUST fix that yourself with code edits and commits, then prove it works.

**Your requirements:**

1. **Patch `packages/implementer/src/agent.ts`** so that:
   - When it hits max iterations or a tool error, it ALWAYS attempts to write a minimal scaffold project
   - That scaffold write MUST go through the same code path the runner expects
   - After writing scaffold, the implementer MUST publish a structured event
   - MUST return `{ ok: true, files: [...] }` to MCA instead of throwing

2. **Patch `packages/implementer/src/publisher.ts`** to cleanly support that new event every time

3. **Patch MCA's node** that consumes implementer output so that:
   - If implementer returns `{ ok: true }` (even if partial), you ALWAYS proceed to runner, then validator
   - DO NOT abort early just because something wasn't "perfect"

4. **Patch runner** if needed so that it MUST still produce a structured status back to MCA

5. **Patch validator** so that:
   - It always emits a machine-only evaluation of what exists
   - It returns a status that MCA records
   - This status MUST set `touched_validator=true` in the readiness data

**You will now:**
- Generate git diffs for those patches
- Apply them with `git add / git commit` on the hardening branch
- Rerun the pipeline end-to-end and show the updated evidence

### STEP 4: Regenerate Full Evidence Set

After code patches from Step 3 are committed and services are relaunched:

1. **Health sweep**: `npx tsx scripts/collect-healthz.ts || true`
2. **End-to-end intent run**: `npx tsx scripts/run-e2e-intent.ts`
3. **Env guard proof**: `npx tsx scripts/collect-env-guard.ts`
4. **Coverage**: `npx tsx scripts/collect-coverage.ts`
5. **Readiness report**: `npx tsx scripts/generate-readiness-report.ts`
6. **Attestation**: `bash scripts/attest-evidence.sh`
7. **Narrative ban + quarantine enforcement**: Grep for forbidden words
8. **Commit**: `git add .automation/evidence` and commit

### STEP 5: CI Enforcement Hardening

Update `.github/workflows/ci.yml` so that CI:
- Loads secrets from GitHub Actions encrypted secrets
- Spins up docker infra
- Builds shared
- Launches all services
- Runs the same scripts you just ran locally
- Fails (exit 1) if requirements not met

Then apply GitHub branch protection rules.

### STEP 6: Cut the Release Branch

When all requirements are true:

```bash
UTCSTAMP=$(date -u +%Y%m%dT%H%M%SZ)
git checkout -b release/secure-$UTCSTAMP
bash scripts/attest-evidence.sh
git add .automation/evidence/ATTACHMENT_MANIFEST.json
git commit -m "attest: final manifest for release/secure-$UTCSTAMP"
git push -u origin release/secure-$UTCSTAMP
```

Configure branch protection on the release branch.

**Now – and ONLY now – you may output:**
> CANDIDATE FOR PRODUCTION. All evidence machine-generated, attested, validator executed, CI enforced, secrets protected, branch protected.

---

## 5. QUALITY BAR / PROOF REQUIREMENTS

When you report back, you must include ALL of this:

1. Exact branch name and commit SHA for the hardening branch and release branch
2. The final `ATTACHMENT_MANIFEST.json` content
3. The final `.automation/evidence/v5-report.json` content showing:
   - `exercised_chain:true`
   - `touched_validator:true`
   - `verdict:<...>`
4. A dump of the grep scan showing no narrative matches
5. A short summary of the CI workflow block you added
6. Confirmation that NO secret value appears anywhere

---

## 6. ABSOLUTE RULES (DO NOT VIOLATE)

- You DO NOT ask the human to run commands, paste output, re-export env vars, or kill processes
- You DO NOT weaken CI to "let it pass anyway." Red is red
- You DO NOT commit secrets or print them into evidence
- You DO NOT insert narrative or persuasive prose into `.automation/evidence/`
- You DO enforce partial-handoff behavior so runner and validator always execute
- You DO enforce branch protection with required status checks before declaring production candidate

---

## 7. EXECUTION LOOP

You will now perform the finalization loop. The loop ends only when CI on the release branch is green under protection. Until then, you iterate.

### Loop Steps:

**STEP 3.1** – Checkout release branch locally and sync
```bash
git checkout release/secure-20251026T011340Z
git pull --ff-only
```

**STEP 3.2** – Source secrets locally (NO PRINTING)
```bash
set -a
. ./.env
set +a
unset WEEK2_PLANNER_ONLY
```

**STEP 3.3** – Clean restart local infra + services (if needed)

**STEP 3.4** – Regenerate the attestation manifest on the release branch HEAD
```bash
bash scripts/attest-evidence.sh
```

You MUST confirm that in the regenerated `ATTACHMENT_MANIFEST.json`:
- `"commit"` equals the CURRENT `git rev-parse HEAD`
- No secret values are present

Stage and commit:
```bash
git add .automation/evidence/ATTACHMENT_MANIFEST.json
git commit -m "attest: refresh manifest commit SHA for release/secure-20251026T011340Z"
git push origin HEAD
```

**STEP 3.5** – Invoke CI on the release branch and watch it

Use gh (GitHub CLI):
```bash
gh run list --branch release/secure-20251026T011340Z --limit 1
gh run watch --exit-status $RUN_ID
```

**If CI exits success (0):**
- CI is GREEN
- You are now allowed to proceed to Final Proof Report

**If CI exits failure (non-zero):**
- CI is RED
- You MUST fix it yourself
- Inspect failing jobs: `gh run view $RUN_ID --log`
- Apply fixes LOCALLY
- Commit and push again
- Repeat until CI returns success

**You are NOT allowed to:**
- Weaken CI rules
- Comment out checks
- Bypass branch protection

**Loop ends ONLY when CI returns success on the protected release branch.**

---

## 8. FINAL PROOF REPORT

Once CI is green, you MUST output one final structured report containing ALL of the following:

1. **Branches + Commits**: Hardening branch name and final commit SHA; Release branch name and final commit SHA

2. **Final ATTACHMENT_MANIFEST.json content**: The complete JSON content showing commit matches release HEAD

3. **Final v5-report.json content**: Must include `"touched_validator": true`

4. **Narrative scan result**: Show the exact command and output (should be "no matches")

5. **CI Enforcement Summary**: Summarize which workflow/job ran, which secrets were injected, and confirm branch protection is active

6. **Secret hygiene confirmation**: State plainly that no secret values appear anywhere

7. **Final status line**:
   > CANDIDATE FOR PRODUCTION. All evidence machine-generated, validator executed in CI, attestation matched, coverage enforced, secrets protected, branch protected, red-is-red policy active.

**If CI is still red**, you do NOT say that line. Instead output:
- The failing CI step names
- The cause of failure (in structured machine terms)
- The git diff you are about to apply to fix it
- Then loop again

**You are not allowed to output "CANDIDATE FOR PRODUCTION" unless CI on the protected release branch is actually green under required status checks.**

---

## 9. COMPREHENSIVE FINAL INSTRUCTIONS

### Phase A: Fix Runner Compat and CI Workflow

1. Checkout working branch and pull latest
2. Patch `packages/runner/src/compat.ts`
3. Reorder the evidence step in `.github/workflows/ci.yml`
4. (Optional) Add "exports" to `packages/shared/package.json`
5. Commit these changes

### Phase B: Regenerate Evidence Locally and Update Manifest

Do this locally with real secrets already sourced:

```bash
# 1. Load secrets into shell without printing
set -a
. ./.env
set +a
unset WEEK2_PLANNER_ONLY

# 2. Clean restart infra and services
pkill -f "packages/(gateway|planner|mca|implementer|runner|validator)" || true
sleep 1
docker compose -f infrastructure/docker-compose.yml down --remove-orphans
docker compose -f infrastructure/docker-compose.yml up -d postgres redis minio tempo grafana

# 3. Build shared (must happen before starting runner)
npm --prefix packages/shared run build

# 4. Start services in background
nohup npm --prefix packages/gateway      run dev > /tmp/gw.log        2>&1 &
nohup npm --prefix packages/planner      run dev > /tmp/planner.log   2>&1 &
nohup npm --prefix packages/mca          run dev > /tmp/mca.log       2>&1 &
nohup npm --prefix packages/implementer  run dev > /tmp/impl.log      2>&1 &
nohup npm --prefix packages/runner       run dev > /tmp/runner.log    2>&1 &
nohup npm --prefix packages/validator    run dev > /tmp/validator.log 2>&1 &

# 5. Collect evidence exactly like CI does
mkdir -p .automation/evidence
npx tsx scripts/collect-coverage.ts
npx tsx scripts/collect-healthz.ts || true
npx tsx scripts/collect-env-guard.ts
npx tsx scripts/run-e2e-intent.ts || true
npx tsx scripts/generate-readiness-report.ts

# 6. Attest and finalize manifest
bash scripts/attest-evidence.sh
```

**Check the artifacts:**
- `v5-report.json` must include `"touched_validator": true`
- `ATTACHMENT_MANIFEST.json` must have current HEAD commit SHA
- No narrative prose

**Commit:**
```bash
git add .automation/evidence
git commit -m "chore(evidence): refresh evidence + attestation for validator-touched commit"
```

### Phase C: Push, Open/Refresh PR, and Watch CI

```bash
git push origin ci/fix-runner-evidence
```

Create or update PR:
```bash
gh pr create \
  --base release/secure-20251026T011340Z \
  --head ci/fix-runner-evidence \
  --title "fix: runner boot, validator touch, deterministic evidence" \
  --body "Ensures shared is built before healthz/e2e, fixes runner compat absolute path resolution, regenerates attested evidence, and asserts validator touched."
```

Watch CI:
```bash
gh run watch --exit-status --log --branch ci/fix-runner-evidence --workflow CI
```

**If non-zero (red):**
```bash
gh run view --log --job test --branch ci/fix-runner-evidence --workflow CI
```
Then fix code, regenerate evidence (Phase B), commit, push, repeat.

**Important:**
- Do not "fix" by editing evidence text
- The loop ends only when CI exits zero and all required checks are green

### Phase D: Merge into Release Branch

Use GitHub CLI:
```bash
gh pr merge <PR_NUMBER> \
  --rebase \
  --delete-branch=false \
  --admin
```

**After merge, the protected release branch now contains:**
- Runner compat fix
- Correct CI ordering
- Machine-generated evidence
- Updated `ATTACHMENT_MANIFEST.json` whose commit field matches the actual head commit
- Proof in `v5-report.json` that `"touched_validator": true`

**That is "production ready"** - the system can self-plan, self-implement, self-run the chain end-to-end with real keys, collect structured evidence, prove validator touched, and block merges if any of that regresses.

---

## 10. TL;DR PROCEDURE

1. `git checkout ci/fix-runner-evidence && git pull --rebase`
2. Overwrite `packages/runner/src/compat.ts` with absolute-path version
3. In `.github/workflows/ci.yml`, move `npm --prefix packages/shared run build` to the top of the "Evidence | ..." step
4. `git commit` those changes
5. Locally: source .env, rebuild shared, boot full stack, run same scripts CI runs, confirm `touched_validator: true`
6. Confirm `ATTACHMENT_MANIFEST.json` has new HEAD commit SHA and correct hashes. No narrative prose
7. `git add .automation/evidence && git commit`
8. `git push origin ci/fix-runner-evidence`
9. Create or update the PR into `release/secure-20251026T011340Z`
10. Run `gh run watch --exit-status --log` to stream CI
11. If CI fails, fix code, regenerate evidence from step 5, recommit, repush, re-watch
12. When CI passes and PR shows all required checks green, merge using `gh pr merge <PR_NUMBER> --rebase --admin`

**Done.** The release branch now carries code that boots runner, hits validator, proves chain execution with real secrets (not printed), and passes all enforced gates.

---

## 11. FINAL DIRECTIVES

**If current run fail:**
- Stop
- Provide a comprehensive status update
- Await further instructions

**Otherwise:**
- Proceed till green and production ready
- Evidence based
- No speculation
- No narrative
- No asking human for help

---

*End of Extracted Instructions*