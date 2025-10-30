Bug ID: 1
Timestamp: 2025-10-29T00:00:00Z
Bug Description: Missing Redis error handling causes unhandled ioredis error events and noisy logs when Redis is unavailable, risking process instability and masking real issues.
Location: packages/shared/src/events.ts:5-7 (branch ui/file-fetch-and-predev @ 797b4b75)
Severity: Major (Repeated unhandled error events; potential crash if 'error' not handled)
Priority: P1 (Affects multiple services at startup; degrades observability and stability)
Reproduction Steps:
1) Stop Redis or ensure no Redis is listening on REDIS_URL (default redis://localhost:6380).
2) Start gateway/planner/implementer/mca (e.g., `npm run dev` per service).
3) Observe logs reporting repeated ioredis errors.
Expected Behavior: Services should attach 'error' listeners to Redis clients, backoff/retry gracefully, and avoid flooding logs or crashing.
Actual Behavior: Logs filled with ioredis AggregateError/EPIPE/ECONNRESET without graceful handling.
Screenshots/Logs:
- .gateway.log excerpt:
  - "[ioredis] Unhandled error event: Error: write EPIPE" and "AggregateError" repeated many times.
- .implementer.log excerpt:
  - similar EPIPE/ECONNRESET/AggregateError entries.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: In shared events module, register redisPub.on('error', ...) / redisSub.on('error', ...); optionally lazy-init clients and implement retry/backoff. Make publish() tolerate transient errors (try/catch) and consider a circuit breaker.

---

