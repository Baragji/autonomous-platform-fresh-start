# Bug Fix Plan

## Prioritization Order
- P0 Security → P1 Gate Blockers → P2 Stability/Type Safety → P3 DX → P4 Cosmetic

## Backlog (Prioritized and Grouped)

### P0 — Security (Immediate)

1) apps/web: Path traversal in GET /api/file (Bug 18)
- Root-cause: Evidence-mode file reads use resolve() without containment check; no traversal guard on user input.
- Acceptance: Reject any path containing traversal; ensure final resolved path is strictly under evidence root; add unit tests.
- Gates: G1: unaffected except lint on added files; G2: ok; G3: unit tests pass.
- ETA: 30m

2) apps/web: Path traversal/exfiltration in POST /api/artifacts (Bug 19)
- Root-cause: Zips files using resolve() without containment checks; no schema validation on inputs.
- Acceptance: Only allow files inside evidence root; skip/400 on traversal; zip contains only allowed files; unit tests.
- Gates: G1/G2 ok; G3 unit tests pass.
- ETA: 30m

3) MCA + Gateway unauth endpoints (Bugs 11,17)
- Root-cause: Missing auth/cors/rate-limit; internal /start exposed; no token checks.
- Acceptance: API key/JWT on public routes; internal token for MCA /start; CORS allowlist; 401/403 on invalid.
- Gates: G1/G2 ok; G3 add tests for auth paths.
- ETA: 120–180m

### P1 — Gate Blockers

4) scripts/dev-orchestrator.ts typecheck fails (Bug 2)
- Root-cause: Optional Playwright import not guarded.
- Acceptance: Typecheck passes without Playwright installed (dynamic import guard or types shim/exclusion).
- Gates: G2 green.
- ETA: 20–30m

5) Runner unit test fails due to E2B API mismatch (Bug 5)
- Root-cause: Test mock uses old API; implementation expects v2 `files/commands`.
- Acceptance: Update mock; tests pass; coverage preserved.
- Gates: G3 green.
- ETA: 45–60m

6) Validator uses old E2B API (Bug 7)
- Root-cause: Uses `filesystem` + `process.start()`; runtime mismatch with v2.
- Acceptance: Switch to `files` + `commands.run()`; add compat if needed; tests updated.
- Gates: G2/G3 green.
- ETA: 90–120m

7) Inter-service HTTP lacks timeouts (Bug 8) and OpenAI timeouts/retries (Bug 13)
- Root-cause: No AbortController wrappers; no retry/backoff; unbounded token usage.
- Acceptance: 5–10s timeouts with retries; explicit max_tokens; structured error events.
- Gates: G2 ok; G3 add unit tests for timeout wrappers.
- ETA: 120–180m

8) Workspace bootstrap missing deps (Bug 24)
- Root-cause: Workspaces not fully installed in some envs.
- Acceptance: Root install resolves parsers/types; CI workflow ensures install step.
- Gates: G1/G2 unblock.
- ETA: 20m

9) Web UI critical advisories (Next.js) (Bug 25)
- Root-cause: Outdated Next.js with advisories.
- Acceptance: Bump to patched version; smoke test; adjust configs if needed.
- Gates: G2/G3 ok.
- ETA: 60–120m

### P2 — Stability / Type Safety

10) Redis error handling missing (Bug 1)
- Root-cause: No `error` listeners; publish/subscribe not resilient.
- Acceptance: Add listeners/backoff; publish tolerate transient errors; tests updated.
- Gates: G1/G2/G3 ok.
- ETA: 60–90m

11) Checksums integrity (Bug 15)
- Root-cause: No sha256 on writes; no verify-on-read.
- Acceptance: Writers compute sha; VFS verify on read; validator verifies critical reads.
- Gates: G2/G3 updated tests.
- ETA: 120–180m

12) Implementer observability (Bug 21)
- Root-cause: Empty catch blocks; missing structured error events.
- Acceptance: Log with shared logger; structured events; tests for error paths.
- Gates: G1/G3 ok.
- ETA: 60–90m

13) Web UI stream null assertions (Bug 20)
- Root-cause: Non-null assertions on stream readers.
- Acceptance: Guard null; graceful failover; tests.
- Gates: G2/G3 ok.
- ETA: 45–60m

14) Path sanitization in VFS/tools (Bug 14)
- Root-cause: `sanitize()` allows `..`; tools not constrained to `code/`.
- Acceptance: Strict containment; reject traversal; tests.
- Gates: G2/G3 ok.
- ETA: 90–120m

15) Unsafe casts across services (Bug 22)
- Root-cause: `as unknown as`/`any` pervasive.
- Acceptance: Replace with refined types/schemas; targeted refactors.
- Gates: G1/G2 ok; G3 ensure tests.
- ETA: 180–300m (incremental)

### P3 — DX

16) Graceful shutdown hooks (Bug 9)
- Root-cause: Missing SIGINT/SIGTERM handlers.
- Acceptance: Shared shutdown util; all services adopt; ports free on restart.
- Gates: G2/G3 ok.
- ETA: 60–90m

17) Port conflicts on reload (Bug 4)
- Root-cause: Rapid restarts; lingering ports.
- Acceptance: Close servers on signals; debounce; pre-start kill hook.
- Gates: G2 ok.
- ETA: 45–60m

18) ESLint warnings about .eslintignore (Bug 6)
- Root-cause: ESLint v9 deprecates .eslintignore.
- Acceptance: Move ignores into flat config; remove .eslintignore.
- Gates: G1 ok.
- ETA: 20–30m

### P4 — Cosmetic
- None beyond deprecation cleanup.

---

## Notes
- Grouping used: web-ui, runner, validator, shared/vfs, infra/auth, mca/gateway, orchestrator.
- Security items (18,19,11,17) prioritized as P0/P1.