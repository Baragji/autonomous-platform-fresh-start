### 1. Context (VALIDATED)

This is not a from-scratch build. The platform is ~90% complete. The Validator service core exists and needs wiring, integration, tests, and CI enforcement.

Evidence-based validation addendum (cross-checked with repository):
- Workspace and naming: packages/* with scopes @autonomous/... (root package.json workspaces; packages/gateway/package.json name "@autonomous/gateway"; packages/implementer/package.json name "@autonomous/implementer").
- Service patterns: commonjs + ts-node-dev for dev (packages/gateway/package.json, packages/implementer/package.json).
- Eventing: Redis Pub/Sub helpers (not Redis Streams) for SSE and service events (packages/shared/src/events.ts publish/subscribe).
- Runner stack: E2B + vitest JSON reporter + coverage (packages/runner/src/agent.ts).
- MCA graph: currently planner → implementer → runner → END when not planner-only (packages/mca/src/server.ts edges).
- Validator core: present, listening on VALIDATOR_PORT (default 7050), /healthz returns { ok: true } (packages/validator/src/server.ts).

What’s done
- MCA, Planner, Implementer, Runner, Gateway, Infra are implemented.
- Validator core logic exists in packages/validator/src/server.ts.

What remains
- Validator package wiring (package.json, tsconfig).
- Validator integration into MCA graph (runner → validator; PASS→END, FAIL→implementer; failure_count, escalation).
- Validator unit/integration tests (≥90% coverage).
- CI enforcement (global ≥80%, validator ≥90%), compliance hooks, evidence logging.

---

### 2. Objective (CLEAR)

Goal: Finish Validator integration to achieve zero-trust, fully autonomous operation.

Start: packages/validator/src/server.ts (core present)

End: Full flow with Validator integrated, remediation loop active, CI/compliance enforced, evidence logged, deterministic gates.

---

### 3. Discrepancy Resolution (EVIDENCE-BASED)

Found vs. instructions:
- Package naming and tooling: Use @autonomous scope and commonjs + ts-node-dev (not @app, not tsx/module).
- Eventing: Redis Pub/Sub is the current pattern; keep this for Validator events.
- Test runner: Vitest via E2B (no pytest); keep Node/TypeScript consistency.
- MCA currently ends at Runner; Validator node must be added.

Corrections applied to plan:
- Use @autonomous/validator with commonjs and ts-node-dev.
- Use npm run scripts at repo root (lint, typecheck, test).
- Health endpoint expects { ok: true }.
- Validator artifacts placed under <execId>/validator/* and include checksums in validation-report.json.
- Integrate Validator node after Runner with PASS→END, FAIL→implementer; track failure_count and escalate at 3.

---

### 4. Step-by-Step Tasks (CORRECTED AND PRECISE)

Rules
- Reuse existing services and patterns; do not rebuild.
- Keep acceptance gates deterministic (tests/coverage/secrets).
- LLM judge is advisory only; verdicts must remain tool-driven.

Step 1 — Wire the Validator package
- Create packages/validator/package.json
{
  "name": "@autonomous/validator",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "main": "dist/server.js",
  "types": "dist/server.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --coverage --reporter=json"
  },
  "dependencies": {
    "@autonomous/shared": "file:../shared",
    "@autonomous/vfs": "file:../vfs",
    "express": "^4.19.2",
    "openai": "^4.70.1",
    "zod": "^3.23.8",
    "langfuse": "^3.21.0"
  },
  "devDependencies": {
    "ts-node-dev": "^2.0.0",
    "tsconfig-paths": "^4.2.0"
  }
}
- Create packages/validator/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
- Root scripts (optional): add "dev:validator": "npm --prefix packages/validator run dev" to package.json, similar to other services.
- Optional local container: add validator service to infrastructure/docker-compose.yml mapping port 7050 (do not change existing services).

Validation:
- npm run build completes.
- npm --prefix packages/validator run dev runs; curl -sf http://localhost:7050/healthz returns {"ok":true}.

Step 2 — Confirm Validator endpoints and exports
- Ensure server listens on VALIDATOR_PORT (default 7050) and exposes /healthz → { ok: true }.
- Ensure dev/start scripts align with ts-node-dev and node dist respectively.

Validation:
- curl -sf http://localhost:7050/healthz → 200 with { "ok": true }.

Step 3 — Configuration (env + thresholds)
- Update .env.example to include:
VALIDATOR_PORT=7050
VALIDATOR_COVERAGE_THRESHOLD_GLOBAL=80
VALIDATOR_ARTIFACT_PREFIX=validator
VALIDATOR_LLM_JUDGE=0
- Validator code must:
  - Read VALIDATOR_COVERAGE_THRESHOLD_GLOBAL (default 80).
  - Only invoke LLM judge when VALIDATOR_LLM_JUDGE is "1" or "true" AND automated verdict is FAIL.
  - Continue to base verdict on tools (tests/coverage/secrets), not LLM.

Validation:
- Changing VALIDATOR_COVERAGE_THRESHOLD_GLOBAL modifies verdict threshold without code changes.

Step 4 — Artifacts and checksums (immutability)
- Write artifacts under <execId>/validator/:
  - validator/validator-junit.xml
  - validator/validator-coverage.json
  - validator/validation-report.json
- Compute sha256 checksums (Node crypto) for junit, coverage, report; include in validation-report.json → checksums: { junit, coverage, report }.

Validation:
- After POST /validate, the three artifacts exist and validation-report.json includes checksums for all.

Step 5 — MCA integration (no rebuild)
- In packages/mca/src/server.ts:
  - Add validatorNode after runnerNode that calls POST to VALIDATOR_URL (default http://localhost:7050/validate).
  - Edges: runner → validator; validator PASS → END; validator FAIL → implementer.
  - Track failure_count in state; on each FAIL increment.
  - If failure_count ≥ 3, publish escalated event and set execution status to escalated; continue implementer path if policy permits.

Validation:
- PASS: Runner → Validator → END.
- FAIL: Runner → Validator → Implementer, failure_count increments; 3 triggers escalated status/event.

Step 6 — Implementer consumption of validator report (reuse)
- Implementer may read <execId>/validator/validation-report.json via VFS.
- If present, use advisory content to guide remediation; do not change core algorithm.

Validation:
- On Validator FAIL, Implementer can access the report and proceed without human input.

Step 7 — Unit and integration tests (validator ≥ 90% coverage)
- Create tests:
  - packages/validator/test/verdict.spec.ts (testsPassed, coverage threshold, secrets → PASS/FAIL).
  - packages/validator/test/coverage-parse.spec.ts (robust coverage parsing, rejects malformed).
  - packages/validator/test/junit-conversion.spec.ts (vitest JSON → JUnit correctness).
  - packages/validator/test/llm-gate.spec.ts (LLM judge only when VALIDATOR_LLM_JUDGE=1 AND verdict=FAIL; verdict unaffected).
  - packages/validator/test/integration-validate.spec.ts (mock E2B + VFS; POST /validate { execId }; asserts three artifacts + checksums).

Validation:
- npm --prefix packages/validator run test passes.
- Package-level coverage for @autonomous/validator ≥ 90%.

Step 8 — CI enforcement (zero-trust gates)
- In .github/workflows/ci.yml (or equivalent):
  - Run npm run lint, npm run typecheck, npm test.
  - Enforce global coverage ≥ 80% (reuse scripts/check-coverage.ts).
  - Add a step to assert @autonomous/validator coverage ≥ 90% (parse its coverage-summary.json).
  - Add secret scan (reuse compliance:secrets).
  - Upload validator JUnit/coverage artifacts.

Validation:
- PRs dropping validator coverage <90% or global <80% fail CI.

Step 9 — Compliance & evidence logging
- Update progress_evidence.md (new section: Validation Evidence) to list:
  - Validator artifacts under <execId>/validator/.
  - SHA256 checksums for each artifact.
  - Final verdict and coverage values used.
- Ensure MCA logs state transitions including runner → validator → (implementer|END).

Validation:
- Each execution has auditable artifacts, checksums, and recorded transitions.

Step 10 — Gateway observability (reuse)
- Optionally extend execution detail to surface validator verdict and artifact URIs (read-only).

Validation:
- Single API call shows current validator verdict and artifact links.

Step 11 — Operational toggles (safe autonomy)
- Default VALIDATOR_LLM_JUDGE=0.
- Enabling VALIDATOR_LLM_JUDGE=1 adds advisory “judge” fields to validation-report.json on FAIL; verdict remains tool-driven.

Validation:
- Flipping the env adds advisory content without changing verdicts.

Step 12 — End-to-end smoke (no rebuild)
- Run infra (Postgres/Redis/MinIO/Tempo/Grafana/E2B).
- Start Gateway, MCA, Planner, Implementer, Runner.
- Start Validator: npm --prefix packages/validator run dev.
- Trigger normal execution via Gateway.
  - PASS: runner → validator → END.
  - FAIL: runner → validator → implementer; failure_count increments; escalates at 3 if persists.
- Inspect artifacts under <execId>/validator/.

Validation:
- PASS path completes autonomously.
- FAIL path loops autonomously to Implementer or escalates at 3.

---

### 5. Production-Ready Requirements (CONFIRMATION)

- Tests and coverage:
  - Global coverage ≥ 80% (CI enforced).
  - Validator package coverage ≥ 90% (CI enforced).
- Error handling and logging:
  - Validator server returns structured errors; logs failures; publishes SSE events.
  - Sandbox operations time-bounded; errors captured; cleanup attempted in finally blocks.
- Security:
  - Baseline regex secret scan in validator; CI secret scanning enabled.
  - No new HIGH/CRITICAL vulnerabilities; add CI step if missing.
- Documentation:
  - API for /validate, deployment and operational runbooks, rollback procedures.
  - Evidence logging procedure (artifacts + checksums).
- Performance:
  - Sandbox timeouts and resource bounds in validator and runner.
- Autonomy:
  - Full flow independent of human input; remediation loop functional; escalation at 3 failures.

---

### 6. Final Optimization and Guarantee

- This instruction set is aligned to the current repository and evidence:
  - @autonomous/* package scope, commonjs + ts-node-dev, Redis Pub/Sub, E2B + vitest, MinIO VFS, Postgres checkpointer.
- All integration points and dependencies are validated against actual code.
- Post-execution criteria:
  - Deterministic, zero-trust gates; evidence logged; CI enforced.
  - Full autonomy achieved with remediation loop and escalation.

---

### 7. TL;DR

Phase 1 — Validation
- Review against repo + VERTICAL_1_PLAN.md + VERTICAL_1_TOOLING.md.
- Discrepancies fixed: naming/tooling, Pub/Sub, vitest/E2B alignment, MCA edges.

Phase 2 — Implementation (execute steps 1–12)
- Wire validator package.
- Add env toggles and thresholds.
- Ensure artifacts + checksums under <execId>/validator/.
- Integrate validator node in MCA (runner → validator; PASS→END, FAIL→implementer; failure_count + escalation at 3).
- Enable Implementer to read validator report (advisory).
- Add tests (≥90% validator coverage) and CI enforcement.
- Update evidence logs; confirm end-to-end smoke.

Acceptance gates
- npm run lint, npm run typecheck, npm test all green.
- Global coverage ≥ 80%, validator ≥ 90%.
- Evidence logs include validator artifacts + checksums + verdict.
- PASS path completes; FAIL path remediates or escalates at 3 automatically.