Bug ID: 2
Timestamp: 2025-10-29T00:00:00Z
Bug Description: TypeScript typecheck fails due to missing 'playwright' module import in dev orchestrator script, blocking CI/type gates.
Location: scripts/dev-orchestrator.ts:153 (branch ui/file-fetch-and-predev @ 797b4b75)
Severity: Major (Blocks `npm run typecheck`)
Priority: P1 (CI gating and local developer workflow)
Reproduction Steps:
1) Run `npm run typecheck` from repo root.
2) Observe TS2307 cannot find module 'playwright'.
Expected Behavior: Typecheck passes or script is excluded from typecheck when optional tooling not installed.
Actual Behavior: Typecheck exits non-zero with TS2307.
Screenshots/Logs: `scripts/dev-orchestrator.ts:153:39 - error TS2307: Cannot find module 'playwright'`
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Add devDependency "playwright" (and types) or guard dynamic import with `// @ts-expect-error` + runtime try/catch; alternatively exclude scripts/* from the typecheck target or move browser-specific logic behind feature flag.

---

Bug ID: 3
Timestamp: 2025-10-29T00:00:00Z
Bug Description: ESLint violations in runner package: use of `any` and `console.log`, causing lint gate to fail.
Location: 
- packages/runner/src/compat.ts:23 (`any`)
- packages/runner/src/server.ts:12,17 (`console`)
(branch ui/file-fetch-and-predev @ 797b4b75)
Severity: Minor (Style/quality gate fails)
Priority: P2 (Blocks compliance:patterns pipeline step that depends on lint)
Reproduction Steps:
1) Run `npm run lint`.
2) Observe 3 errors reported by ESLint.
Expected Behavior: Lint passes with zero errors.
Actual Behavior: 3 errors: no-explicit-any, no-console.
Screenshots/Logs:
- "packages/runner/src/compat.ts:23:40  error  Unexpected any"
- "packages/runner/src/server.ts:12:5  error  Unexpected console statement"
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Replace `any` with concrete type for dynamic imports, or narrow types; replace console usage with the shared logger utility.

---

Bug ID: 4
Timestamp: 2025-10-29T00:00:00Z
Bug Description: Port conflicts during dev restarts (EADDRINUSE) for planner and mca suggest processes not fully torn down on reload, leading to startup failures.
Location: 
- packages/planner/src/server.ts (listen on :7020)
- packages/mca/src/server.ts (listen on :7010)
(branch ui/file-fetch-and-predev @ 797b4b75)
Severity: Minor (Local DX instability; can block service startup)
Priority: P3
Reproduction Steps:
1) Start planner/mca with ts-node-dev.
2) Make rapid edits causing multiple restarts.
3) Observe EADDRINUSE in logs; service fails to bind.
Expected Behavior: On restart, previous server instance releases port cleanly.
Actual Behavior: Multiple restarts can leave port occupied momentarily, causing failures.
Screenshots/Logs:
- .planner.log: "Error: listen EADDRINUSE: address already in use :::7020".
- .mca.log: "Error: listen EADDRINUSE: address already in use :::7010".
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Capture server instance and add SIGTERM/SIGINT handlers to close(); consider debounce on restarts or use `--rs` options; add a pre-start kill hook in dev scripts to free ports.

---

Bug ID: 5
Timestamp: 2025-10-29T21:38:10Z
Bug Description: Runner test "runs tests and uploads artifacts" fails with HTTP 500 due to API shape mismatch between test `FakeSandbox` and RunnerAgent's expected E2B SDK API.
Location: 
- packages/runner/src/__tests__/server.test.ts:20-39 (FakeSandbox uses `filesystem`/`process.start().wait()`)
- packages/runner/src/agent.ts:61-88, 112-163 (expects `sandbox.files.*` and `sandbox.commands.run()`)
Severity: Major (Breaks unit tests / CI gate)
Priority: P1
Reproduction Steps:
1) Run `npm test` from repo root.
2) Observe failure in `packages/runner/src/__tests__/server.test.ts > runner server > runs tests and uploads artifacts`.
Expected Behavior: Endpoint returns 200 with `{ ok: true }` and artifacts are written.
Actual Behavior: Endpoint returns 500 with `{ ok: false }`.
Screenshots/Logs:
- Vitest: `AssertionError: expected 500 to be 200` at server.test.ts:58.
- Code inspection shows mock provides `filesystem/process` while implementation uses `files/commands` (E2B 2.x).
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Update test mock to match E2B 2.x API (provide `files` and `commands.run`) or add compatibility in RunnerAgent to support both shapes. Example mock change:
```ts
class FakeSandbox {
  files = {
    makeDir: async () => true,
    write: async () => {},
    read: async (p: string) => p.endsWith('coverage-summary.json') ? JSON.stringify({ total: { lines: { pct: 100 } } }) : Promise.reject(new Error('nf'))
  };
  commands = { run: async () => ({ exitCode: 0, stdout: JSON.stringify({ numTotalTests: 1, numPassedTests: 1, duration: 10, testResults: [{ name: 'ok', status: 'pass', duration: 10 }] }), stderr: '' }) };
}
```

---

Bug ID: 6
Timestamp: 2025-10-29T21:38:10Z
Bug Description: ESLint warns that `.eslintignore` is no longer supported under ESLint v9; recommends using `ignores` in the flat config.
Location: Root config (`.eslintignore`, `eslint.config.cjs`)
Severity: Trivial (deprecation warning; not a gate failure itself)
Priority: P4
Reproduction Steps:
1) Run `npm run lint`.
2) Observe `ESLintIgnoreWarning: The ".eslintignore" file is no longer supported...`
Expected Behavior: No deprecation warnings; ignores configured in flat config.
Actual Behavior: Lint emits deprecation warning every run.
Screenshots/Logs:
- `(node) ESLintIgnoreWarning: The ".eslintignore" file is no longer supported. Switch to using the "ignores" property in "eslint.config.js"`
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Move ignore patterns into `ignores` array in `eslint.config.cjs` and delete `.eslintignore`.

---

Bug ID: 7
Timestamp: 2025-10-29T22:05:00Z
Bug Description: Validator uses an older E2B sandbox API shape (`filesystem` + `process.start().wait()`), while Runner and the E2B 2.x SDK use `files` and `commands.run()`. This mismatch will cause runtime failures when Validator tries to use the real SDK.
Location:
- packages/validator/src/server.ts:28-40, 147-190, 200-208 (uses `filesystem` and `process.start`)
- packages/runner/src/agent.ts:21-33, 150-167 (expects `files` and `commands.run`)
Severity: Major (Validator step may fail at runtime, causing pipeline FAIL or fallback-only behavior)
Priority: P1
Reproduction Steps:
1) Set E2B_API_KEY and run the full pipeline to Validator.
2) Observe runtime errors when Validator attempts to call `sandbox.filesystem` or `process.start` under SDK v2.
Expected Behavior: Both Runner and Validator use the same SDK surface (`files`/`commands`).
Actual Behavior: Divergent assumptions lead to method-not-found/runtime errors.
Suggested Fix: Update Validator to the v2 shape: replace `filesystem` with `files`, and use `commands.run(cmd, { args, cwd, env })` instead of `process.start().wait()`; optionally add a compatibility layer to support both.

---

Bug ID: 8
Timestamp: 2025-10-29T22:05:00Z
Bug Description: Inter-service HTTP calls lack timeouts and robust error handling, risking hung requests and stuck pipeline stages when a service is slow/unavailable.
Location:
- packages/gateway/src/server.ts:22-27 (fire-and-forget `fetch` to MCA with no timeout)
- packages/mca/src/server.ts:55-66 (planner), 71-90 (implementer), 92-114 (runner), 116-131 (validator)
Severity: Major (Can stall pipeline and degrade UX/observability)
Priority: P1
Reproduction Steps:
1) Stop planner (or any downstream service) and POST to gateway `/api/executions`.
2) Observe MCA awaiting downstream responses indefinitely under network stalls.
Expected Behavior: All internal `fetch` calls should have short, configurable timeouts and circuit-breaking behavior.
Actual Behavior: No timeouts; partial try/catch only in runner path; others throw/propagate.
Suggested Fix: Use `AbortController` with a 5–10s timeout, wrap fetches with retries/backoff where safe, and publish structured error events.

---

Bug ID: 9
Timestamp: 2025-10-29T22:05:00Z
Bug Description: Services lack graceful shutdown hooks to close HTTP servers, Redis clients, and database pools, contributing to EADDRINUSE on restarts and resource leaks in dev/CI.
Location:
- All services (`packages/*/src/server.ts`) do not register SIGINT/SIGTERM handlers; shared `db.ts` and `events.ts` expose long-lived connections without `.end()`/`.quit()` on shutdown.
Severity: Minor (DX instability; can cause flaky tests and port conflicts)
Priority: P3
Reproduction Steps:
1) Start services with auto-reload.
2) Trigger rapid restarts; observe lingering ports and open connections.
Expected Behavior: On SIGINT/SIGTERM, servers close and clients disconnect cleanly.
Actual Behavior: No shutdown handlers.
Suggested Fix: Add a small shared util to register process signal handlers to close server.listen(), `pool.end()`, and `redisPub/redisSub.quit()`; invoke in each service.

---

Bug ID: 10
Timestamp: 2025-10-29T22:05:00Z
Bug Description: Gateway SSE stream subscribes to Redis without error handling for subscribe failures; if Redis is down, the route may send headers and then hang the connection.
Location: packages/gateway/src/server.ts:36-60 (SSE stream handler) and shared/events.ts:19-32 (subscribe implementation)
Severity: Minor (Hangs client connections; poor UX/observability)
Priority: P3
Reproduction Steps:
1) Stop Redis.
2) Connect to `/api/executions/:id/stream`.
3) Observe headers sent but no events and no error sent to client.
Expected Behavior: On subscribe failure, send an SSE `event: error` and close the stream.
Actual Behavior: No error propagation; connection lingers.
Suggested Fix: Wrap `subscribe` in try/catch and send an `error` SSE before ending; in `shared/events.subscribe`, attach `'error'` listeners and propagate up; return an async `unsub` that awaits `unsubscribe` and catches errors.

---

Bug ID: 11
Timestamp: 2025-10-29T22:30:00Z
Bug Description: Authentication and CORS are missing across services, allowing unauthenticated pipeline triggers and potential data exposure via SSE/status endpoints.
Location:
- packages/gateway/src/server.ts (POST `/api/executions`, GET `/api/executions/:id/stream`)
- packages/mca/src/server.ts (POST `/start`, other internal fan-out routes)
- packages/planner/src/server.ts, packages/implementer/src/server.ts, packages/runner/src/server.ts, packages/validator/src/server.ts (public HTTP without auth)
Severity: Major (Public abuse risk; data exposure)
Priority: P1
Reproduction Steps:
1) Start services locally or expose via tunnel.
2) `curl -X POST http://localhost:7000/api/executions -H 'Content-Type: application/json' -d '{"intent":"hello"}'` (no auth header).
3) Observe 202/200 accepted and pipeline starts; `curl http://localhost:7000/api/executions/ANY/stream` returns an SSE stream without auth.
Expected Behavior: Public endpoints require API key/JWT; internal service-to-service calls use mTLS or signed tokens; CORS limited to an allowlist.
Actual Behavior: No authentication or CORS policy; requests are accepted from any origin and without credentials.
Screenshots/Logs: Gateway logs show accepted request without auth headers.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Add API key/JWT checks on Gateway; enforce CORS allowlist and request size limits; require HMAC/mTLS or signed internal token for MCA↔services; return 401/403 on missing/invalid credentials.

