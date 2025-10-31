# Evidence-Based Remediation Plan

## 1. Gap Analysis

1. **Failure escalation loop never trips.** The plan requires the MCA to escalate after three validator failures and surface MinIO artifacts for each execution.【F:docs/11_211025/VERTICAL_1_PLAN.md†L47-L53】【F:docs/11_211025/week_5_6.md†L17-L47】 Current status shows executions looping until the recursion limit because `failure_count` is not persisted between LangGraph iterations.【F:.automation/STATUS_2025-10-31.md†L15-L38】 The MCA state graph does not declare a channel for `failure_count`, so the Postgres checkpointer never writes the counter, preventing the escalation gate from triggering.【F:packages/mca/src/server.ts†L137-L176】
2. **Validator output lacks actionable remediation contracts.** The approved tooling mandates that validator failures feed a remediation plan back to the MCA so the implementer can adjust subsequent attempts.【F:docs/11_211025/VERTICAL_1_TOOLING.md†L35-L45】【F:docs/11_211025/week_5_6.md†L17-L24】 Status notes that validator feedback is ignored because no structured guidance is delivered.【F:.automation/STATUS_2025-10-31.md†L22-L38】 The validator schema returns only verdicts and generic reasons, with no failing test names or required changes, so implementer prompts cannot incorporate failure context.【F:packages/validator/src/server.ts†L44-L313】
3. **Implementer ignores validator feedback and ships code without tests.** The vertical plan requires the slice to deliver code and tests (e.g., `app.ts` and `app.test.ts`) and to stream deterministic updates.【F:docs/11_211025/VERTICAL_1_PLAN.md†L99-L103】【F:docs/11_211025/WEEK_3_4_DOD.md†L45-L105】 Status highlights that the implementer regenerates identical broken code because validator guidance never enters the prompt.【F:.automation/STATUS_2025-10-31.md†L22-L38】 In code, the implementer prompt only serializes the planner plan and never references validator artifacts, and its emergency scaffold writes `app.ts` without any tests, ensuring coverage remains below the 80% gate.【F:packages/implementer/src/agent.ts†L68-L244】
4. **Coverage and validation evidence remain below required thresholds.** Weekly DoD and AGENTS protocols require lint, typecheck, and tests with ≥80% line coverage to pass, with validator supplying zero-trust proof and failing with precise details when coverage is low.【F:docs/11_211025/WEEK_2_DOD.md†L146-L198】【F:AGENTS.md†L92-L180】 Status reports that validator always fails even for the hello-world scaffold and recommends inspecting failure details and coverage outputs.【F:.automation/STATUS_2025-10-31.md†L15-L38】 The validator currently collapses vitest failures into generic `Tests failed` reasons without naming files or expectations, impeding remediation and evidence capture.【F:packages/validator/src/server.ts†L222-L313】

## 2. Remediation Tasks

1. **Persist failure metrics and validator feedback in MCA state.**
   - Extend `McaState` to include `failure_count` and `last_validator_feedback` (containing validator report path and remediation contract) and declare channels for both so PostgresSaver persists them across iterations in `packages/mca/src/server.ts`.【F:packages/mca/src/server.ts†L20-L176】
   - When validator returns, merge the remediation payload into state and publish it on Redis for downstream services.
   - Update MCA conditional edges so `failure_count >= 3` routes to an `escalated` terminal node that records escalation status in Postgres and SSE.
   - Command: `npm --prefix packages/mca run lint && npm --prefix packages/mca run typecheck` after edits to confirm package-level hygiene.

2. **Emit structured remediation contracts from the validator.**
   - Expand `ValidationReportSchema` to include a `remediation_contract` object with failing test identifiers, observed coverage, and concrete change requests derived from vitest JSON in `packages/validator/src/server.ts`.【F:packages/validator/src/server.ts†L44-L313】
   - Parse the vitest reporter output to collect failing test names and assertions; embed them alongside coverage pct and secrets findings in the contract.
   - Persist the contract in the MinIO validation report and return it in the HTTP response so MCA can load it.
   - Commands: `npm --prefix packages/validator run lint`, `npm --prefix packages/validator run typecheck`, and `npm --prefix packages/validator run test -- --coverage --reporter=json` (expect exit 0, coverage summary written).

3. **Feed remediation context into implementer prompts and guarantee test scaffolding.**
   - Update the implementer request shape in `packages/implementer/src/agent.ts` to accept remediation context from MCA and inject it into the user/system prompt (e.g., include failing test names and required diffs).【F:packages/implementer/src/agent.ts†L68-L244】
   - Modify `ensureScaffold` to create both source and spec files (e.g., `code/src/app.ts` and `code/src/app.test.ts`) aligned with validator expectations so even fallback scaffolds meet coverage criteria.
   - When remediation contract exists, prioritize editing existing files instead of recreating scaffolds; log diffs to Langfuse trace metadata.
   - Commands: `npm --prefix packages/implementer run lint`, `npm --prefix packages/implementer run typecheck`, and targeted unit tests once added (e.g., `npm --prefix packages/implementer run test`).

