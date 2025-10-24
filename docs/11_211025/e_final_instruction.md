### 1. Context Section (REQUIRED)

```
IMPORTANT: This is NOT a from-scratch build. We have a 90% complete
autonomous coding platform.

WHAT'S ALREADY BUILT AND WORKING:
- ✅ MCA (Master Coordinator Agent) - fully functional
- ✅ Planner service - fully functional
- ✅ Implementer service - fully functional
- ✅ Runner service - fully functional
- ✅ Gateway API - fully functional
- ✅ Infrastructure (Postgres, Redis, E2B) - fully functional
- ✅ Validator service core logic - exists in packages/validator/src/server.ts

WHAT NEEDS COMPLETION:
- ❌ Validator package wiring (package.json, tsconfig)
- ❌ Validator integration into MCA workflow
- ❌ Validator tests and coverage
- ❌ CI enforcement and compliance features
```

---

### 2. Clear Objective (REQUIRED)

```
GOAL: Complete the final 10% - finish the Validator service
integration to achieve full autonomy.
STARTING POINT: packages/validator/src/server.ts (already exists with
core logic)
END STATE: Fully autonomous platform with zero-trust validation
```

---

### 3. Step-by-Step Tasks (REQUIRED)

> Rules for all steps below
> • Reference and reuse existing services (MCA, Planner, Implementer, Runner, Gateway).
> • Modify only what’s listed; do not rebuild anything that is already working.
> • Keep gates deterministic (tests/coverage/secret-scan).
> • Any LLM “advice” must not alter pass/fail gates by itself.

---

#### Step 1 — Wire the Validator package (repo plumbing)

**Modify/Create:**

1. **Create** `packages/validator/package.json`

```json
{
  "name": "@app/validator",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/server.ts",
    "start": "node dist/index.js",
    "test": "vitest run --reporter=verbose --coverage"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.0.0",
    "tsx": "^4.19.0",
    "zod": "^3.23.8"
  }
}
```

2. **Create** `packages/validator/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

3. **Modify** root workspaces and Turbo:

* Add `packages/validator` to the root `package.json` workspaces array.
* Add a turbo pipeline target (e.g., `"validator#build"`, `"validator#test"`) in `turbo.json` consistent with other services.

4. (Optional for local dev) **Modify** `infrastructure/docker-compose.yml` to add a `validator` service listening on port **7050** (align with existing pattern). Do **not** change existing containers.

**Validation criteria:**

* `pnpm -w build` compiles without errors.
* `pnpm -w dev --filter @app/validator` runs and `curl -sf http://localhost:7050/healthz` returns 200.

---

#### Step 2 — Confirm Validator endpoints and exports

**Reference:** `packages/validator/src/server.ts` (already exists)

**Modify:**

* Ensure it **listens** on a configurable port (`VALIDATOR_PORT`, default 7050).
* Ensure the file **exports** the server/app starter (consistent with other services) or starts in-place with `dev`/`start` scripts above.
* Do **not** change the existing validation logic; only ensure proper bootstrapping and clean shutdown.

**Validation criteria:**

* `curl -sf http://localhost:7050/healthz` returns 200 with minimal JSON (e.g., `{ "status":"ok" }`).

---

#### Step 3 — Define Validator configuration (env + thresholds)

**Create/Modify:** `.env.example` (and CI env)
Add keys (no secrets—just configuration):

```
VALIDATOR_PORT=7050
VALIDATOR_COVERAGE_THRESHOLD_GLOBAL=80
VALIDATOR_ARTIFACT_PREFIX=validator
VALIDATOR_LLM_JUDGE=0  # default OFF; gates remain deterministic
```

**Validation criteria:**

* Validator reads these envs; changing `VALIDATOR_COVERAGE_THRESHOLD_GLOBAL` alters the threshold used in verdict calculations.

---

#### Step 4 — Artifact locations and checksums (immutability)

**Reference:** existing VFS/MinIO pattern used by Runner and evidence logs.

**Modify (in validator server):**

* Ensure all artifacts are written under **`<execId>/validator/`**:

  * `validator/validator-junit.xml`
  * `validator/validator-coverage.json`
  * `validator/validation-report.json`
* Compute and include **SHA256** checksums for each artifact inside `validation-report.json` (add a `checksums` object).

**Validation criteria:**

* After a `/validate` call, the three files exist and `validation-report.json` contains checksums for all artifacts.

---

#### Step 5 — Integrate Validator into MCA workflow (no rebuild)

**Reference:** `packages/mca/src/...` (your MCA graph/state machine file), existing edges between Runner, Planner, Implementer.

**Modify:**

* Add **`validatorNode` after `runnerNode`**.
* Edges:

  * `runner → validator`
  * `validator.PASS → END`
  * `validator.FAIL → implementer`
* On each FAIL, increment `failure_count` in the execution state.
* If `failure_count >= 3`, set execution status to `escalated` and publish an `escalated` event; still allow implementer path if policy permits.

**Validation criteria:**

* Starting an execution flows Runner → Validator → END on PASS.
* On FAIL, it routes to Implementer and increments `failure_count`.
* `failure_count` reaches 3 triggers `escalated` status and event.

---

#### Step 6 — Planner/Implementer consumption of reports (reuse only)

**Reference:** existing Planner and Implementer services.

**Modify (lightweight wiring only):**

* Ensure Implementer can **read** `validator/validation-report.json` from `<execId>/validator/` (via the same VFS path pattern already used).
* If report exists, allow Implementer to use its contents as hints; otherwise use Planner as usual.
* Do **not** change Implementer’s core logic—only enable reading the report if present.

**Validation criteria:**