---

Bug ID: 12
Timestamp: 2025-10-29T22:30:00Z
Bug Description: Gateway lacks input hardening and rate limiting; accepts large payloads with minimal validation and no abuse protection.
Location: packages/gateway/src/server.ts (POST `/api/executions`, SSE route)
Severity: Major (Abuse and resource exhaustion risk)
Priority: P2
Reproduction Steps:
1) POST a very large `intent` (e.g., 5MB) to `/api/executions`.
2) POST invalid body shapes (missing fields, wrong types) and observe acceptance or late failures downstream.
3) Make rapid repeated requests (10–50 rps) and observe no throttling.
Expected Behavior: JSON body size limited (e.g., 128kb), schema validation via Zod with clear 400 errors, per-IP rate limiting, and `execId` format validation on SSE/GET routes.
Actual Behavior: Default `express.json()` (no `limit`), minimal manual checks, no rate limiting.
Screenshots/Logs: Server accepts large JSON and proceeds; no 429s emitted under burst.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Use `express.json({ limit: '128kb' })`, add Zod schema for request body, validate `execId` (UUID/ksuid), implement rate limiting, and return structured 400/429 errors.

---

Bug ID: 13
Timestamp: 2025-10-29T22:30:00Z
Bug Description: OpenAI calls lack AbortController timeouts, retries with backoff, and capped token usage, risking hung requests and cost spikes.
Location:
- packages/planner/src/server.ts (initial task decomposition)
- packages/implementer/src/agent.ts (generation loops)
- packages/validator/src/server.ts (judge/summary prompts)
Severity: Major (Reliability and cost risk)
Priority: P1
Reproduction Steps:
1) Disable internet or block OpenAI host (simulate network stall).
2) Trigger planner/implementer/validator flows.
3) Observe requests hanging until Node socket timeout; no bounded retry or quick failure.
Expected Behavior: ~15–30s timeout per call, 1–2 retries with jitter for transient errors, and explicit `max_tokens`.
Actual Behavior: No timeout wrapper; best-effort error handling varies; potential long hangs.
Screenshots/Logs: Requests remain pending; downstream stages wait indefinitely.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Wrap OpenAI calls with AbortController; implement capped retries/backoff; set `max_tokens` and content filters; emit structured error events and surface degraded status to downstream.

---

Bug ID: 14
Timestamp: 2025-10-29T22:30:00Z
Bug Description: Implementer tools and VFS sanitization allow path traversal within an execution scope, enabling writes outside `code/`.
Location:
- packages/implementer/src/tools.ts (write/read helpers lack path guards)
- packages/vfs/src/minio.ts (`sanitize()` does not reject `..` segments)
Severity: Medium (Integrity/isolation risk)
Priority: P2
Reproduction Steps:
1) Invoke a write tool with a path like `../validator/cheat.txt` or `/../../outside.txt` under a given `execId`.
2) Observe object keys created outside the intended `code/` prefix in MinIO.
Expected Behavior: All Implementer writes constrained to `code/` subpaths; any `..` or absolute traversal rejected with 400.
Actual Behavior: Paths are normalized but `..` not strictly rejected; tools accept arbitrary paths beneath the exec prefix.
Screenshots/Logs: MinIO shows objects at `<execId>/validator/cheat.txt` rather than `<execId>/code/...`.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: In tools, force `safe = path.posix.normalize(p)`; reject if `safe.includes('..')` or `!safe.startsWith('code/')`; in VFS `sanitize()`, strip and reject traversal; add tests.

---

