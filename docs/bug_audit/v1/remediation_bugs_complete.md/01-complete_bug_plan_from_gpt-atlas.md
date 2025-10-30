Awesome—let’s lock this down like we actually own the repo and need it production-ready.

# A) `AGENTS.md` — paste-ready update (roles, context model, limits, gates)

```md
## ROLES & CONTEXT MODEL (LOCKED)

- **Assistant A — Planner/Coordinator (YOU):**
  - Reads repo artifacts (bug.md, AUDIT_REPORT.md, AGENTS.md, plans) and produces *standalone, copy-pasteable* task blocks that an Implementer can execute with **zero prior context**.
  - **Delivers the complete instruction set in one message** covering all known bugs. Blocks are scoped to finish in **45–60 minutes** each. **Execution** (not delivery) is limited to **≤3 blocks per session**.
  - Never assumes long autonomous runs; every block must include reproducible repro, fix, tests, validation, artifacts, rollback.

- **Assistant B — Implementer/Developer:**
  - Executes **one** block at a time.
  - **Context resets** on each new instruction to: the **latest task block** + this `AGENTS.md` file (auto-injected). No other history is guaranteed.
  - Stops at first failing step and records evidence; does **not** “work around” failing gates.

### TIME & SCOPE LIMITS (LOCKED)
- Each block must be scoped to complete in **≤60 min** (target 45–60).
- Max **3 blocks per session**.
- No placeholders, stubs, or fake greens. **Red is red.** (Evidence or it didn't happen.)
- No placeholders or stubs. Tests must assert real behavior with deterministic repro.
- External links are non-binding references; every block must be executable offline.
- Evidence artifacts required for every block:
  `.automation/evidence/$TASK/valid/lint.txt`,
  `typecheck.txt`,
  `tests.json`,
  `coverage.json` (if applicable),
  `summary.md` (root cause + rationale),
  plus any logs specific to the task.
- Global gates apply to every block unless explicitly overridden.

### EVIDENCE & GATES (MUST PASS)
- **G1 Lint:** `npm run lint` → exit 0 (save output under `.automation/evidence/$TASK/valid/lint.txt`)
- **G2 Types:** `npm run typecheck` → exit 0 (`valid/typecheck.txt`)
- **G3 Tests:** `npm test` → exit 0; coverage ≥ 80% lines (`valid/tests.json`, `valid/coverage.json`)
- **G4 Acceptance:** Repro now passes; artifacts updated; short rationale in `summary.md`.

### SECURITY & RELIABILITY (LOCKED PATTERNS)
- **Path traversal**: All file access must normalize and enforce directory containment (reject `..`, require `resolved.startsWith(root + sep)`). (See OWASP guidance.) 
- **Network calls**: Use **AbortController/AbortSignal** timeouts and bounded retries with jitter. 
- **Redis / external clients**: Always attach `'error'` handlers and backoff on reconnect. 
- **ESLint v9 flat config**: Configure `ignores` in flat config; do **not** rely on `.eslintignore`. 
```

*(Refs: OWASP path traversal testing guidance; Node/WHATWG `AbortController` timeout patterns; ioredis error events; ESLint v9 flat-config “ignores”. ([owasp.org][1]))*

---

# B) Full instruction set — copy-pasteable blocks (covering all current bugs)

> Format matches your template. Each block is self-contained and sized for a ~45–60 min implementation window. Pick up to **3** per session.

---

## FIXED 
## FIXED ## BUG 1 — Redis error handling missing


```
# TASK TITLE: Add Redis error handling + graceful backoff

## Objective
- Ensure all Redis clients handle 'error' events, avoid log floods, and recover gracefully.

## Context (Self-Contained)
- **Current date: October 30, 2025**
- Relevant subsystem/files: packages/shared/src/events.ts; any service importing redisPub/redisSub
- Known constraints: Monorepo; services: gateway/mca/planner/implementer/runner/validator
- Reference patterns: Attach 'error' listeners, implement retry/backoff, avoid unhandled promise rejections.

## Steps (Do sequentially, stop on first failure)
1) Reproduce:
   - Command(s): stop Redis; then `npm run dev` for gateway/mca/planner.
   - Expected vs. actual: Expect graceful logs + backoff; actual: noisy EPIPE/ECONNRESET.
2) Fix:
   - Changes: in `shared/src/events.ts`, attach `redisPub.on('error', ...)` and `redisSub.on('error', ...)`; add exponential backoff on reconnect; wrap publish/subscribe in try/catch.
   - Requirements: no silent catch; structured logs.
3) Tests:
   - Add unit tests with a mocked Redis client emitting 'error'; assert handler logs once and continues.
4) Validation:
   - Lint/CI: `npm run lint && npm run typecheck && npm test`
5) Artifacts to Output:
   - Diff summary; test results; rationale.
6) Rollback Plan:
   - `git restore -SW -- packages/shared/src/events.ts`

## Acceptance Criteria
- With Redis down, services do not crash; errors are logged once per backoff window; tests cover handler path.
```

