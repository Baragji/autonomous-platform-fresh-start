# REMEDIATION_INSTRUCTION_EVIDENCE_BASED

Version: 2025-10-31
Scope: Vertical Slice #1 (Gateway → MCA → Planner → Implementer → Runner → Validator)
Audience: Engineers/Agents working in this monorepo (TypeScript, Node 20, E2B, LangGraph, Postgres, Redis, MinIO, OTEL)

---

## 0) References (Ground Truth)
- Plan: docs/11_211025/VERTICAL_1_PLAN.md
- Tooling: docs/11_211025/VERTICAL_1_TOOLING.md
- Status: .automation/STATUS_2025-10-31.md
- Existing remediation plan: .automation/REMEDIATION_INSTRUCTION.md
- Repo overview: .zencoder/rules/repo.md
- AGENTS policy: AGENTS.md (enforced)

---

## 1) Technical Requirements, Constraints, Success Criteria (Extracted)
- Architecture: Microservices in packages/* (gateway, mca, planner, implementer, runner, validator).
- Orchestration: LangGraph JS + Postgres checkpointer; state must persist (e.g., failure_count).
- Messaging: Redis Streams.
- Artifacts: MinIO (plan.json, code files, junit.xml, coverage.json, validation-report.json).
- Sandbox: E2B (Node 20 template) for npm install and vitest.
- Observability: OpenTelemetry → Tempo → Grafana; trace per agent; link artifacts.
- Costs: Langfuse tracking for LLM usage (plan/tooling).
- Validation Gates (must pass in CI): lint → typecheck → tests (≥80% coverage) → acceptance; capture evidence.
- Validator: Zero-trust; independently runs tests, verifies coverage ≥80%, checks secrets; remediation loop; escalate on 3x fail.
- Implementer: OpenAI Function Calling (not Anthropic) per tooling + AGENTS.

---

## 2) Production-Readiness Gaps and Compliance Issues (Consolidated)
- State/Control-Flow:
  - failure_count not persisted (remediation loop never escalates; recursion limit hit).
  - Validator feedback not consumed by Implementer; repeated broken outputs.
- Runner/Artifacts:
  - junit.xml/coverage.json not consistently saved to MinIO or surfaced via SSE.
- Gates/Compliance:
  - No evidence bundle showing all-green gates; known lint/type issues outstanding.
- Resilience:
  - Missing Redis error listeners/backoff; lazy connect not enforced.
  - Graceful shutdown incomplete (Redis clients, DB pools, E2B cleanup).
- Observability/Cost:
  - Traces to Grafana unverified/undocumented; no artifact links in spans.
  - Langfuse integration not evidenced.
- Documentation drift:
  - Tooling doc mentions pytest for validator while repo uses Node/Vitest.

---

## 3) Remediation Tasks (Actionable, Specific, Evidence-Driven)

### T1. Persist failure_count and remediation feedback in MCA state
- Files:
  - packages/mca/src/server.ts
- Actions:
  1) Add channels for `failure_count` and `last_validator_feedback` in StateGraph configuration with merge functions that keep latest values.
  2) Ensure validator node increments `failure_count` on FAIL, persists in state, and returns END when `failure_count >= 3`.
  3) Add conditional edges that branch correctly based on validator verdict.
- Success Metrics:
  - Given a forced FAIL scenario, failure_count increments across iterations and graph exits at 3 with END.
  - Evidence: .automation/evidence/$TASK/valid/tests.json shows passing unit test for state transitions; logs/SSE confirm escalation path.

### T2. Add remediation_contract to validator report and pass to Implementer
- Files:
  - packages/validator/src/server.ts (zod schema + report construction)
  - packages/mca/src/server.ts (validator node return payload)
  - packages/implementer/src/server.ts (consume feedback)
  - packages/implementer/src/agent.ts (prompt includes feedback)
- Actions:
  1) Extend ValidationReportSchema with `remediation_contract` { failing_tests[], coverage_percent, required_changes }.
  2) Populate remediation_contract on FAIL with actionable guidance.
  3) Persist feedback in MCA state as `last_validator_feedback` and forward to Implementer.
  4) Modify Implementer to read and apply remediation_contract, guiding incremental edits instead of regeneration.
- Success Metrics:
  - On FAIL, Implementer’s next attempt changes only targeted areas; subsequent validator PASS rate improves to ≥70% on simple intents.
  - Evidence: Diff of files between iterations shows focused changes; validator report transitions to PASS within ≤3 iterations on sample intent.

### T3. Surface test artifacts and coverage from Runner to MinIO and SSE
- Files:
  - packages/runner/src/agent.ts
  - packages/shared/src/vfs/* (if MinIO client abstraction is here)
- Actions:
  1) Ensure vitest JSON → junit.xml conversion and coverage.json extraction on sandbox filesystem.
  2) Upload junit.xml, coverage.json, and vitest raw output to MinIO keys under execId (e.g., runner/junit.xml, runner/coverage.json).
  3) Emit SSE events with artifact keys; include in logs and validator inputs.
- Success Metrics:
  - For a passing sample project: junit.xml and coverage.json exist in MinIO; coverage ≥80%.
  - Evidence: SSE events contain artifact links; MinIO paths recorded in .automation/evidence/$TASK/final.json.

### T4. Close resiliency gaps: Redis hardening + graceful shutdown
- Files:
  - packages/shared/src/events.ts (add `error` listeners, lazyConnect, exponential backoff)
  - packages/*/src/server.ts or lifecycle modules (registerShutdown for Redis/DB/E2B)
  - packages/runner/src/agent.ts (track and dispose sandboxes on shutdown)