Bug ID: 15
Timestamp: 2025-10-29T22:30:00Z
Bug Description: Artifact checksum handling is inconsistent; many writes omit sha256 and no verification occurs on read, risking undetected corruption.
Location:
- packages/runner/src/agent.ts (artifact writes without sha)
- packages/implementer/src/tools.ts (no sha on generated artifacts)
- packages/validator/src/server.ts (writes sha but does not verify on reads)
- packages/vfs/src/minio.ts (stores provided sha in metadata; lacks verify-on-read)
Severity: Medium (Integrity risk)
Priority: P2
Reproduction Steps:
1) Upload an artifact, then manually modify it in MinIO.
2) Downstream reads succeed without detecting mismatch; pipeline proceeds.
Expected Behavior: Writers compute and store sha256; readers recompute and compare to stored metadata; mismatch triggers error and event.
Actual Behavior: Writers often omit sha; readers do not verify.
Screenshots/Logs: No checksum comparison messages; corrupted artifacts pass through.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Add `readFileVerified` in VFS to compute+compare sha; update Runner/Implementer to compute sha on writes; Validator to verify critical reads (junit, coverage, final artifacts).

---

Bug ID: 16
Timestamp: 2025-10-29T22:30:00Z
Bug Description: Gateway SSE stream does not validate execution existence and still accepts connections when the execution is unknown, compounding subscribe-failure behavior.
Location: packages/gateway/src/server.ts (SSE handler) and packages/shared/src/events.ts (subscribe)
Severity: Minor (UX and observability degradation)
Priority: P3
Reproduction Steps:
1) Connect to `/api/executions/does-not-exist/stream`.
2) Observe headers sent; with Redis down, the connection hangs; with Redis up, no events are ever sent.
Expected Behavior: Validate `execId` format and existence before sending SSE headers; on failure, send `event: error` with reason and close.
Actual Behavior: No pre-check; clients receive open connections with no data.
Screenshots/Logs: Access logs show 200/headers sent for unknown IDs.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Check execution registry/storage before SSE; handle subscribe errors explicitly (see Bug 10); return 404 or SSE error then end.

---

Bug ID: 17
Timestamp: 2025-10-29T22:30:00Z
Bug Description: MCA internal `/start` endpoint is unauthenticated, allowing arbitrary pipeline execution by external callers if the port is reachable.
Location: packages/mca/src/server.ts (POST `/start`)
Severity: Major (Abuse risk; unintended cost/traffic)
Priority: P1
Reproduction Steps:
1) `curl -X POST http://localhost:7010/start -H 'Content-Type: application/json' -d '{"execId":"x","intent":"test"}'`.
2) Observe MCA begins fan-out to Planner/Implementer/Runner/Validator with no auth.
Expected Behavior: Endpoint should require an internal token or mTLS; unauthenticated calls return 401/403; request body validated.
Actual Behavior: Request is accepted and triggers pipeline execution.
Screenshots/Logs: MCA logs show fan-out sequence starting from unauthenticated request.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Require signed internal token or mTLS for `/start`; validate body via Zod; restrict network exposure (bind to 127.0.0.1 in dev) and apply rate limits.

---

Bug ID: 18
Timestamp: 2025-10-29T22:45:00Z
Bug Description: Web UI GET `/api/file` permits path traversal in evidence mode, allowing reads outside the intended evidence directory.
Location: apps/web/app/api/file/route.ts:47-55
Severity: Critical (Arbitrary file read)
Priority: P1
Reproduction Steps:
1) Set `UI_BACKEND_MODE=evidence` and start the web app.
2) Request `/api/file?sessionId=x&path=../../../../etc/hosts`.
3) Observe contents of system files or repo files outside `.automation/evidence`.
Expected Behavior: Only files under the evidence root are readable; traversal attempts are rejected with 400.
Actual Behavior: `path.resolve(evRoot, filePath)` accepts `..` segments without verifying the final path remains within `evRoot`.
Screenshots/Logs: Code at route.ts lines 50-55 resolves and reads without bounding checks.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: After resolving, verify `full.startsWith(dir + path.sep)` (or POSIX variant); reject any `..` in input; consider a whitelist of file extensions.

---

Bug ID: 19
Timestamp: 2025-10-29T22:45:00Z
Bug Description: Web UI POST `/api/artifacts` zips attacker-controlled paths without bounding to the evidence directory, enabling exfiltration of arbitrary files.
Location: apps/web/app/api/artifacts/route.ts:24-37
Severity: Critical (Arbitrary file read + bulk exfiltration)
Priority: P1
Reproduction Steps:
1) Set `UI_BACKEND_MODE=evidence` and start the web app.
2) POST `{ "paths": [ "../../../../etc/hosts" ] }` to `/api/artifacts`.
3) Downloaded zip includes files outside evidence root.
Expected Behavior: Only paths strictly under evidence root are allowed; traversal rejected with 400; optionally allow only known evidence filenames.
Actual Behavior: `path.resolve(evRoot, p)` is used without verifying containment; files are read into the zip silently.
Screenshots/Logs: route.ts lines 31-37 read resolved paths and add to zip.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Enforce `resolved.startsWith(dir + path.sep)`; strip or reject `..`; validate `paths` array with a schema; add tests for traversal.

---

Bug ID: 20
Timestamp: 2025-10-29T22:45:00Z
Bug Description: Web UI streaming proxy uses non-null assertions on `upstream.body!` and `value!`, risking runtime crashes on disconnects.
Location: apps/web/app/api/stream/route.ts:17-23
Severity: Major (Stability risk)
Priority: P2
Reproduction Steps:
1) Start web app with `UI_BACKEND_MODE=live` and point to a gateway that drops the SSE connection quickly.
2) Request `/api/stream?sessionId=x`.
3) Observe potential crash or unhandled exception due to `upstream.body` being null.
Expected Behavior: Robust null checks and error handling wrap the stream; on disconnect, stream closes gracefully.
Actual Behavior: Code asserts non-null on `upstream.body` and `value` and catches only the outer task.
Screenshots/Logs: Lines 17 (`upstream.body!.getReader()`) and 21 (`controller.enqueue(value!)`).
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Guard `if (!upstream.body) return new Response('', { status: 502 })`; check `if (value) enqueue`; add timeout and retry/backoff.