*Why:* ioredis emits `'error'` and should be handled to prevent unhandled errors/floods. ([Stack Overflow][2])

---

## FIXED 
## BUG 2 — Typecheck fails (missing `playwright`)

```
# TASK TITLE: Unblock typecheck by guarding Playwright usage

## Objective
- Make `npm run typecheck` exit 0 without requiring Playwright globally.

## Context (Self-Contained)
- **Current date: October 30, 2025**
- Relevant files: scripts/dev-orchestrator.ts:153; tsconfigs
- Known constraints: Optional tooling must not break typecheck in CI.
- Reference patterns: Dynamic import guards or exclude scripts from ts program.

## Steps
1) Reproduce:
   - `npm run typecheck`
   - Expected vs. actual: Expect exit 0; actual TS2307 cannot find 'playwright'.
2) Fix (choose one):
   - A) Add devDeps: `npm i -D playwright @types/node` and guard dynamic import with runtime try/catch, plus `// @ts-expect-error` where appropriate; OR
   - B) Exclude `scripts/*` from the TS program used by typecheck (e.g., root `tsconfig.base.json` references).
3) Tests:
   - Add a small “no-playwright” CI job or script to ensure typecheck still passes without Playwright installed.
4) Validation:
   - `npm run typecheck && npm run lint && npm test`
5) Artifacts:
   - Diff, logs, rationale.
6) Rollback:
   - Revert tsconfig and script edits.

## Acceptance Criteria
- Typecheck passes without Playwright present; no new lint violations.
```

---

## FIXED 
## BUG 3 — Runner ESLint violations (`any`, `console.log`)

```
# TASK TITLE: Fix Runner lint violations (no-explicit-any, no-console)

## Objective
- Get repo to zero ESLint errors.

## Context
- **Current date: October 30, 2025**
- Files: packages/runner/src/compat.ts:23; packages/runner/src/server.ts:12,17
- Constraints: Use shared logger; replace `any` with concrete/narrowed types.

## Steps
1) Reproduce:
   - `npm run lint`
   - Expect vs actual: expect 0; actual 3 errors.
2) Fix:
   - Replace `any` with specific type or generics; swap `console.log` for shared logger (createLogger()).
3) Tests:
   - No additional tests required beyond lint; still produce evidence artifacts.
4) Validation:
   - `npm run lint` → 0; `npm run typecheck`
5) Artifacts:
   - Diff; lint output.
6) Rollback:
   - Revert changed lines.

## Acceptance Criteria
- ESLint passes 0 errors, 0 warnings (flat-config ignores addressed in BUG 6).
```

---

## FIXED 
## BUG 4 — EADDRINUSE on rapid restarts

```
# TASK TITLE: Add graceful shutdown hooks to release ports

## Objective
- Ensure services free ports on SIGINT/SIGTERM and dev restarts are stable.

