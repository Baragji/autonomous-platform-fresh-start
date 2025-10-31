# Evidence-Based Remediation Plan

## 1. Gap Analysis
- **Remediation loop stalls on validation failures**: Status report shows executions cycle planner → implementer → runner → validator(FAIL) repeatedly, with recursion limit hit and no escalation.【F:.automation/STATUS_2025-10-31.md†L25-L33】【F:docs/11_211025/week_5_6.md†L17-L47】
- **`failure_count` not persisted**: LangGraph state expected to escalate after three failures per plan and week 5-6 acceptance criteria, but status notes counter never increments beyond 0/1 so loop never exits.【F:.automation/STATUS_2025-10-31.md†L15-L38】【F:docs/11_211025/week_5_6.md†L21-L47】
- **Validator lacks actionable remediation contract**: Plan requires validator to propose remediations and enable loop; status notes implementer ignores feedback because validator provides none.【F:.automation/STATUS_2025-10-31.md†L22-L38】【F:docs/11_211025/VERTICAL_1_PLAN.md†L47-L54】【F:docs/11_211025/week_5_6.md†L17-L47】
- **Coverage/test evidence missing**: Gate docs mandate ≥80% coverage and stored artifacts (plan.json, junit.xml, coverage.json, validation report), but status does not evidence MinIO uploads or passing gates.【F:.automation/STATUS_2025-10-31.md†L31-L38】【F:docs/11_211025/VERTICAL_1_PLAN.md†L47-L54】【F:docs/11_211025/WEEK_2_DOD.md†L20-L101】【F:docs/11_211025/WEEK_3_4_DOD.md†L73-L139】【F:AGENTS.md†L49-L103】
- **Validator execution misaligned with tooling expectations**: Tooling document references pytest-based validator while stack is Node/Vitest; this mismatch contributes to failing validation path.【F:.automation/STATUS_2025-10-31.md†L77-L105】【F:docs/11_211025/VERTICAL_1_TOOLING.md†L1-L78】
- **Observability and Langfuse telemetry unevidenced**: Plan and DoD require Grafana/Tempo traces and Langfuse cost tracking, but status lists no proof of trace visibility or Langfuse usage.【F:.automation/STATUS_2025-10-31.md†L83-L140】【F:docs/11_211025/VERTICAL_1_PLAN.md†L45-L54】【F:docs/11_211025/WEEK_2_DOD.md†L104-L140】
- **Graceful shutdown and Redis hardening gaps**: Deviation analysis flags missing error listeners/backoff and shutdown handling, violating reliability expectations for production-grade slice.【F:.automation/STATUS_2025-10-31.md†L111-L155】【F:docs/11_211025/VERTICAL_1_PLAN.md†L117-L200】

## 2. Remediation Tasks
1. **Persist remediation state in MCA graph**
   - Update `packages/mca/src/server.ts` to include `failure_count` and `last_validator_feedback` channels/state so Postgres checkpointer persists counters and validator feedback across iterations, matching escalation design.【F:.automation/STATUS_2025-10-31.md†L15-L38】【F:docs/11_211025/week_5_6.md†L21-L47】
   - Ensure validator node increments `failure_count` and writes structured feedback payload into state.
   - Command: `npm --prefix packages/mca run lint && npm --prefix packages/mca run test` (if package scripts exist) after changes to validate local logic.

2. **Emit actionable remediation contracts from validator**
   - Extend validator schema in `packages/validator/src/server.ts` to include failing tests, coverage percent, and `required_changes` instructions aligned with zero-trust expectations.【F:docs/11_211025/VERTICAL_1_PLAN.md†L47-L54】【F:docs/11_211025/week_5_6.md†L17-L47】
   - Capture runner artifacts (JUnit, coverage) and pass parsed failure details into remediation contract.
   - Command: `npm --prefix packages/validator test -- --reporter=json --coverage` to confirm schema updates maintain ≥80% coverage as mandated.【F:AGENTS.md†L49-L103】