* On a Validator FAIL, Implementer can access the report and continue the fix loop without human intervention.

---

#### Step 7 — Unit & integration tests for Validator

**Create:**

* `packages/validator/test/verdict.spec.ts`

  * Tests for: testsPassed, coverage threshold, secret-scan hits → PASS/FAIL.
* `packages/validator/test/coverage-parse.spec.ts`

  * Parses coverage JSON correctly; rejects malformed inputs.
* `packages/validator/test/junit-conversion.spec.ts`

  * Converts vitest JSON → JUnit with required suite/test names.
* `packages/validator/test/llm-gate.spec.ts`

  * Ensures LLM judge **only runs** when `VALIDATOR_LLM_JUDGE=1` **AND** verdict=FAIL; never alters PASS/FAIL.
* `packages/validator/test/integration-validate.spec.ts`

  * Mocks E2B + VFS; calls `POST /validate { execId }`; asserts existence of the three artifacts and checksum fields.

**Validation criteria:**

* `pnpm -w test --filter @app/validator` passes.
* Coverage for package `@app/validator` is **≥ 90%**.

---

#### Step 8 — CI enforcement (zero-trust gates)

**Modify:** your main CI workflow (e.g., `.github/workflows/ci.yml`) to add validator into existing jobs.

**Commands (example):**

* `pnpm -w lint`
* `pnpm -w typecheck`
* `pnpm -w test -- --coverage`
* Enforce:

  * **Global coverage ≥ 80%**
  * **Validator package coverage ≥ 90%** (use package-level threshold or a check step that parses coverage summary).
* Add secret scan (reuse existing secret-scan step you already use platform-wide).
* Fail the pipeline if thresholds are not met.

**Validation criteria:**

* A PR that drops validator coverage below 90% or global below 80% **fails** CI.
* CI artifacts include the validator’s JUnit and coverage reports.

---

#### Step 9 — Compliance & evidence logging (no rebuild)

**Reference:** your existing progress/evidence logging patterns.

**Modify/Append:**

* Append a new “Validation Evidence” section in your evidence log (e.g., `progress_evidence.md`), listing:

  * The three artifact paths written under `<execId>/validator/`
  * Their **SHA256 checksums**
  * The PASS/FAIL verdict and coverage values used
* The MCA should already log state transitions; ensure the transition `runner → validator → (implementer|END)` is recorded per execution.

**Validation criteria:**

* Each execution has auditable artifacts + checksums + state transitions recorded.

---

#### Step 10 — Gateway observability (reuse)

**Reference:** Gateway API.

**Modify (optional, reusing existing patterns):**

* Add a **read-only** route that returns validator status for a given `execId` (reading from the same store/events you already use), or reuse existing execution detail endpoints to include validator verdict and artifact URIs.

**Validation criteria:**

* A single API call shows the current execution’s validator verdict and links (URIs) to its artifacts.

---

#### Step 11 — Operational toggles (safe autonomy)

**Modify:**

* Keep `VALIDATOR_LLM_JUDGE=0` by default in all environments (keeps gates deterministic).
* If an operator wants advisory hints on stubborn FAILs, they opt-in by setting `VALIDATOR_LLM_JUDGE=1`.
* This **does not** change PASS/FAIL logic; it only enriches `validation-report.json` with advisory fields.

**Validation criteria:**

* Flipping the env adds a `judge` section to `validation-report.json` on FAIL, without changing verdicts.

---

#### Step 12 — End-to-end smoke (no rebuild, just run)

**Run locally (example):**

1. Start infra (Postgres/Redis/E2B) as you already do.
2. Start Gateway, MCA, Planner, Implementer, Runner (existing).
3. Start Validator: `pnpm -w dev --filter @app/validator`
4. Trigger a normal end-to-end execution via the **Gateway API** (existing route).

   * Observe MCA events: `runner → validator → END` on PASS.
   * For a failing sample repo, observe `runner → validator → implementer` and `failure_count` increments.
5. Inspect artifacts under `<execId>/validator/`.

**Validation criteria:**

* PASS case reaches END without human input.
* FAIL case loops to Implementer automatically, updates state, and continues until green or escalation at 3.

---

### 4. Validation Checklist (REQUIRED)

Use this as the final acceptance gate:

* **Wiring**

  * `pnpm -w build` succeeds; validator compiles.
  * `curl -sf http://localhost:7050/healthz` returns 200.

* **MCA Flow**

  * On PASS: `runner → validator → END`.
  * On FAIL: `runner → validator → implementer` and `failure_count` increments; at 3, status becomes `escalated` and an event is published.

* **Artifacts & Evidence**

  * After `/validate`, these exist under `<execId>/validator/`:

    * `validator-junit.xml`
    * `validator-coverage.json`
    * `validation-report.json` (includes checksums and final verdict)
  * Evidence log updated with artifact paths, checksums, coverage numbers, and verdict.

* **Tests & Coverage**

  * `pnpm -w test --filter @app/validator` passes.
  * Validator package coverage **≥ 90%**; global coverage **≥ 80%** (CI enforces both).

* **Compliance**

  * Secrets scan runs in CI; pipeline **fails** on violations.
  * CI stores validator JUnit/coverage artifacts.
  * Execution state transitions are recorded and retrievable for audit.

* **Safety Toggles**

  * `VALIDATOR_LLM_JUDGE=0` by default; turning it to `1` adds advisory content **only** (verdict unaffected).

* **Autonomy**

  * A typical user prompt flows **end-to-end** through MCA → Planner → Implementer → Runner → **Validator** and loops automatically on FAIL until green or escalation, **without human intervention**.

---