## Context
- **Current date: October 30, 2025**
- Files: packages/*/src/server.ts
- Constraints: Reused ports 7010/7020; ts-node-dev restarts.

## Steps
1) Reproduce:
   - Run planner/mca; force rapid restarts; see EADDRINUSE.
2) Fix:
   - Capture server instance from `app.listen`; register `process.on('SIGINT'|'SIGTERM', async () => server.close(...); redis.quit(); db.end(); })`.
3) Tests:
   - Add lightweight integration test that starts server on ephemeral port and closes cleanly.
4) Validation:
   - Manual rapid restart test; `npm test`
5) Artifacts:
   - Diff; short clip/logs.
6) Rollback:
   - Revert server bootstrap edits.

## Acceptance Criteria
- No EADDRINUSE during rapid file changes.
```

---

## FIXED 
## BUG 5 — Runner test fails (E2B API shape mismatch)

```
# TASK TITLE: Align Runner test mock to E2B v2 (files + commands.run)

## Objective
- Make runner unit test pass by updating FakeSandbox to v2 API (files/commands.run).

## Context
- **Current date: October 30, 2025**
- Files: packages/runner/src/tests/server.test.ts (FakeSandbox); packages/runner/src/agent.ts (expects v2)
- Reference: E2B v2 exposes `sandbox.files.*` and `sandbox.commands.run(...)`.

## Steps
1) Reproduce:
   - `npm test -w packages/runner` (or repo root)
   - Actual: HTTP 500; Expected: 200.
2) Fix:
   - Update FakeSandbox to provide `files` and `commands.run()` returning `{ exitCode, stdout, stderr }`.
3) Tests:
   - Keep failing first; then pass after fix; assert 200 + artifact write.
4) Validation:
   - `npm test` all green.
5) Artifacts:
   - Diff; test report JSON.
6) Rollback:
   - Revert FakeSandbox changes.

## Acceptance Criteria
- Runner test passes with v2 mock; no regressions.
```

*Ref: E2B v2 surfaces `commands.run` and `files.*` in examples/docs. ([tecktol.com][3])*

---

## FIXED 
## BUG 6 — ESLint v9: `.eslintignore` deprecation

```
# TASK TITLE: Migrate ignores to flat config and remove .eslintignore

## Objective
- Remove ESLintIgnoreWarning and keep lint green.

## Context
- **Current date: October 30, 2025**
- Files: .eslintignore, eslint.config.cjs (flat config)
- Pattern: Use `ignores: [...]` in flat config; delete `.eslintignore`.

## Steps
1) Reproduce:
   - `npm run lint` → ESLintIgnoreWarning appears.
2) Fix:
   - Move patterns into `ignores` array in `eslint.config.cjs`; delete `.eslintignore`.
3) Tests:
   - Run lint to ensure no warnings/errors and ignores still apply.
4) Validation:
   - `npm run lint` is clean.
5) Artifacts:
   - Diff; lint output.
6) Rollback:
   - Restore `.eslintignore` and config.

## Acceptance Criteria
- No deprecation warning; lint 0/0.
```

*Ref: ESLint v9 flat config uses `ignores`; `.eslintignore` is deprecated in that mode. ([ESLint][4])*

---

## FIXED 
## BUG 7 — Validator uses E2B v1 shape

```
# TASK TITLE: Upgrade Validator to E2B v2 (files + commands.run)

## Objective
- Align Validator code with E2B v2 API.

## Context
- **Current date: October 30, 2025**
- Files: packages/validator/src/server.ts (uses filesystem/process.start().wait())
- Constraint: Must match Runner's v2 usage.

## Steps
1) Reproduce:
   - With real E2B, Validator will error at runtime.
2) Fix:
   - Replace `filesystem` with `files`; replace `process.start().wait()` with `commands.run(cmd, { args, cwd, env })`.
3) Tests:
   - Add unit tests with a FakeSandbox v2 stub.
4) Validation:
   - `npm test` green; integration flow reaches Validator.
5) Artifacts:
   - Diff; tests.
6) Rollback:
   - Revert validator adjustments.

## Acceptance Criteria
- Validator works with v2 mock and (optionally) sandbox in CI.
```

*Ref: E2B v2 examples show `commands.run`. ([tecktol.com][3])*

---

## FIXED 
## BUG 8 — Inter-service calls have no timeouts

```
# TASK TITLE: Add fetch timeouts + retries for all internal HTTP calls

## Objective
- Ensure all internal fetches have AbortSignal timeouts and bounded retries.

## Context
- **Current date: October 30, 2025**
- Files: gateway/src/server.ts; mca/src/server.ts (planner/implementer/runner/validator fan-out)
- Pattern: `AbortSignal.timeout(5000)` or controller+setTimeout; retry 1–2x with jitter.

## Steps
1) Reproduce:
   - Stop planner; trigger pipeline; observe hang.
2) Fix:
   - Introduce `fetchWithTimeout` util using `AbortSignal.timeout(5000)` and limited retries (e.g., 2 with jitter).
   - Use on all internal calls; check `response.ok`.
3) Tests:
   - Unit test with mocked fetch that delays; assert timeout path triggers proper error mapping.
4) Validation:
   - `npm test` + manual run (stop one service).
5) Artifacts:
   - Diff; tests; short rationale.
6) Rollback:
   - Revert util and call sites.

## Acceptance Criteria
- Hung downstream no longer blocks forever; errors surface fast with structured context.
```

*Ref: AbortController/AbortSignal timeout patterns for `fetch`. ([codedrivendevelopment.com][5])*

---

## FIXED 
## BUG 9 — Missing graceful shutdown across services

```
# TASK TITLE: Add shared shutdown util (server/db/redis)

## Objective
- Close HTTP server, Redis clients, and DB pools on SIGINT/SIGTERM.

## Context
- **Current date: October 30, 2025**
- Files: packages/shared/src/shutdown.ts (new); packages/*/src/server.ts inject it.
- Constraint: Reuse in every service.