---

Bug ID: 21
Timestamp: 2025-10-29T22:45:00Z
Bug Description: Implementer swallows errors when reading validator artifacts and during degraded handoff, reducing diagnostics for operators.
Location: packages/implementer/src/server.ts:37-46, 63-71
Severity: Major (Observability risk)
Priority: P2
Reproduction Steps:
1) Trigger implementer with missing or malformed validator artifacts.
2) Observe empty `catch {}` blocks hide the underlying error context.
Expected Behavior: Errors are logged with sanitized context and surfaced as structured events.
Actual Behavior: Errors are caught and ignored, resulting in reduced visibility; degraded handoff may proceed without context.
Screenshots/Logs: `catch {}` blocks at the cited lines.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Replace empty catches with `logger.warn` and include minimal context; attach error details in an `event: error` SSE and result body.

---

Bug ID: 22
Timestamp: 2025-10-29T22:45:00Z
Bug Description: Pervasive unsafe casts (`as unknown as ...` / `any`) weaken type guarantees across MCA, Runner, Validator, and shared utilities.
Location: See audit refs (e.g., packages/mca/src/server.ts:31-38,186-188,253; packages/runner/src/agent.ts:42,57; packages/validator/src/server.ts:136,245-248; shared/langfuse.ts:18).
Severity: Major (Type safety degradation)
Priority: P2
Reproduction Steps:
1) Run static analysis (see docs/bug_audit/v1/findings.jsonl entries for unsafe-cast).
2) Inspect runtime paths where casts bypass validation.
Expected Behavior: Use refined generics, schema parsing, and narrow types; avoid unsafe casts in production code.
Actual Behavior: Multiple locations rely on `as unknown as` to coerce types.
Screenshots/Logs: findings.jsonl and AUDIT_FINDINGS.csv entries.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Replace casts with proper interfaces and parsing (zod/PlanSchema), adjust SDK wrapper types, and add tests.

---

Bug ID: 23
Timestamp: 2025-10-29T22:45:00Z
Bug Description: `skipLibCheck` is enabled globally, masking library type mismatches across services.
Location: tsconfig.base.json:9
Severity: Minor (Masks type issues)
Priority: P3
Reproduction Steps:
1) Review tsconfig; observe `"skipLibCheck": true`.
2) Introduce a mismatched library type in a dependency; typecheck passes unexpectedly.
Expected Behavior: Type mismatches are surfaced during `npm run typecheck`.
Actual Behavior: Mismatches in `node_modules` are skipped.
Screenshots/Logs: tsconfig.base.json line 9.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Disable skipLibCheck and address surfaced errors; or scope it narrowly where required.

---

Bug ID: 24
Timestamp: 2025-10-29T22:45:00Z
Bug Description: Workspace bootstrap/install incomplete leads to lint and typecheck failures (missing parsers/types) across the monorepo.
Location: docs/bug_audit/v1/eslint_results.txt, docs/bug_audit/v1/typecheck_results.txt, docs/bug_audit/v1/npm_ls.txt
Severity: Major (Gates fail due to environment)
Priority: P1
Reproduction Steps:
1) Run `npm run lint` and observe `Cannot find module '@typescript-eslint/parser'`.
2) Run `npm run typecheck` and observe TS2688 for `node` and `vitest`.
3) Run `npm ls` and observe UNMET DEPENDENCY entries for workspaces.
Expected Behavior: Workspace install resolves all dev deps; lint and typecheck run successfully.
Actual Behavior: Missing node_modules in the environment prevents gates from running.
Screenshots/Logs: Referenced audit files show errors.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Run `npm install` at repo root (workspaces); ensure correct npm version per `packageManager`; verify `apps/web` also installed; commit updated lockfile.

---

Bug ID: 25
Timestamp: 2025-10-29T22:45:00Z
Bug Description: Web UI depends on Next.js 14.2.5 which has reported critical advisories in audit output; upgrade recommended.
Location: apps/web/package.json ("next": "14.2.5")
Severity: Major (Security advisory)
Priority: P1
Reproduction Steps:
1) Inspect `apps/web/package.json`.
2) Run `npm audit` to confirm advisories for this version.
Expected Behavior: UI depends on a patched Next.js release (latest 14.x or 15.x) with advisories addressed.
Actual Behavior: Version pinned to 14.2.5 which has reported advisories per audit.
Screenshots/Logs: `AUDIT_REPORT.md` critical advisories section.
Environment: macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
Suggested Fix: Bump Next.js to latest patched version, re-run e2e, and address any breaking changes; consider `npm audit fix` where safe.


---

# AUDIT CROSS-REFERENCE VALIDATION
**Validation Date:** 2025-01-29
**Audit Source:** docs/bug_audit/v1/
**Validator:** Amazon Q Code Review Analysis
**Method:** Cross-reference audit findings against existing bug.md entries, verify reproduction steps, and validate against current codebase state

---

## VALIDATED FINDINGS (Confirmed Bugs)

### V-1: Workspace Bootstrap Complete (Bug 24 - RESOLVED)
**Audit Reference:** AUDIT_FINDINGS.csv, npm_ls.txt, AUDIT_REPORT.md
**Original Severity:** CRITICAL
**Current Status:** ✅ RESOLVED
**Validation Evidence:**
- Ran `npm ls --depth=0` on 2025-01-29
- Result: All workspace packages now properly linked (@autonomous/gateway, @autonomous/implementer, @autonomous/mca, etc.)
- No UNMET DEPENDENCY errors present
**Conclusion:** Bug 24 reported workspace installation issues that have been resolved. Dependencies are now properly installed.
**Recommendation:** CLOSE Bug 24 as resolved; update status to FIXED.

