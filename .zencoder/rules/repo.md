# Repository Overview

## Monorepo Structure
- **Package manager**: npm workspaces
- **Workspaces**: `packages/*`, `apps/*`
- **Core services** (Vertical Slice #1):
  - **Gateway**: Express REST API entry point
  - **MCA**: Smart coordinator (LangGraph + Postgres)
  - **Planner**: Task decomposition (OpenAI)
  - **Implementer**: Code generation (OpenAI Function Calling)
  - **Runner**: Test execution in VM (E2B)
  - **Validator**: Independent verification (OpenAI)
- **Shared libraries**: `packages/shared` (logger, events/Redis, otel, vfs)

## Key Scripts (root)
- **build**: `turbo run build`
- **dev**: runs gateway, mca, planner, runner, validator in parallel
- **lint**: ESLint over `packages/*/src/**/*.ts`
- **typecheck**: Root TS check + per-package typecheck
- **test**: Vitest (root)
- **dev:up/down/status**: Orchestrates infra + services + UI (see scripts/dev-orchestrator.ts)
- **pipeline:e2e**: Builds VFS/shared, collects health, runs e2e, gathers evidence
- **compliance**: Full gate pipeline (lint, type, tests, coverage, patterns, sbom, facts, meta, OPA, contracts, vuln, secrets, aggregate)

## Infrastructure (Docker Compose)
- **Postgres 16**: 5433 -> 5432 (init via `infrastructure/postgres/init.sql`)
- **Redis 7**: 6380 -> 6379
- **MinIO**: 9000/9001
- **Tempo (OTLP)**: 4317/4318, HTTP 3200
- **Grafana**: 3001
- Network: `umca-net`, named volumes for each service

## Environment (.env.example)
- **OPENAI_API_KEY**: Required for agents (later weeks)
- **DATABASE_URL**: Postgres connection
- **REDIS_URL**: Redis Streams for events/SSE
- **MINIO_ENDPOINT / ACCESS_KEY / SECRET_KEY**: Artifact storage
- **OTEL_EXPORTER_OTLP_ENDPOINT**: Tracing to Tempo
- **GRAFANA_URL**: UI for observability
- **Validator**: Port, coverage threshold, artifact naming, judge toggle
- **Prompts**: Prompt file paths for agents

## Observability
- **OpenTelemetry**: Started per-service via shared helpers
- **Tempo + Grafana**: Tracing and dashboards
- **Langfuse**: LLM cost tracking (dev dependency present)

## Notable Code Paths
- **Shared Events (Redis)**: `packages/shared/src/events.ts`
  - Provides `redisPub`, `redisSub`, `publish`, `subscribe`
- **Runner Compat**: `packages/runner/src/compat.ts`
  - Dynamic imports for shared modules (handles dist/src layouts)
- **Dev Orchestrator**: `scripts/dev-orchestrator.ts`
  - `up/down/status` infra+services+UI lifecycle; optional Playwright screenshot

## Known Issues (current)
- **Redis error handling**: Missing `error` listeners in `shared/events.ts` cause noisy unhandled errors when Redis is down
- **Typecheck fail (Playwright)**: `scripts/dev-orchestrator.ts` imports `playwright` optionally; typecheck errors if not installed
- **ESLint violations (Runner)**: `no-explicit-any` in `compat.ts`; `no-console` in `server.ts`
- **Dev restarts**: EADDRINUSE for planner/mca during rapid reloads

## Recommended Fixes (next steps)
- **Shared/events**: Add `error` listeners, backoff, and resilient publish/subscribe
- **Orchestrator**: Guard Playwright import for typecheck or add devDependency; or exclude script from typecheck
- **Runner**: Replace `console` with shared logger; narrow/remove `any` types
- **Dev scripts**: Graceful shutdown hooks and port cleanup before restart

## Validation Gates
- Lint → TypeCheck → Test (≥80% coverage) → Acceptance
- Evidence generated to `.automation/evidence/` where applicable

## Quick Commands
- `npm run dev:up` — bring up infra + services + UI; capture evidence
- `npm run dev:down` — tear down processes and compose stack
- `npm run lint && npm run typecheck && npm test` — core gates
- `npm run compliance` — full compliance/evidence pipeline