## Steps
1) Implement:
   - New `registerShutdown({ server, redisClients, db })` util; call from each service.
2) Tests:
   - Start/stop ephemeral server in test; assert close handlers invoked.
3) Validation:
   - `npm test` + manual CTRL-C without orphan ports.
4) Artifacts:
   - Diff; test logs.
5) Rollback:
   - Remove util and imports.

## Acceptance Criteria
- Clean exits; no port leaks.
```

---

## FIXED 
## BUG 10 — SSE subscribes without error handling

```
# TASK TITLE: Harden SSE subscribe failure path

## Objective
- When Redis subscribe fails, send SSE error then close.

## Context
- **Current date: October 30, 2025**
- Files: gateway/src/server.ts (SSE handler); shared/events.ts (subscribe)
- Constraints: No hanging connections.

## Steps
1) Reproduce:
   - Stop Redis; GET /api/executions/:id/stream; connection hangs.
2) Fix:
   - Wrap subscribe in try/catch; on error, `res.write('event: error\\ndata: { "reason": "subscribe_failed" }\\n\\n'); res.end();`
   - In `events.subscribe`, attach `'error'` on sub client and propagate.
3) Tests:
   - Unit test SSE route with mocked subscribe error → response ends with error event.
4) Validation:
   - `npm test`
5) Artifacts:
   - Diff; test results.
6) Rollback:
   - Revert SSE handler changes.

## Acceptance Criteria
- SSE reports error and closes when subscription fails.
```

---

## BUG 11 — Missing auth & CORS across services

```
# TASK TITLE: Add API key/JWT auth + strict CORS

## Objective
- Require auth on public routes; enforce allowlisted origins.

## Context
- **Current date: October 30, 2025**
- Files: gateway/src/server.ts; mca/src/server.ts; other services
- Pattern: API key header (e.g., `x-api-key`) or JWT; `cors` with `origin: [ALLOWLIST]`; reject others.

## Steps
1) Implement:
   - Add auth middleware at gateway public routes; internal calls use signed token/mTLS (dev: token).
   - Add CORS with explicit allowlist; set JSON body size limits.
2) Tests:
   - Unit tests for 401/403 on missing/invalid auth; CORS preflight success/failure.
3) Validation:
   - `npm test`; manual `curl` without key → 401.
4) Artifacts:
   - Diff; tests; rationale.
5) Rollback:
   - Remove middleware.

## Acceptance Criteria
- Unauthed calls are rejected; only allowlisted origins accepted.
```

*Refs: `cors` package for Express; zod for request validation (also used in BUG 12). ([nodejs.org][6])*

---

## BUG 12 — No input hardening / rate limiting

```
# TASK TITLE: Add schema validation + rate limiting + size caps

## Objective
- Prevent abuse and resource exhaustion on gateway endpoints.

## Context
- **Current date: October 30, 2025**
- Files: gateway/src/server.ts; shared/validation.ts (new)
- Patterns: `express.json({ limit: '128kb' })`; `zod` schemas; `express-rate-limit`.

## Steps
1) Implement:
   - Add `express-rate-limit` (e.g., 60 req/min/IP).
   - Add `zod` schemas for request bodies/query; return 400 on parse errors.
   - Limit JSON size.
2) Tests:
   - Unit tests: invalid schema → 400; flood → 429.
3) Validation:
   - `npm test`
4) Artifacts:
   - Diff; tests.
