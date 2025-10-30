# Code Audit Report — 2025-10-29

## Executive Summary
- Total Files Audited: 44
- Critical: 15 — Major: 52 — Minor: 53
- Top Risk Themes: missing workspace dependencies & type definitions, unguarded evidence-file APIs, pervasive unsafe casts/silent catches
- Estimated Remediation: ~8.5 hours (±4 for pattern hardening)

## Critical Issues (Blocking Production)
- Web UI GET /api/file allows path traversal against the evidence root, letting callers read arbitrary files.【F:apps/web/app/api/file/route.ts†L24-L55】
- Web UI POST /api/artifacts zips attacker-chosen paths without bounding them to the evidence directory.【F:apps/web/app/api/artifacts/route.ts†L24-L37】
- Repository typecheck fails immediately because workspace @types/node/@types/vitest packages are missing, so no service can compile.【F:typecheck_results.txt†L3-L11】【F:tsconfig.base.json†L7-L13】
- ESLint pipeline cannot run; the config requires @typescript-eslint/parser which is absent from node_modules.【F:eslint_results.txt†L5-L21】
- npm audit flags Next.js 14.2.5 with a critical auth bypass yet the UI still depends on it.【F:npm_audit.json†L296-L320】【F:apps/web/package.json†L12-L19】
- libxmljs2 0.35.0 remains in the dependency graph with a critical type-confusion CVE.【F:npm_audit.json†L108-L123】【F:package-lock.json†L12854-L12863】
- npm ls shows every workspace service as UNMET DEPENDENCY, indicating install/bootstrap is broken.【F:npm_ls.txt†L1-L8】

## Major Issues
- skipLibCheck in the shared tsconfig hides upstream library type mismatches in all services.【F:tsconfig.base.json†L7-L13】
- Gateway fire-and-forget fetch to MCA drops errors silently, so executions can stall without alerting operators.【F:packages/gateway/src/server.ts†L22-L26】
- The streaming API trusts non-null assertions on upstream.body and chunk values, risking runtime crashes when SSE disconnects.【F:apps/web/app/api/stream/route.ts†L17-L25】
- Implementer swallows errors while reading validator artifacts and during degraded handoff, erasing actionable diagnostics.【F:packages/implementer/src/server.ts†L40-L71】
- Numerous unsafe casts (as unknown/as any) pervade MCA, runner, and validator agents, weakening runtime guarantees.【F:packages/mca/src/server.ts†L31-L34】【F:packages/runner/src/agent.ts†L63-L77】

## Minor Issues
- Tests and UI components retain explicit any usage, reducing maintainability of client-side state types.【F:apps/web/app/session/[id]/page.tsx†L10-L20】
- Console logging persists inside test utilities contrary to structured logging policy.【F:packages/implementer/src/__tests__/tools.test.ts†L38-L44】
- Multiple silent catches remain in shared utilities (env loader, event relay) and should at minimum log sanitized context.【F:packages/shared/src/env.ts†L8-L17】【F:packages/shared/src/events.ts†L20-L27】

## Linting Summary
- ESLint aborts before scanning code because @typescript-eslint/parser is missing from the environment; no rule results are produced until dependencies are restored.【F:eslint_results.txt†L5-L21】

## Type Safety Summary
- TypeScript compilation for every workspace fails due to missing type definitions, and the Next.js UI lacks React/Next types, leading to hundreds of TS2307/TS7026 errors.【F:tsc_per_package.txt†L58-L120】【F:typecheck_results.txt†L3-L11】
- Services rely on non-null assertions and unsafe casts to coerce SDK outputs instead of validating runtime data, e.g., runner sandbox imports and validator casting responses.【F:packages/runner/src/agent.ts†L63-L104】【F:packages/validator/src/server.ts†L228-L275】
- Evidence streaming maps trace data as any, making the UI vulnerable to malformed telemetry crashing render cycles.【F:apps/web/app/api/stream/route.ts†L44-L52】

## Dependency/Config Issues
- Workspace bootstrap is incomplete; npm ls shows unmet local package dependencies and the UI lacks node_modules entirely.【F:npm_ls.txt†L1-L8】
- Critical advisories remain open for Next.js 14.2.5 and libxmljs2 0.35.0 per npm audit output.【F:npm_audit.json†L108-L123】【F:npm_audit.json†L296-L320】
- skipLibCheck and silent catch patterns in shared config reduce observability and type coverage, undermining the hardened pipeline goals.【F:tsconfig.base.json†L7-L13】【F:packages/shared/src/env.ts†L8-L17】

## Remediation Roadmap (Priority by Impact/Effort)
1. Restore workspace installs and add missing @types/* packages so typecheck/lint/test gates run green; verify npm ls reports no unmet deps (est. 3h).
2. Patch Web UI API handlers to validate and sandbox requested paths before touching the filesystem, adding tests for traversal attempts (est. 2h).
3. Upgrade Next.js and resolve transitive libxmljs2 vulnerability via dependency bumps or replacements (est. 1.5h).
4. Replace fire-and-forget patterns and silent catches with structured logging and retries across gateway/implementer/shared utilities (est. 1.5h).
5. Remove skipLibCheck and eliminate unsafe casts by refining types in MCA/runner/validator agents (est. 0.5h).