---

### V-2: ESLint Violations Confirmed (Bug 3 - VALIDATED)
**Audit Reference:** eslint_results.txt, AUDIT_FINDINGS.csv
**Original Severity:** Minor
**Current Status:** ✅ VALIDATED
**Validation Evidence:**
- Ran `npm run lint` on 2025-01-29
- Confirmed 3 errors:
  1. packages/runner/src/compat.ts:23:40 - Unexpected any (@typescript-eslint/no-explicit-any)
  2. packages/runner/src/server.ts:12:5 - Unexpected console statement (no-console)
  3. packages/runner/src/server.ts:17:5 - Unexpected console statement (no-console)
**Reproduction:** Successful
**Conclusion:** Bug 3 is accurate and reproducible. Lint gate fails with 3 errors.
**Recommendation:** KEEP Bug 3; priority P2 (blocks compliance gates).

---

### V-3: TypeScript Playwright Import Error (Bug 2 - VALIDATED)
**Audit Reference:** typecheck_results.txt, AUDIT_FINDINGS.csv
**Original Severity:** Major
**Current Status:** ✅ VALIDATED
**Validation Evidence:**
- Ran `npm run typecheck` on 2025-01-29
- Confirmed error: `scripts/dev-orchestrator.ts(153,39): error TS2307: Cannot find module 'playwright'`
**Reproduction:** Successful
**Conclusion:** Bug 2 is accurate. Typecheck fails due to missing playwright module.
**Recommendation:** KEEP Bug 2; priority P1 (blocks CI typecheck gate).

---

### V-4: ESLint Deprecation Warning (Bug 6 - VALIDATED)
**Audit Reference:** eslint_results.txt
**Original Severity:** Trivial
**Current Status:** ✅ VALIDATED
**Validation Evidence:**
- Ran `npm run lint` on 2025-01-29
- Confirmed warning: `ESLintIgnoreWarning: The ".eslintignore" file is no longer supported. Switch to using the "ignores" property in "eslint.config.js"`
**Reproduction:** Successful
**Conclusion:** Bug 6 is accurate. Deprecation warning appears on every lint run.
**Recommendation:** KEEP Bug 6; priority P4 (cosmetic, non-blocking).

---

### V-5: Critical npm Audit Vulnerabilities (Bug 25 - VALIDATED)
**Audit Reference:** npm_audit.json, AUDIT_REPORT.md
**Original Severity:** Major
**Current Status:** ✅ VALIDATED
**Validation Evidence:**
- Ran `npm audit --json` on 2025-01-29
- Confirmed critical vulnerabilities:
  1. **libxmljs2**: Critical severity (GHSA-78h3-pg4x-j8cv) - Type confusion vulnerability
  2. **next**: Critical severity (GHSA-f82v-jwr5-mffw) - Authorization bypass in middleware
- Next.js version in apps/web/package.json: 14.2.5 (vulnerable)
- npm audit shows 10 vulnerabilities for Next.js (ranging from low to critical)
**Reproduction:** Successful
**Conclusion:** Bug 25 is accurate. Critical security advisories exist for Next.js 14.2.5 and libxmljs2.
**Recommendation:** KEEP Bug 25; UPGRADE priority to P0 (critical security risk).

---

### V-6: Redis Error Handling Missing (Bug 1 - PARTIALLY VALIDATED)
**Audit Reference:** Code inspection of packages/shared/src/events.ts
**Original Severity:** Major
**Current Status:** ⚠️ PARTIALLY VALIDATED
**Validation Evidence:**
- Inspected packages/shared/src/events.ts lines 5-7
- Confirmed: No error event listeners attached to redisPub or redisSub
- Redis is currently running (docker ps shows umca-redis: Up 2 hours)
- Cannot reproduce error logs without stopping Redis
**Code Analysis:**
```typescript
export const redisPub = new Redis(env.REDIS_URL);
export const redisSub = new Redis(env.REDIS_URL);
// No .on('error', ...) handlers
```
**Conclusion:** Bug 1 is structurally valid. Code lacks error handlers, but cannot reproduce runtime symptoms without Redis downtime.
**Recommendation:** KEEP Bug 1; priority P1 (stability risk confirmed by code inspection).

---

### V-7: Runner Test Mock API Mismatch (Bug 5 - VALIDATED)
**Audit Reference:** Code inspection of packages/runner/src/__tests__/server.test.ts
**Original Severity:** Major
**Current Status:** ✅ VALIDATED
**Validation Evidence:**
- Inspected packages/runner/src/__tests__/server.test.ts lines 20-39
- Confirmed: FakeSandbox uses `filesystem` and `process.start().wait()` (E2B v1 API)
- Inspected packages/runner/src/agent.ts lines 61-88
- Confirmed: RunnerAgent expects `sandbox.files.*` and `sandbox.commands.run()` (E2B v2 API)
**API Shape Mismatch:**
- Test mock: `filesystem.makeDir()`, `filesystem.write()`, `filesystem.read()`, `process.start().wait()`
- Production code: `files.makeDir()`, `files.write()`, `files.read()`, `commands.run()`
**Conclusion:** Bug 5 is accurate. Test mock uses incompatible API shape, causing test failures.
**Recommendation:** KEEP Bug 5; priority P1 (breaks test gate).

---

