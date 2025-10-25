# Week 3-4 Plan Assessment Summary

Task: Assess Week 3-4 plans vs Week 1-2 way of working and AGENTS.md
Timestamp: $(date -Iseconds)

Verdict: Largely aligned with Week 1-2 and AGENTS.md, with 2 notable misalignments to fix.

Aligned:
- OpenAI-only usage; no Anthropic in V1 (docs explicitly state NOT Anthropic).
- Microservices in Turborepo; adds `packages/implementer` and `packages/vfs`; wires MCA→Implementer.
- Redis Streams, MinIO, Postgres checkpointer, OTel→Tempo→Grafana, Langfuse all retained.
- Binary gates + evidence for Week 3-4; coverage ≥ 80%; lint/types/test gates present.
- Zero-trust posture via independent compilation/verification (full validator deferred to later week).

Misalignments:
1) In-memory VFS implementation (even if “for tests”) conflicts with AGENTS.md repository-wide rule forbidding in-memory persistence. Use MinIO-backed VFS for all environments; for tests, isolate via unique prefixes/buckets.
2) VFS acceptance tests reference HTTP endpoints (port 8010) while the plan defines `packages/vfs` as a library, not a service. Replace HTTP checks with unit/integration tests invoking the library directly or via Implementer service.

Evidence:
- Discovery file with excerpts: .automation/evidence/week3_plan_assessment/discovery.txt
- Provenance: .automation/evidence/week3_plan_assessment/task_provenance.json
- Env: .automation/evidence/week3_plan_assessment/env.txt
- Hashes: .automation/evidence/week3_plan_assessment/artifacts.sha256

Recommendations:
- Remove in-memory VFS deliverable; implement MinIO-backed VFS only. If a mock is needed, keep it as a test-only stub within tests (not exported) or spin a test MinIO namespace/prefix.
- Update Week 3-4 DoD and Quick Start to eliminate VFS HTTP endpoints; define test commands using npm test and MinIO `mc` commands only.
- Keep zero-trust language but clarify validator schedule (Week 5-6) and ensure Week 3-4 gates independently compile and verify generated files.
- Align evidence layout with AGENTS.md (add `valid/` subfolder, audit.json, baseline/final, artifacts hashes) for week3 task.