- Actions:
  1) Add `redisPub`/`redisSub` error handlers and reconnect strategy; opt into lazy connect where supported.
  2) Implement registerShutdown in each service to close Redis, DB pools, and E2B sandboxes cleanly.
- Success Metrics:
  - Killing services does not leave zombie sandboxes or open ports; Redis outages do not crash processes with unhandled exceptions.
  - Evidence: Controlled shutdown log contains cleanup confirmations; no unhandled error logs during Redis outage simulation.

### T5. Observability and artifact-to-trace linkage
- Files:
  - packages/shared/src/otel.ts (or service-specific OTEL init)
  - packages/mca/src/server.ts (span attributes per node)
- Actions:
  1) Ensure spans per agent include attributes: execId, agent, artifact keys.
  2) Validate traces appear in Grafana; document links between spans and MinIO artifacts.
- Success Metrics:
  - New executions produce end-to-end traces with agent spans and artifact attributes visible.
  - Evidence: Screenshot or exported trace metadata saved to evidence bundle; service logs show span IDs.

### T6. CI Gates and Evidence pipeline
- Files:
  - package.json scripts; scripts/* (if required)
- Actions:
  1) Fix ESLint and TypeScript violations called in repo overview; keep `no-explicit-any`, avoid console in src/.
  2) Ensure `npm run lint`, `npm run typecheck`, `npm test` (coverage ≥80%) pass locally and in CI.
  3) Populate `.automation/evidence/$TASK/valid/*` per AGENTS policy for one full run.
- Success Metrics:
  - All gates green with artifacts captured; branch protection requires these checks.
  - Evidence: lint.txt, typecheck.txt, tests.json, coverage.json present and green.

### T7. Documentation and contract alignment
- Files:
  - docs/11_211025/VERTICAL_1_TOOLING.md (validator runtime note)
- Actions:
  1) Update validator runtime note from pytest to Node/Vitest to match repo reality.
- Success Metrics:
  - Tooling reflects OpenAI-only, Node/Vitest validator; no cross-doc contradictions.

---

## 4) Implementation Plan (Step-by-Step)
1) T1: MCA state fix (failure_count, feedback channels), validator node END on 3 fails; add unit tests for state transitions.
2) T2: Add remediation_contract schema + Implementer consumption; add unit/integration tests for one remediation cycle.
3) T3: Runner artifact surfacing to MinIO + SSE; verify coverage json detection and junit conversion.
4) T4: Redis hardening and graceful shutdown hooks in all services; simulate Redis outage and service shutdown.
5) T5: OTEL span attributes and Grafana verification; attach artifact keys to spans.
6) T6: Resolve lint/type issues; run gates; produce evidence bundle.
7) T7: Update Tooling doc to align validator runtime.

Integration Points:
- MCA <-> Validator: failure_count, last_validator_feedback
- Validator -> Implementer: remediation_contract
- Runner -> MinIO -> Validator: junit.xml, coverage.json
- OTEL spans across Gateway/MCA/Agents with execId attribute

Completion Criteria per Task:
- As defined in Success Metrics above; plus all CI gates must remain green after each task.

Version Control & Change Management:
- Branch: feature/remediation-v1
- Commits: one per task (T1..T7) with descriptive scope, include references to files changed and tests added.
- PR: link evidence bundle path; require CI green; request review from owner.
- Rollback: revert commit per task; changes isolated by task to minimize blast radius.

---

## 5) Quality Assurance
- Validation Checks:
  - Schema-validated validator report (zod) with remediation_contract.
  - LangGraph state unit tests for persistence and branching.
  - Runner integration test to assert artifacts exist and contain expected keys.
- Automated Testing:
  - Add unit tests for MCA transitions and validator contract emission.
  - Add integration test for 1 remediation roundtrip yielding PASS ≤3 iterations.
  - Ensure coverage ≥80% repo-wide and ≥90% in validator (per AGENTS recommendations if applicable).
- Documentation Workflow:
  - Update Tooling doc; peer review; ensure no conflicts with AGENTS.md.
- Rollback Procedures:
  - Revert task-specific commit; ensure prior gates remain green; redeploy services safely with shutdown hooks.

---

## 6) Production Readiness Checklist
- [ ] T1: failure_count persisted; escalation at 3 fails; tests added
- [ ] T2: remediation_contract emitted and consumed; implementer makes targeted fixes
- [ ] T3: junit.xml and coverage.json persisted to MinIO; SSE events include links
- [ ] T4: Redis error handling/backoff; graceful shutdown across all services
- [ ] T5: OTEL traces visible in Grafana; spans include execId and artifact keys
- [ ] T6: Lint/type/tests (≥80% coverage) all green; evidence bundle captured
- [ ] T7: Tooling doc aligned with Node/Vitest validator
- [ ] Branch protection enabled with required checks

---

## 7) Implementation Timeline (Milestones)
- Day 1: T1 complete (state, tests) → PR-1
- Day 2: T2 complete (schemas, implementer, tests) → PR-2
- Day 3: T3 complete (runner artifacts, SSE) → PR-3
- Day 4: T4 complete (redis + shutdown), T5 spans → PR-4
- Day 5: T6 gates + evidence, T7 doc alignment → PR-5

---

## 8) Risk Assessment Matrix
- State not persisting → Looping/recursion → Mitigation: unit tests; Postgres checkpointer verification.
- E2B rate limits/instability → Delays/failures → Mitigation: backoff, circuit breaker, sandbox reuse where safe.
- Redis outages → Unhandled errors → Mitigation: error listeners, retry/backoff, lazy connect.
- Flaky tests/coverage <80% → Gate failures → Mitigation: stable sample project; deterministic tests; retry logic bounded.
- OTEL misconfig → No visibility → Mitigation: health checks; explicit span attributes; manual Grafana verification.
- Doc drift → Operator confusion → Mitigation: align Tooling doc; PR review.

---

## 9) Post-Implementation Monitoring Plan
- KPIs:
  - Execution success rate ≥ 90% on simple intents (TODO API baseline).
  - Avg iterations to PASS ≤ 3.
  - Coverage ≥ 80% on happy path.
  - Trace presence = 100% of executions; artifacts linked.
  - Zero zombie E2B instances after shutdowns.
  - No unhandled Redis errors over 24h.
- Runbook:
  - On sustained FAIL loops: inspect failure_count, remediation_contract, runner artifacts; open incident if iterations > 3 without improvement.
  - On missing artifacts: check runner uploads and MinIO connectivity.
  - On missing traces: check OTLP endpoint and service OTEL init.

---

## 10) Acceptance (Evidence Bundle Requirements)
- Path: .automation/evidence/remediation-v1/
  - discovery.txt: list of files edited and findings
  - valid/lint.txt, valid/typecheck.txt, valid/tests.json, valid/coverage.json
  - final.json: PASS summary with MinIO artifact keys
  - artifacts.sha256 for changed files
  - env.txt, task_provenance.json

This instruction is tailored to this repository’s architecture and tooling, removes generic guidance, and provides measurable, evidence-backed completion criteria for each remediation task.