### V-8: Web UI Path Traversal Vulnerability (Bug 18 - VALIDATED)
**Audit Reference:** apps/web/app/api/file/route.ts, AUDIT_FINDINGS.csv
**Original Severity:** Critical
**Current Status:** ✅ VALIDATED
**Validation Evidence:**
- Inspected apps/web/app/api/file/route.ts lines 47-55
- Confirmed: Code uses `path.resolve(process.cwd(), evRoot, filePath)` without containment check
- No validation that resolved path stays within evidence directory
- Attacker can supply `path=../../../../etc/hosts` to read arbitrary files
**Vulnerable Code:**
```typescript
const evRoot = process.env.UI_EVIDENCE_DIR || '../../.automation/evidence';
const full = path.resolve(process.cwd(), evRoot, filePath);
const buf = await fs.readFile(full); // No containment check
```
**Conclusion:** Bug 18 is accurate. Critical path traversal vulnerability exists.
**Recommendation:** KEEP Bug 18; UPGRADE priority to P0 (critical security vulnerability).

---

### V-9: Web UI Artifacts Zip Path Traversal (Bug 19 - VALIDATED)
**Audit Reference:** apps/web/app/api/artifacts/route.ts, AUDIT_FINDINGS.csv
**Original Severity:** Critical
**Current Status:** ✅ VALIDATED
**Validation Evidence:**
- Inspected apps/web/app/api/artifacts/route.ts lines 24-37
- Confirmed: Similar path traversal vulnerability in zip builder
- User-controlled `paths` array resolved without containment validation
**Vulnerable Code:**
```typescript
for (const p of paths) {
  const full = path.resolve(process.cwd(), evRoot, p);
  const buf = await fs.readFile(full); // No containment check
  zip.file(p, buf);
}
```
**Conclusion:** Bug 19 is accurate. Critical path traversal vulnerability exists.
**Recommendation:** KEEP Bug 19; UPGRADE priority to P0 (critical security vulnerability).

---

### V-10: Pervasive Unsafe Type Casts (Bug 22 - VALIDATED)
**Audit Reference:** findings.jsonl (52 instances), AUDIT_FINDINGS.csv
**Original Severity:** Major
**Current Status:** ✅ VALIDATED
**Validation Evidence:**
- Audit identified 52 instances of `as unknown as` / `as any` casts across codebase
- Sample locations confirmed:
  - packages/mca/src/server.ts:31,38,186,188,253
  - packages/runner/src/agent.ts:42,57
  - packages/validator/src/server.ts:136,245-248
  - packages/shared/src/langfuse.ts:18
**Pattern Analysis:** Casts used to bypass TypeScript compiler checks, weakening type safety
**Conclusion:** Bug 22 is accurate. Widespread use of unsafe casts confirmed.
**Recommendation:** KEEP Bug 22; priority P2 (type safety degradation).

---

### V-11: Silent Catch Blocks (Audit Finding - NEW BUG)
**Audit Reference:** findings.jsonl (28 instances), AUDIT_FINDINGS.csv
**Severity:** Major
**Status:** ✅ NEW FINDING
**Validation Evidence:**
- Audit identified 28 instances of empty `catch {}` blocks
- Sample locations:
  - packages/validator/src/server.ts:215,249,301,334
  - apps/web/app/api/stream/route.ts:49,53
  - apps/web/app/api/artifacts/route.ts:20,37
  - packages/shared/src/events.ts:24
  - packages/shared/src/env.ts:14,66
**Impact:** Errors suppressed without logging, hiding root causes and degrading observability
**Conclusion:** Valid new finding not in original bug.md.
**Recommendation:** ADD as Bug 26; priority P2 (observability risk).

---

### V-12: Unsafe Array Indexing (Audit Finding - NEW BUG)
**Audit Reference:** findings.jsonl (20 instances), AUDIT_FINDINGS.csv
**Severity:** Major
**Status:** ✅ NEW FINDING
**Validation Evidence:**
- Audit identified 20 instances of direct array indexing without length checks
- Sample locations:
  - packages/implementer/src/agent.ts:108 (`response.choices[0]`)
  - packages/planner/src/server.ts:76 (`llmResponse.choices[0]`)
  - packages/validator/src/server.ts:242 (`response.choices?.[0]`)
  - packages/shared/src/db.ts:22 (`rows[0]`)
**Impact:** Potential runtime crashes if arrays are empty
**Conclusion:** Valid new finding not in original bug.md.
**Recommendation:** ADD as Bug 27; priority P2 (stability risk).

---

## DEBUNKED FINDINGS (Invalid or Outdated)

### D-1: Missing Type Definitions (Audit CRITICAL - DEBUNKED)
**Audit Reference:** typecheck_results.txt, AUDIT_FINDINGS.csv
**Audit Claim:** "TS2688: Cannot find type definition file for 'node'/'vitest' because @types packages are missing"
**Severity Claimed:** CRITICAL
**Status:** ❌ DEBUNKED (Partially)
**Validation Evidence:**
- Ran `npm ls @types/node @types/vitest` on 2025-01-29
- Result: Both packages are installed in workspace
- However, typecheck still fails due to Bug 2 (playwright import), not missing @types
**Conclusion:** Audit finding is outdated. @types packages are now installed. Typecheck failure is due to different issue (Bug 2).
**Recommendation:** REJECT this audit finding; root cause is Bug 2, not missing @types.

---

### D-2: Web UI Missing Dependencies (Audit CRITICAL - DEBUNKED)
**Audit Reference:** AUDIT_FINDINGS.csv (apps/web missing react/next/monaco types)
**Audit Claim:** "TS2307/TS7026: React not installed so JSX elements resolve to any"
**Severity Claimed:** CRITICAL
**Status:** ❌ DEBUNKED
**Validation Evidence:**
- Ran `npm ls --prefix apps/web` on 2025-01-29
- Result: next@14.2.5, react@18.3.1, react-dom@18.3.1, @monaco-editor/react@4.6.0 all installed
- Web UI dependencies are present
**Conclusion:** Audit finding is outdated. Web UI dependencies are now installed.
**Recommendation:** REJECT this audit finding; dependencies are present.

