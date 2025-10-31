# Evidence-Based Remediation Plan

## Gap Analysis

### Gap: Pipeline loops on validation failures
File: .automation/STATUS_2025-10-31.md:15-19
Evidence: "Pipeline loops forever on validation failures"; "Hits recursion limit 100 before completing"

### Gap: Validator always FAIL on hello world
File: .automation/STATUS_2025-10-31.md:16-17,31
Evidence: "Validator always returns FAIL for generated hello world code"; "Generated code: README.md + app.ts (but tests fail or coverage < 80%)"

### Gap: Failure count not incrementing/persisting
File: .automation/STATUS_2025-10-31.md:17-18,23,36-37,69-73
Evidence: "Failure counter doesn't increment"; "Track failure_count in state"; "failure_count not persisted across graph iterations"

### Gap: Validator feedback not consumed by Implementer
File: .automation/STATUS_2025-10-31.md:22,37,72
Evidence: "Implementer generates same broken code each iteration"; "Pass validator feedback to implementer"

### Gap: Tests/coverage not reliably produced
File: .automation/STATUS_2025-10-31.md:38-39,76,117,170
Evidence: "vitest may not be running tests or coverage is 0%"; "tests/coverage not reliably produced"

### Gap: Tooling doc references pytest vs Node/Vitest reality
File: docs/11_211025/VERTICAL_1_TOOLING.md:36-40; .automation/STATUS_2025-10-31.md:78-80
Evidence: "Validator (pytest + LLM judge...)" vs actual Node/Vitest stack

### Gap: Missing evidence of MinIO artifact persistence
File: .automation/STATUS_2025-10-31.md:81-83,139-141
Evidence: "artifact persistence to MinIO not evidenced"

### Gap: Observability traces not evidenced
File: .automation/STATUS_2025-10-31.md:85-90
Evidence: "no explicit evidence of traces in Grafana"

### Gap: Gates not all green
File: .automation/STATUS_2025-10-31.md:91-94,172-176
Evidence: "Gates not evidenced green; lingering lint/type issues"

## Remediation Tasks

1) Persist failure_count in MCA state
- File: packages/mca/src/server.ts
- Action: Add failure_count channel to StateGraph and increment on validator FAIL per .automation/REMEDIATION_INSTRUCTION.md:15-45

2) Add remediation_contract to validator report and persist feedback
- Files: packages/validator/src/server.ts; packages/mca/src/server.ts
- Action: Extend ValidationReportSchema and add last_validator_feedback channel per .automation/REMEDIATION_INSTRUCTION.md:62-150,181-197

3) Make Implementer consume remediation feedback
- Files: packages/implementer/src/server.ts; packages/implementer/src/agent.ts
- Action: Include remediation contract in prompt and apply incremental fixes per .automation/REMEDIATION_INSTRUCTION.md:205-254

4) Ensure Runner uploads and surfaces junit/coverage artifacts
- File: packages/runner/src/agent.ts
- Action: Upload junit.xml, coverage.json, and publish SSE artifact links per .automation/REMEDIATION_INSTRUCTION.md:258-292

5) Verify and tag OpenTelemetry traces
- Files: packages/shared/src/otel.ts; packages/gateway/src/server.ts; packages/mca/src/server.ts
- Action: Add healthz checks and span attributes per .automation/REMEDIATION_INSTRUCTION.md:296-346

6) Implement graceful shutdown for E2B sandboxes
- Files: packages/runner/src/agent.ts; packages/runner/src/server.ts
- Action: Track/cleanup sandboxes per .automation/REMEDIATION_INSTRUCTION.md:350-400

7) Align Tooling doc
- File: docs/11_211025/VERTICAL_1_TOOLING.md
- Action: Update validator section to Node/Vitest stack (replace pytest mention) referencing STATUS lines 78-80

8) Persist artifacts to MinIO and reference in SSE/logs
- Files: packages/shared/src/minio.ts; services emitting SSE
- Action: Ensure MinIO keys include execId and are linked in events; verify presence per PLAN.md 96-103

## Verification Protocol

- npm run lint → expect exit 0
- npm run typecheck → expect exit 0
- npm test -- --reporter=json --coverage → expect exit 0; coverage ≥ 80%
- Stream a new execution; expect failure_count increments on each FAIL and MCA exits at ≥3 fails
- Validator FAIL includes remediation_contract; Implementer next iteration uses it (diff observed)
- MinIO contains $EXEC_ID/plan.json, code/, runner/junit.xml, runner/coverage.json, validator/validation-report.json
- Grafana/Tempo health OK; traces visible for execId

## Success Metrics

- Lint/typecheck/tests: all green
- Coverage lines ≥ 80% overall
- failure_count persists and reaches 3 on consecutive FAILs
- Validator PASS on happy path; if FAIL, remediation loop converges within ≤3 iterations
- Artifacts present in MinIO and linked in SSE

## Timeline

- State + feedback wiring: 1d
- Validator schema + implementer consumption: 1d
- Runner artifacts + MinIO links: 0.5d
- Observability tagging: 0.5d
- Graceful shutdown: 0.5d
- Docs alignment + gates verification: 0.5d

## Risk Assessment

- State persistence bugs could continue looping → add unit tests for state transitions
- Over-strict validator may block progress → adjust thresholds only with evidence
- Sandbox flakiness → add retries/timeouts and cleanup handlers