5) Rollback:
   - Remove middleware.

## Acceptance Criteria
- Invalid inputs fail fast; bursts are throttled.
```

*Refs: express-rate-limit; zod. ([nodejs.org][6])*

---

## BUG 13 — OpenAI calls lack timeouts/retries/limits

```
# TASK TITLE: Wrap OpenAI calls with timeouts, retries, and token caps

## Objective
- Prevent hangs and cost spikes; standardize reliability.

## Context
- **Current date: October 30, 2025**
- Files: planner/src/server.ts; implementer/src/agent.ts; validator/src/server.ts; shared/openai.ts (new)
- Pattern: `AbortSignal.timeout(15000)` + 1–2 retries with jitter; set `max_tokens`.

## Steps
1) Implement wrapper in `shared/openai.ts` with timeout + retry/backoff + max_tokens.
2) Replace direct calls with wrapper.
3) Tests:
   - Mock OpenAI call that never resolves; assert timeout path.
4) Validation:
   - `npm test`
5) Artifacts:
   - Diff; tests; rationale.
6) Rollback:
   - Restore direct calls.

## Acceptance Criteria
- Calls fail fast on stall; retries bounded; token use capped.
```

*Refs: AbortSignal timeout for fetch-like calls (pattern applies). ([codedrivendevelopment.com][5])*

---

## BUG 14 — Implementer/VFS path traversal (write/read)

```
# TASK TITLE: Enforce VFS path containment (reject '..', require code/*)

## Objective
- Prevent writing/reading outside allowed prefixes.

## Context
- **Current date: October 30, 2025**
- Files: implementer/src/tools.ts; vfs/src/minio.ts
- Pattern: normalize input; reject if contains `..` or not under `code/`; after `resolve(root, p)`, require `startsWith(root + sep)`.

## Steps
1) Add `sanitizePath(root, rel)` util: normalize, reject traversal, enforce prefix.
2) Use in all write/read tool paths and VFS.
3) Tests:
   - Attempt `../../etc/hosts` → reject 400; valid `code/main.ts` → ok.
4) Validation:
   - `npm test`
5) Artifacts:
   - Diff; tests.
6) Rollback:
   - Remove sanitizer usage.

## Acceptance Criteria
- Traversal attempts rejected; happy path unaffected.
```

*Ref: OWASP path traversal prevention guidance. ([owasp.org][1])*

---

## BUG 15 — Artifact checksums inconsistent

```
# TASK TITLE: Add sha256 on write + verify on read

## Objective
- Detect corruption/alteration of artifacts end-to-end.

## Context
- **Current date: October 30, 2025**
- Files: runner/src/agent.ts; implementer/src/tools.ts; validator/src/server.ts; vfs/src/minio.ts
- Pattern: compute sha256 on write; store as metadata; verify on read.

## Steps
1) Add `computeSha256(buf)` util; on writes, compute + persist metadata.
2) Add `readFileVerified(path)` that recomputes and compares metadata → throw on mismatch.
3) Tests:
   - Write artifact; tamper in mock; verify read throws.
4) Validation:
   - `npm test`
5) Artifacts:
   - Diff; tests.
6) Rollback:
   - Disable verify and revert writes.

## Acceptance Criteria
- Mismatch detection works; pipeline surfaces integrity errors.
```

---

## BUG 16 — SSE accepts unknown execId and hangs

```
# TASK TITLE: Validate execution existence before opening SSE

## Objective
- Reject unknown/invalid execIds early; don't hang connections.

## Context
- **Current date: October 30, 2025**
- Files: gateway/src/server.ts (SSE); shared/execRegistry.ts (new)
- Pattern: Verify format (UUID/KSUID) + existence.

## Steps
1) Implement registry lookup and format check.
2) On failure: `event: error` with reason; close connection or return 404.
3) Tests:
   - Unknown id → 404 or error event then end.
4) Validation:
   - `npm test`
5) Artifacts:
   - Diff; tests.
6) Rollback:
   - Remove checks.

## Acceptance Criteria
- Unknown ids don’t hang; clients get explicit error.
```

---

## BUG 17 — MCA `/start` unauthenticated

```
# TASK TITLE: Protect MCA /start (internal token + bind dev to 127.0.0.1)

## Objective
- Prevent arbitrary pipeline execution by unauth callers.