---

### D-3: ESLint Parser Missing (Audit CRITICAL - DEBUNKED)
**Audit Reference:** eslint_results.txt, AUDIT_FINDINGS.csv
**Audit Claim:** "ESLint fails: Cannot find module '@typescript-eslint/parser'"
**Severity Claimed:** CRITICAL
**Status:** ❌ DEBUNKED
**Validation Evidence:**
- Ran `npm run lint` on 2025-01-29
- Result: ESLint runs successfully, reports 3 code errors (Bug 3)
- No module resolution errors for @typescript-eslint/parser
**Conclusion:** Audit finding is outdated. ESLint parser is now installed and functional.
**Recommendation:** REJECT this audit finding; parser is present and working.

---

## SUMMARY STATISTICS

### Validation Results
- **Total Audit Findings:** 120+ (from AUDIT_FINDINGS.csv + findings.jsonl)
- **Validated Bugs:** 12 (confirmed accurate)
- **New Bugs Identified:** 2 (silent catches, unsafe indexing)
- **Debunked Findings:** 3 (outdated/resolved)
- **Existing Bugs Cross-Referenced:** 10 (Bugs 1-6, 18-19, 22, 24-25)

### Severity Distribution (Validated Findings)
- **Critical (P0):** 3 (Bugs 18, 19, 25)
- **Major (P1):** 4 (Bugs 1, 2, 3, 5)
- **Major (P2):** 3 (Bugs 22, 26-new, 27-new)
- **Minor (P3-P4):** 2 (Bugs 6)

### Top Priority Actions
1. **IMMEDIATE (P0):** Fix path traversal vulnerabilities (Bugs 18, 19) and upgrade Next.js/libxmljs2 (Bug 25)
2. **HIGH (P1):** Add Redis error handlers (Bug 1), fix playwright import (Bug 2), resolve lint errors (Bug 3), fix test mock (Bug 5)
3. **MEDIUM (P2):** Address unsafe casts (Bug 22), add error logging to catch blocks (Bug 26-new), add array bounds checks (Bug 27-new)

---

## NEW BUGS TO ADD

### Bug 26: Silent Catch Blocks Suppress Errors
**Timestamp:** 2025-01-29T23:00:00Z
**Bug Description:** 28 instances of empty `catch {}` blocks across codebase suppress errors without logging, hiding root causes and degrading observability.
**Location:** 
- packages/validator/src/server.ts:215,249,301,334
- apps/web/app/api/stream/route.ts:49,53
- apps/web/app/api/artifacts/route.ts:20,37
- packages/shared/src/events.ts:24
- packages/shared/src/env.ts:14,66
- packages/implementer/src/server.ts:46,70
- (18 additional locations in findings.jsonl)
**Severity:** Major (Observability degradation)
**Priority:** P2
**Reproduction Steps:**
1) Review findings.jsonl for all "silent-catch" entries
2) Inspect each location and confirm empty catch blocks
3) Trigger error conditions (e.g., malformed JSON, missing files) and observe no error logs
**Expected Behavior:** Errors should be logged with sanitized context before being caught or rethrown
**Actual Behavior:** Errors are silently swallowed with no diagnostic output
**Environment:** macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
**Suggested Fix:** Replace `catch {}` with `catch (err) { logger.warn({ err: sanitize(err) }, 'context'); }` or rethrow after logging

---

### Bug 27: Unsafe Array Indexing Without Bounds Checks
**Timestamp:** 2025-01-29T23:00:00Z
**Bug Description:** 20 instances of direct array indexing (e.g., `arr[0]`) without length checks may cause runtime crashes if arrays are empty.
**Location:**
- packages/implementer/src/agent.ts:108 (`response.choices[0]`)
- packages/planner/src/server.ts:76 (`llmResponse.choices[0]`)
- packages/validator/src/server.ts:242 (`response.choices?.[0]`)
- packages/shared/src/db.ts:22 (`rows[0]`)
- (16 additional locations in findings.jsonl)
**Severity:** Major (Stability risk)
**Priority:** P2
**Reproduction Steps:**
1) Review findings.jsonl for all "unsafe-index" entries
2) Trigger conditions where OpenAI returns empty choices array or DB query returns no rows
3) Observe potential TypeError: Cannot read property of undefined
**Expected Behavior:** Check array length before indexing or use optional chaining with fallback
**Actual Behavior:** Direct indexing assumes non-empty arrays
**Environment:** macOS (Darwin 24.6.0), Node v22.18.0, npm 11.6.0
**Suggested Fix:** Replace `arr[0]` with `arr[0] ?? defaultValue` or add `if (arr.length === 0) throw new Error('empty')`

---

## AUDIT QUALITY ASSESSMENT

### Strengths
- Comprehensive static analysis covering 44 files
- Identified critical security vulnerabilities (path traversal)
- Systematic categorization by severity and pattern type
- Detailed CSV/JSONL output with line numbers and code snippets

### Weaknesses
- Some findings outdated (workspace installation issues resolved)
- No runtime validation (only static analysis)
- Severity inflation (some CRITICAL findings are actually resolved)
- Duplicate findings across multiple output formats

### Recommendations for Future Audits
1. Include timestamp/git commit hash to track when audit was performed
2. Validate findings against current codebase state before reporting
3. Distinguish between "blocking" (gates fail) vs "advisory" (code smells)
4. Provide automated remediation scripts where possible

---

**Validation Completed:** 2025-01-29T23:30:00Z
**Next Review:** After P0/P1 bugs are resolved