3. **Inject validator feedback into implementer prompts**
   - Modify `packages/implementer/src/agent.ts` (and associated prompt utilities) to read `last_validator_feedback` from MCA state payload and include `required_changes` plus failing tests in OpenAI function call context, ensuring differential edits instead of regenerating identical code.【F:.automation/STATUS_2025-10-31.md†L22-L38】【F:docs/11_211025/VERTICAL_1_PLAN.md†L184-L193】
   - Add unit tests mocking validator feedback to confirm implementer adapts outputs.
   - Command: `npm --prefix packages/implementer test -- --reporter=json`.

4. **Upload and reference runner artifacts in MinIO**
   - Ensure runner writes `junit.xml` and `coverage.json` into execution-specific prefixes in MinIO, fulfilling plan deliverables.【F:docs/11_211025/VERTICAL_1_PLAN.md†L47-L54】【F:docs/11_211025/WEEK_3_4_DOD.md†L62-L76】
   - Update SSE or execution status payloads to include MinIO paths for validator consumption.
   - Command: `npm --prefix packages/runner test -- --reporter=json` then run integration via `npm run e2e:runner` (or equivalent) to confirm artifact persistence.

5. **Reconcile validator execution tooling**
   - Align documentation and code by ensuring validator runs Node/Vitest suites with coverage thresholds set to ≥80% as per AGENTS gate, updating any pytest references in tooling docs or validator scripts.【F:.automation/STATUS_2025-10-31.md†L77-L118】【F:AGENTS.md†L49-L103】
   - Command: `npm test -- --coverage --run` from repo root to produce consistent reports.

6. **Instrument observability and Langfuse evidence**
   - Verify each service emits OpenTelemetry spans with execId tags and confirm Tempo/Grafana endpoints return healthy responses during execution, storing evidence artifacts per Week 2 DoD.【F:docs/11_211025/WEEK_2_DOD.md†L104-L140】
   - Wrap LLM calls in Langfuse client instrumentation ensuring keys present per DoD and attach execution IDs.【F:docs/11_211025/WEEK_2_DOD.md†L124-L140】
   - Command sequence: `curl -s http://localhost:3200/ready`, `curl -s http://localhost:3001/api/health`, and `npm run telemetry:smoke` (if available) while capturing outputs into `.automation/evidence/<task>/`.

7. **Add graceful shutdown and Redis hardening**
   - Implement signal handlers closing Redis clients, DB pools, and E2B sandboxes in each service entrypoint, and add retry/backoff/error listeners for Redis per reliability findings.【F:.automation/STATUS_2025-10-31.md†L111-L155】
   - Command: Run `npm run lint` and targeted unit tests to ensure no regressions, then simulate shutdown via `pkill -f packages/` while monitoring logs.

8. **End-to-end execution validation**
   - After implementing fixes, execute full pipeline via `npm run e2e:intent -- --intent "Build a TODO API with tests"` (or the repository’s scripted equivalent) ensuring validator reaches PASS and failure_count-driven escalation triggers after three failures in negative test.【F:docs/11_211025/VERTICAL_1_PLAN.md†L14-L54】【F:docs/11_211025/week_5_6.md†L17-L47】
   - Persist evidence under `.automation/evidence/remediation_loop/` following AGENTS structure.【F:AGENTS.md†L92-L155】