## Context
- **Current date: October 30, 2025**
- Files: mca/src/server.ts; shared/auth.ts (new)
- Pattern: Require `x-internal-auth` HMAC or signed token on /start; dev: bind to localhost only.

## Steps
1) Implement header check + signature verification; reject 401/403 on failure.
2) Bind dev server to `127.0.0.1`.
3) Tests:
   - Missing/invalid header → 401/403; valid header → 200.
4) Validation:
   - `npm test`
5) Artifacts:
   - Diff; tests.
6) Rollback:
   - Revert middleware.

## Acceptance Criteria
- Unauthed start attempts are blocked.
```

---

## BUG 18 — Web `/api/file` path traversal (CRITICAL)

```
# TASK TITLE: Fix path traversal in /api/file (evidence mode)

## Objective
- Prevent arbitrary reads outside evidence directory.

## Context
- **Current date: October 30, 2025**
- Files: apps/web/app/api/file/route.ts
- Pattern: `const full = resolve(root, userPath)` then enforce `full.startsWith(root + sep)`; reject on `..`.

## Steps
1) Reproduce:
   - Start UI (evidence mode); GET `/api/file?path=../../../../etc/hosts` → currently reads.
2) Fix:
   - Add strict containment check; reject traversal with 400.
3) Tests:
   - Route unit tests: traversal → 400; valid evidence file → 200.
4) Validation:
   - `npm test -w apps/web`
5) Artifacts:
   - Diff; tests; rationale.
6) Rollback:
   - Revert route guard.

## Acceptance Criteria
- Traversal attempts blocked; no regressions for valid reads.
```

*Ref: OWASP path traversal prevention. ([owasp.org][1])*

---

## BUG 19 — Web `/api/artifacts` zip traversal (CRITICAL)

```
# TASK TITLE: Bound artifact zipping to evidence root

## Objective
- Disallow zipping files outside evidence root.

## Context
- **Current date: October 30, 2025**
- Files: apps/web/app/api/artifacts/route.ts
- Pattern: For each input path: `full = resolve(root, p)`; enforce `startsWith(root + sep)`; reject `..`.

## Steps
1) Reproduce:
   - POST `paths: ["../../../../etc/hosts"]` → currently included in zip.
2) Fix:
   - Add containment check; drop/reject offenders with 400.
3) Tests:
   - Traversal request → 400; valid list → zip contents OK.
4) Validation:
   - `npm test -w apps/web`
5) Artifacts:
   - Diff; tests.
6) Rollback:
   - Revert guard.

## Acceptance Criteria
- Cannot exfiltrate files outside evidence root.
```

*Ref: OWASP path traversal prevention. ([owasp.org][1])*

---

## BUG 20 — Web streaming proxy uses non-null assertions

```
# TASK TITLE: Guard streaming proxy against null bodies

## Objective
- Avoid crashes on upstream disconnects (no `!` assertions).

## Context
- **Current date: October 30, 2025**
- Files: apps/web/app/api/stream/route.ts
- Pattern: Check `if (!upstream.body) return 502`; guard `value` existence before enqueue.

## Steps
1) Fix:
   - Replace `body!` and `value!` with null checks and early returns.
2) Tests:
   - Mock upstream with null body; expect 502; normal stream → OK.
3) Validation:
   - `npm test -w apps/web`
4) Artifacts:
   - Diff; tests.

## Acceptance Criteria
- No runtime crash when upstream ends early.
```

---

## BUG 21 — Implementer swallows errors (empty catches)

```
# TASK TITLE: Replace empty catches with structured warnings

## Objective
- Improve observability by logging sanitized error context.

## Context
- **Current date: October 30, 2025**
- Files: implementer/src/server.ts (noted ranges); others with `{}` catches
- Pattern: `catch (err) { logger.warn({ err: sanitize(err), context }, 'readable message') }`

## Steps
1) Replace empty catches across cited locations.
2) Tests:
   - Simulate failure path; assert logger called with minimal context.
3) Validation:
   - `npm test`
4) Artifacts:
   - Diff; test logs.

## Acceptance Criteria
- No empty catches; warnings emitted; no sensitive data logged.
```

---

## BUG 22 — Unsafe casts `as unknown as` / `as any`

```
# TASK TITLE: Remove unsafe casts with typed parsers and generics

## Objective
- Restore type safety by replacing unsafe casts.