4. **Make validator failures actionable for coverage remediation.**
   - Enhance the vitest parsing helpers in `packages/validator/src/server.ts` to include per-file coverage percentages and failing assertion excerpts in the remediation contract, and degrade verdict severity if coverage is missing.【F:packages/validator/src/server.ts†L222-L313】
   - Emit SSE artifacts linking to stored `validator-coverage.json` and `validator-junit.xml` so Implementer/Runner logs cite precise keys.
   - Command: `npm test -- --coverage --reporter=json` at repo root to confirm integrated coverage remains ≥80% after changes.

5. **End-to-end state regression test.**
   - After implementing changes above, run a synthetic execution via `npm run dev:up` followed by `curl -s -X POST http://localhost:3030/api/executions -H 'Content-Type: application/json' -d '{"intent":"Build a TODO API with tests"}'`.
   - Observe SSE (`curl -sN http://localhost:3030/api/executions/<execId>/stream`) to ensure remediation cycles terminate with PASS or escalate after three failures, and confirm validator contract lines are published.
   - Command: `npm run dev:down` when finished to release resources.

## 3. Verification Protocol

1. `npm run lint` → expect "0 problems" in output and exit code 0.【F:AGENTS.md†L176-L180】
2. `npm run typecheck` → expect `Found 0 errors` aggregate output (TypeScript exit code 0).【F:AGENTS.md†L125-L130】
3. `npm test -- --coverage --reporter=json` → expect exit 0 with `coverage/coverage-summary.json` showing overall line coverage ≥80%.【F:docs/11_211025/WEEK_2_DOD.md†L146-L198】
4. `npm --prefix packages/validator run test -- --coverage --reporter=json` → expect validator coverage summary ≥90% per compliance script.
5. `npm run dev:up` then issue POST/GET/SSE curl commands from Week 2 DoD to confirm MCA persists checkpoints and SSE publishes remediation statuses, verifying that `needs_remediation` transitions either to `validated` or `escalated` after three failures.【F:docs/11_211025/WEEK_2_DOD.md†L20-L105】【F:.automation/STATUS_2025-10-31.md†L15-L38】
6. Inspect generated validation report in MinIO (`mc cat local/umca-artifacts/<execId>/validator/validation-report.json`) to confirm new `remediation_contract` fields exist and reference failing tests.

## 4. Success Metrics

- Failure escalation triggers when `failure_count >= 3`, with MCA setting execution status to `escalated` in Postgres and SSE.【F:docs/11_211025/week_5_6.md†L17-L27】【F:packages/mca/src/server.ts†L137-L176】
- Validator responses include `remediation_contract.required_changes` and at least one failing test identifier for every FAIL verdict.【F:packages/validator/src/server.ts†L222-L313】
- Implementer scaffolds produce both code and test files on first attempt (`code/src/*.ts` and `code/src/*.test.ts`), and reruns incorporate remediation instructions into prompts.【F:docs/11_211025/VERTICAL_1_PLAN.md†L99-L103】【F:packages/implementer/src/agent.ts†L68-L244】
- Repository-level `npm test -- --coverage --reporter=json` achieves ≥80% line coverage, matching plan gates.【F:docs/11_211025/WEEK_2_DOD.md†L146-L198】
- Validator package-specific coverage check reports ≥90% line coverage (per compliance script) and stores `validator-coverage.json` in MinIO for each execution.【F:packages/validator/src/server.ts†L200-L272】

## 5. Timeline Estimate

| Task | Duration | Notes |
| --- | --- | --- |
| Persist MCA state & escalation wiring | 0.5 day | Includes local regression run of MCA node.
| Validator remediation contract implementation | 1.0 day | Parsing vitest JSON and updating schema/writes.
| Implementer prompt & scaffold updates | 1.5 days | Requires refactoring prompts and adding tests.
| Validator coverage/detail enhancements | 0.5 day | Extends existing helpers and SSE artifacts.
| Integrated end-to-end verification & evidence capture | 0.5 day | Includes running dev orchestrator, curl checks, evidence bundle per AGENTS.【F:AGENTS.md†L92-L156】

_Total: ~4.0 engineering days._

## 6. Risk Assessment

- **LangGraph state schema changes** may require database migrations; ensure Postgres checkpoint tables accommodate new fields before deployment to avoid runtime serialization errors. Mitigation: create a backward-compatible JSON column or default merges.
- **Validator sandbox flakiness** (E2B API throttling) could delay contract generation. Mitigation: retain structured fallback that still increments failure_count and logs actionable error text.
- **Implementer prompt regression** may reduce tool call reliability. Mitigation: add unit tests or snapshot prompts covering scenarios with and without remediation contracts.
- **Coverage gating increases execution time**, potentially impacting CI. Mitigation: parallelize tests where possible and document expected runtime in pipeline instructions.
- **Evidence capture drift** if new artifacts are added without updating attestation scripts. Mitigation: extend `.automation/evidence` manifests and rerun attestation scripts after changes.