## 3. Verification Protocol
For each remediation task collect machine evidence:
- **State persistence tests**: Run `npm --prefix packages/mca test` and capture output to `.automation/evidence/remediation_loop/valid/mca-tests.json`; verify assertions covering failure_count persistence.【F:AGENTS.md†L92-L155】
- **Validator contract**: Execute `npm --prefix packages/validator test -- --reporter=json --coverage` saving JSON and coverage report; confirm line coverage ≥80% and remediation payload fields populated in snapshots.【F:AGENTS.md†L49-L103】
- **Implementer adaptation**: Run targeted implementer tests with mock feedback and store logs demonstrating changed code between iterations.
- **Runner artifacts**: After running integration, list MinIO execution prefix with `mc ls local/umca-artifacts/$EXEC_ID/` expecting `plan.json`, `code/`, `runner/junit.xml`, `runner/coverage.json`, `validator/report.json`.【F:docs/11_211025/WEEK_2_DOD.md†L79-L101】【F:docs/11_211025/VERTICAL_1_PLAN.md†L47-L54】
- **Telemetry**: Capture `curl` health checks outputs and export Grafana trace IDs into `.automation/evidence/remediation_loop/tempo_ready.txt` and `grafana_health.json` per Week 2 DoD template.【F:docs/11_211025/WEEK_2_DOD.md†L104-L118】
- **Graceful shutdown**: Record logs showing clean shutdown events with no Redis/E2B errors after sending SIGTERM during test execution.
- **End-to-end proof**: Save final `tests.json`, `coverage.json`, validator report, and MCA state snapshot demonstrating PASS plus escalation after scripted failure, ensuring all evidence files hashed via `shasum -a 256` per AGENTS instructions.【F:AGENTS.md†L142-L149】

## 4. Success Metrics
- **Validator remediation loop**: Execution completes with validator verdict `PASS` within ≤5 iterations, and escalation path triggers after ≥3 consecutive FAIL scenarios.【F:docs/11_211025/week_5_6.md†L21-L47】
- **Coverage**: `npm test -- --coverage --run` reports ≥80% line coverage repository-wide, validator package maintains ≥80%.【F:AGENTS.md†L49-L103】
- **Artifact completeness**: MinIO bucket contains plan, code, junit, coverage, validation-report for each execution ID as defined in plan deliverables.【F:docs/11_211025/VERTICAL_1_PLAN.md†L47-L54】
- **Telemetry**: Tempo readiness endpoint returns `ready` and Grafana health shows `"database":"ok"` during validation runs; Langfuse logs contain execution cost entries.【F:docs/11_211025/WEEK_2_DOD.md†L104-L140】
- **Reliability**: Services handle SIGTERM with zero unhandled Redis/E2B errors in logs across three consecutive restarts.【F:.automation/STATUS_2025-10-31.md†L111-L155】

## 5. Timeline
- **Day 1**: Remediation state persistence & validator contract schema (Tasks 1-2).
- **Day 2**: Implementer feedback integration and runner artifact persistence (Tasks 3-4).
- **Day 3**: Tooling reconciliation, observability instrumentation, Redis/shutdown hardening (Tasks 5-7).
- **Day 4**: Full end-to-end validation, evidence capture, and regression fixes (Task 8 plus verification protocol).

## 6. Risk Assessment
- **LangGraph state mutations regress routing**: Incorrect channel configuration could break normal flow; mitigate with unit tests covering PASS/FAIL transitions before deployment.【F:.automation/STATUS_2025-10-31.md†L15-L38】
- **Validator contract overfits to specific test output**: Schema assumptions may fail on new tasks; design contract fields to accept variable arrays and document defaults.【F:docs/11_211025/VERTICAL_1_PLAN.md†L47-L54】
- **Implementer prompt drift**: Incorporating feedback may degrade baseline outputs; add regression snapshots for successful tasks to ensure improvements preserve prior success.【F:docs/11_211025/VERTICAL_1_PLAN.md†L184-L193】
- **MinIO availability**: Artifact uploads rely on MinIO uptime; include retries/backoff and alerting to avoid evidence gaps.【F:docs/11_211025/VERTICAL_1_PLAN.md†L40-L54】
- **Telemetry overhead**: Additional tracing could increase execution time/cost; monitor Langfuse cost metrics vs. $2 per execution target.【F:docs/11_211025/VERTICAL_1_PLAN.md†L16-L21】