## Context
- **Current date: October 30, 2025**
- Files: mca/src/server.ts; runner/src/agent.ts; validator/src/server.ts; shared/langfuse.ts
- Pattern: Introduce zod schemas/types; refine generics.

## Steps
1) Replace coercions with zod parse + typed interfaces (narrow shapes).
2) Tests:
   - Add negative tests for invalid shapes → 400 or error path.
3) Validation:
   - `npm run typecheck && npm test`
4) Artifacts:
   - Diff; tests.

## Acceptance Criteria
- No unsafe casts remain in src paths; types validated at boundaries.
```

*Ref: zod schemas for safe parsing. ([Medium][7])*

---

## BUG 23 — `skipLibCheck: true` masks lib type issues

```
# TASK TITLE: Disable skipLibCheck (or scope narrowly)

## Objective
- Surface hidden library type errors.

## Context
- **Current date: October 30, 2025**
- File: tsconfig.base.json
- Constraint: If third-party noise blocks CI, scope skipLibCheck only to that lib in tsconfig overrides.

## Steps
1) Set `"skipLibCheck": false`; run typecheck; fix surfaced issues or add **very** narrow override.
2) Validation:
   - `npm run typecheck`
3) Artifacts:
   - Diff; typecheck log.

## Acceptance Criteria
- Typecheck green with skipLibCheck disabled (or narrowly scoped).
```

---

## BUG 24 — Workspace bootstrap (status: resolved)

```
# TASK TITLE: Verify workspace bootstrap remains healthy

## Objective
- Ensure prior "UNMET DEPENDENCY" state remains resolved.

## Context
- **Current date: October 30, 2025**
- Files: package.json (workspaces), lockfile
- Steps:
1) Run `npm ls --depth=0` → confirm no UNMET; `npm run lint && npm run typecheck`.
2) If regressions: re-run `npm i` at root and commit lockfile.
3) Artifacts: logs.

## Acceptance Criteria
- No workspace dependency errors; gates pass.
```

---

## BUG 25 — Next.js 14.2.5 + `libxmljs2` advisories (CRITICAL)

```
# TASK TITLE: Upgrade vulnerable dependencies (Next.js, libxmljs2)

## Objective
- Eliminate known critical advisories in the UI stack.

## Context
- **Current date: October 30, 2025**
- Files: apps/web/package.json ("next": "14.2.5"); any libxmljs2 usage
- Constraint: Upgrade to a patched Next.js (latest 14.x or 15.x per advisory) and patched libxmljs2; fix breakages.

## Steps
1) Reproduce:
   - `npm audit --json` confirms advisories.
2) Fix:
   - Bump Next.js to a patched version per GHSA; upgrade or remove/replace `libxmljs2`.
3) Tests:
   - `npm test -w apps/web`; run e2e smoke (if present).
4) Validation:
   - `npm audit` → no **critical**; CI green.
5) Artifacts:
   - Diff; audit before/after.

## Acceptance Criteria
- No critical advisories for Next.js/libxmljs2; app builds and passes tests.
```

*Refs: GHSA for Next.js authorization bypass; libxmljs2 CVE. ([GitHub][8])*

---

## BUG 26 — NEW: Silent catch blocks (observability risk)

```
# TASK TITLE: Purge silent catches repo-wide

## Objective
- Ensure every catch logs or rethrows with context (no `{}`).

