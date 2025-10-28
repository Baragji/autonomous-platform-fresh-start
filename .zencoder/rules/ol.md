# Repository Context & Policies

## Overview
- **Purpose**: Central reference for repository-specific rules required by Zencoder agents.
- **Primary Sources**: `CONSTITUTION.md`, `AGENTS.md`, and `docs/mission/MISSION_OPTION_A_EXECUTION.md`.

## Key Branches
- `secure_hardening_20251025T200131Z`: current hardening branch.
- `release/secure-<UTC>`: release branches must follow protection rules before being considered production-ready.

## Directory Layout Expectations
- `packages/`: each microservice lives in its own subfolder (gateway, planner, mca, implementer, runner, validator, reviewer, etc.).
- `infrastructure/`: docker compose and infra assets.
- `docs/`: human-authored documentation with required subfolders:
  - `docs/adr/`, `docs/incidents/`, `docs/mission/`, `docs/release/`.
- `.automation/evidence/`: machine-generated evidence only (coverage.json, healthz_sweep.json, e2e_request_response.json, prod_env_guard.json, v5-report.json, ATTACHMENT_MANIFEST.json, TAMPERING_ALERT.txt, .gitkeep).
- `scratch_local/`: gitignored workspace for temporary notes.

## Governance Principles
1. **Enterprise from line 1**: production-grade architecture and tooling; no prototypes.
2. **Evidence-driven**: every claim backed by machine-verifiable artifacts.
3. **Locked stack**: TypeScript/Node.js 20+, OpenAI LLMs, LangGraph, Postgres, Redis Streams, MinIO, E2B, OpenTelemetry stack.
4. **Microservices**: services communicate via MCA with bounded remediation loop.
5. **Binary validation gates**: lint → typecheck → tests (coverage ≥80%) → acceptance.

## Current Mission Execution
- **Mission file**: `docs/mission/MISSION_OPTION_A_EXECUTION.md` is actively in force.
- **Objective summary**: Deliver Option A pipeline—Smart MCA → Smart Specialists → Zero-Trust Validator—with deterministic validator, bounded remediation loop (≤3 attempts), CI-enforced evidence, Cosign attestation, OpenSSF Scorecard, and protected `release/secure-<UTC>` branch.

## Current Status Snapshot (2025-10-28T04:23Z)
- CI runs on PRs targeting `secure_hardening_*` and `release/secure-*` branches; compliance job passing, enforce job rerunning after validator timeout increase to 60s.
- Phase 3 evidence regenerated locally: manifest clean, `touched_validator: true`, coverage 81.61% lines, narrative scan clean.
- Reviewer workspace added to lockfile; runner lint issues resolved; `init-db` script included in enforce job.
- Validator coverage gate temporarily set to ≥70% (current ~72.66%) with directive to raise coverage and restore ≥80% before release branch cut.
- SBOM to be written outside evidence allowlist (`.automation/supply_chain/sbom.json`) with Cosign predicate path updated accordingly.
- Open PR `chore/repo-hygiene-20251027T181800Z` → `secure_hardening_20251025T200131Z`; monitoring for all-green CI.
- Next actions: keep global coverage ≥80%, raise validator coverage to ≥80% prior to release, ensure enforce job asserts validator touched/narrative ban/manifest match, rerun CI to green, cut protected `release/secure-<UTC>` branch, rerun attestation, apply branch protection (require enforce + scorecard, block force-push, require review), confirm no secret leakage.

## Critical Operational Rules
- Implementer must provide partial handoffs under `<execId>/code/` even on failure scenarios.
- MCA remediation loop capped at 3 attempts; escalate thereafter.
- Runner must return HTTP 200 with structured `{ ok: false, reason }` for expected failures.
- Validator must set `touched_validator: true` and enforce coverage/test gates.
- Reviewer service provides advisory fix plans (non-blocking).
- CI workflow (`.github/workflows/ci.yml`) must start infra, run e2e intent, regenerate evidence, enforce validator touched & coverage gates, run secret scan, produce SBOM, perform Cosign attest/verify, and run OpenSSF Scorecard.
- `.automation/evidence/ATTACHMENT_MANIFEST.json` must match regenerated manifest.

## Evidence Discipline
- Only allowlisted files under `.automation/evidence/`.
- Regenerate evidence after meaningful changes and attest using `scripts/attest-evidence.sh`.
- No narrative prose in evidence files; quarantine any violations.

## Security & Secrets
- Load secrets locally via `.env`; never print or commit secret values.
- CI consumes secrets from GitHub Actions secret store; outputs must keep them masked.

## Commit & Branch Standards
- Conventional Commits (types: feat, fix, docs, ci, chore, test, refactor).
- Branch prefixes limited to: `feature/`, `fix/`, `chore/`, `secure_hardening_<UTC>`, `release/secure-<UTC>`.
- Protected branches require CI green, Cosign verification, Scorecard ≥ policy threshold, and validator evidence.

## Additional Resources
- `scripts/collect-*.ts`: evidence generation helpers.
- `scripts/attest-evidence.sh`: regenerates manifest and Cosign attestations.
- `policy/repo.rego`: OPA policy enforcing repo hygiene.