## Context
- **Current date: October 30, 2025**
- Files: see findings list (validator/server.ts:215,249,301,334; web routes; shared/*)
- Pattern: Structured `logger.warn` + sanitized error fields.

## Steps
1) Search & replace patterns for `catch {}` and `catch (e) {}` with empty bodies → fix.
2) Tests:
   - Add a failing path to assert logging.
3) Validation:
   - `npm run lint && npm test`
4) Artifacts:
   - Diff; logs.

## Acceptance Criteria
- No empty catch blocks in src tree; tests cover at least one case per service.
```

---

## BUG 27 — NEW: Unsafe array indexing

```
# TASK TITLE: Add bounds checks for array indexing

## Objective
- Prevent `undefined` access crashes on empty arrays.

## Context
- **Current date: October 30, 2025**
- Files: implementer/src/agent.ts (choices[0]); planner/src/server.ts; validator/src/server.ts; shared/db.ts
- Pattern: `const first = arr[0] ?? default`; or `if (!arr.length) throw` before access.

## Steps
1) Replace unsafe indexing; handle empty cases explicitly.
2) Tests:
   - Simulate empty API/DB responses; assert behavior.
3) Validation:
   - `npm test`
4) Artifacts:
   - Diff; tests.

## Acceptance Criteria
- No direct `[0]` access without checks in src tree.
```

---

# C) Run-order plan (prioritization & batching)

**Session 1 (Security P0 hardeners first):**

1. **BUG 18** (file API traversal)
2. **BUG 19** (artifacts zip traversal)
3. **BUG 25** (Next.js/libxmljs2 upgrades)

*(Path traversal + known CVEs first; OWASP-aligned fixes. ([owasp.org][1]))*

**Session 2 (Pipeline stability & correctness):**

1. **BUG 1** (Redis error handling)
2. **BUG 8** (timeouts/retries for inter-service fetch)
3. **BUG 13** (OpenAI timeouts/retries/token caps)
   *(AbortSignal patterns for fetch & reliability. ([codedrivendevelopment.com][5]))*

**Session 3 (CI gates & test health):**

1. **BUG 2** (typecheck Playwright)
2. **BUG 5** (Runner mock v2)
3. **BUG 7** (Validator v2)

**Session 4 (Input hardening & auth):**

1. **BUG 11** (auth + CORS)
2. **BUG 12** (schema + rate limits)
3. **BUG 16** (validate execId before SSE)

*(Express CORS / rate-limit / zod. ([nodejs.org][6]))*

**Session 5 (DX & shutdown hygiene):**

1. **BUG 4** (EADDRINUSE)
2. **BUG 9** (shared shutdown util)
3. **BUG 10** (SSE subscribe failure path)

**Session 6 (Quality & type safety sweep):**

1. **BUG 3** (Runner lint)
2. **BUG 22** (unsafe casts → zod + types)
3. **BUG 27** (unsafe indexing)

**Session 7 (Observability & residuals):**

1. **BUG 21** (swallowed errors) **+** **BUG 26** (silent catches)
2. **BUG 20** (streaming non-null guards)
3. **BUG 23** (skipLibCheck off or narrowly scoped)

**Session 8 (Verification / guardrail close-out):**

1. **BUG 24** (workspace bootstrap stays green)
2. Final **compliance run** + evidence bundle across all services.

---

## Notes on alignment with your constraints

* Every block is **self-contained** and sized for a 45–60 min slot.
* You can run **up to 3 blocks per session** in the listed order.
* Each block produces evidence under `.automation/evidence/$TASK/valid/*` and a short `summary.md`.
* No placeholders or fake greens—**all gates must pass** (lint, typecheck, tests, acceptance).

If you want, I can compress Sessions 1–2 into a single 3-block “Security Blitz” (BUG 18, BUG 19, BUG 11), then a follow-up “Reliability Blitz” (BUG 8, BUG 13, BUG 1).

[1]: https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/01-Testing_Directory_Traversal_File_Include?utm_source=chatgpt.com "Testing Directory Traversal File Include"
[2]: https://stackoverflow.com/questions/57445171/redis-ioredis-unable-to-catch-connection-error-in-order-to-handle-them-grace?utm_source=chatgpt.com "Redis (ioredis) - Unable to catch connection error in order ..."
[3]: https://tecktol.com/zod-schema-validation-the-complete-guide/?utm_source=chatgpt.com "Master Zod Validation: Schema, Typescript & Documentation"
[4]: https://eslint.org/docs/latest/use/configure/migration-guide?utm_source=chatgpt.com "Configuration Migration Guide"
[5]: https://codedrivendevelopment.com/posts/everything-about-abort-signal-timeout?utm_source=chatgpt.com "Everything about the AbortSignals (timeouts, combining ..."
[6]: https://nodejs.org/api/errors.html?utm_source=chatgpt.com "Errors | Node.js v25.1.0 Documentation"
[7]: https://medium.com/smallcase-engineering/zod-schema-validations-types-simplified-dcc101854e35?utm_source=chatgpt.com "Zod : Schema Validations & Types Simplified"
[8]: https://github.com/advisories/GHSA-f82v-jwr5-mffw?utm_source=chatgpt.com "Authorization Bypass in Next.js Middleware · CVE-2025- ..."
