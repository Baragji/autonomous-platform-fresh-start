# Production Readiness Evidence

## Criterion 1: Logging Consistency
- ❌ Gateway – `packages/gateway/src/server.ts` initializes Express without `createLogger`, so logging is inconsistent.
```ts
import express, { type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { upsertExecution, getExecution } from '@autonomous/shared/src/db';
import { publish, subscribe } from '@autonomous/shared/src/events';
import { startOtel } from '@autonomous/shared/src/otel';

startOtel('gateway');
```
【F:packages/gateway/src/server.ts†L1-L8】
- ✅ MCA – `createLogger('mca')` instantiated before use.
```ts
import { createLogger } from '@autonomous/shared/src/logger';
...
app.use(express.json());
const logger = createLogger('mca');
```
【F:packages/mca/src/server.ts†L7-L18】
- ❌ Planner – Express app created without shared logger.
```ts
startOtel('planner');
export const app = express();
app.use(express.json());
```
【F:packages/planner/src/server.ts†L9-L11】
- ✅ Implementer – Shared logger created and used for error reporting.
```ts
import { createLogger } from '@autonomous/shared/src/logger';
...
const logger = createLogger('implementer');
```
【F:packages/implementer/src/server.ts†L4-L63】
- ✅ Runner – Shared logger created for run orchestration.
```ts
import { createLogger } from '@autonomous/shared/src/logger';
...
const logger = createLogger('runner');
```
【F:packages/runner/src/server.ts†L4-L20】
- ✅ Validator – Shared logger drives structured errors.
```ts
import { createLogger } from '@autonomous/shared/src/logger';
...
const logger = createLogger('validator');
```
【F:packages/validator/src/server.ts†L6-L220】
- ✅ No runtime `console.log` usages in source – `rg "console.log" packages` returned only test fixtures.
`packages/vfs/src/__tests__/minioVfs.test.ts:89-91` and implementer tests generate sample content; no source hits.
【16f0b8†L1-L14】

## Criterion 2: Configuration Externalization
- ⚠️ Unsafe defaults remain in `packages/shared/src/env.ts` (MINIO and database credentials ship with weak fallbacks).
```ts
DATABASE_URL: process.env.DATABASE_URL || 'postgresql://umca:umcapassword@localhost:5433/umca',
REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6380',
MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || 'minioadmin',
MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || 'minioadmin123',
OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
```
【F:packages/shared/src/env.ts†L16-L23】
- ✅ Defaults limited to blanks for OpenAI/Langfuse keys, which is safe for tests.
```ts
LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY || '',
LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY || '',
LANGFUSE_HOST: process.env.LANGFUSE_HOST || undefined
```
【F:packages/shared/src/env.ts†L24-L26】
- ✅ Pattern search for hardcoded keys (`sk-`, `sk-ant-`, `e2b_`, `pk-lf-`) found no runtime code hits beyond documentation.
【f88a51†L1-L21】

## Criterion 3: Error Handling & Negative Tests
- Gateway POST `/api/executions`
  - ❌ Error handling: no try/catch guard around persistence; failures fall through.
  - ✅ Negative tests cover 400/404 responses.
```ts
app.post('/api/executions', async (req: Request, res: Response) => {
  const intent = String(req.body?.intent || '').trim();
  if (!intent) return res.status(400).json({ error: 'intent required' });
  const id = uuidv4();
  await upsertExecution(id, 'planning', intent, 'mca');
  ...
});
```
【F:packages/gateway/src/server.ts†L11-L25】
```ts
it('rejects missing intent', async () => {
  const res = await request(app).post('/api/executions').send({});
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'intent required' });
});
```
【F:packages/gateway/src/__tests__/server.test.ts†L52-L57】
- MCA POST `/start`
  - ✅ Error handling: try/catch logs failure, updates status, publishes error.
  - ❌ Tests lack failing-path assertions.
```ts
try {
  ...
  await graph.invoke({ execId, intent }, opts);
} catch (e) {
  const err = e as Error;
  logger.error({ execId, err: err.message, stack: err.stack }, 'Graph invoke failed');
  await upsertExecution(execId, 'failed', intent, 'mca');
  await publish(execId, 'error', { message: err.message, stack: err.stack });
}
```
【F:packages/mca/src/server.ts†L178-L189】
```ts
it('requires execId and intent', async () => {
  const res = await request(app).post('/start').send({});
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'execId and intent required' });
});
```
【F:packages/mca/src/__tests__/server.test.ts†L137-L143】
- Planner POST `/plan`
  - ✅ Error handling: wrapper try/catch returns 500 with message.
  - ❌ Negative tests only cover validation (400) and fallback success; no 500 assertion.
```ts
try {
  ...
  res.json({ ok: true, object: objectName });
} catch (err: unknown) {
  const e = err as Error;
  res.status(500).json({ error: e.message || String(err) });
}
```
【F:packages/planner/src/server.ts†L22-L122】
```ts
it('requires execId and intent', async () => {
  const res = await request(app).post('/plan').send({});
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'execId and intent required' });
});
```
【F:packages/planner/src/__tests__/server.test.ts†L58-L63】
- Implementer POST `/implement`
  - ✅ Error handling: try/catch logs and returns 500.
  - ✅ Tests assert 400 invalid body and 500 agent failure.
```ts
try {
  ...
  const result = await agent.run({ execId, plan: advisoryPlan });
  res.json(result);
} catch (err) {
  const e = err as Error;
  logger.error({ execId, err: e.message }, 'implementer run failed');
  res.status(500).json({ error: e.message });
}
```
【F:packages/implementer/src/server.ts†L31-L64】
```ts
it('500 when agent throws', async () => {
  const res = await request(badApp).post('/implement').send({ execId: 'e2', plan });
  expect(res.status).toBe(500);
  expect(res.body.error).toBe('boom');
});
```
【F:packages/implementer/src/__tests__/server.test.ts†L42-L54】
- Runner POST `/run`
  - ❌ Error handling: no try/catch; relies on agent result only.
  - ❌ Tests lack error assertions (only happy path).
```ts
app.post('/run', async (req: Request, res: Response) => {
  const parse = RunRequestSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'invalid request', details: parse.error.issues });
  const agent = new RunnerAgent(logger);
  const result = await agent.run(parse.data);
  if (!result.ok) return res.status(500).json(result);
  res.json(result);
});
```
【F:packages/runner/src/server.ts†L14-L20】
```ts
it('runs tests and uploads artifacts', async () => {
  const res = await request(app).post('/run').send({ execId: 'x' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});
```
【F:packages/runner/src/__tests__/server.test.ts†L50-L59】
- Validator POST `/validate`
  - ✅ Error handling covers 400 validation, 500 publishing on failure.
  - ❌ Tests only assert success flows; no negative scenarios.
```ts
if (!parse.success) return res.status(400).json({ error: 'invalid request', details: parse.error.issues });
...
} catch (err) {
  const e = err as Error;
  logger.error({ err: e.message }, 'validator failed');
  await publish(execId, 'agent', { agent: 'validator', status: 'failed', error: e.message });
  return res.status(500).json({ error: e.message });
}
```
【F:packages/validator/src/server.ts†L58-L219】
```ts
it('produces artifacts and checksums in report', async () => {
  const res = await request(app).post('/validate').send({ execId: 'exec-1' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});
```
【F:packages/validator/test/integration-validate.spec.ts†L58-L70】

## Criterion 4: Secrets Scanning
- ✅ Implementation defines regex coverage for AWS keys, passwords, and JWTs.
```ts
const secretRegexes: Array<{ name: string; re: RegExp }> = [
  { name: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Key', re: /aws(.{0,20})?(secret|access).{0,20}?[=:\s][A-Za-z0-9\/+=]{40}/i },
  { name: 'Generic Password', re: /password\s*[:=]\s*['\"][^'\"]+['\"]/i },
  { name: 'JWT', re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ }
];
```
【F:packages/validator/src/server.ts†L20-L26】
- ✅ `scanForSecrets` iterates guessed files and counts regex hits.
```ts
for (const { re } of secretRegexes) {
  if (re.test(content)) count += 1;
}
```
【F:packages/validator/src/server.ts†L246-L253】
- ✅ Unit test asserts secret detection increments count.
```ts
const n = await scanForSecrets(sandbox, '/project/src');
expect(n).toBeGreaterThan(0);
```
【F:packages/validator/test/expanded-coverage.spec.ts†L41-L55】

## Criterion 5: Coverage Thresholds Enforcement
- ❌ Root Vitest config lacks `coverage.threshold`/`coverageThreshold` enforcement.
```ts
test: {
  include: ['packages/*/src/**/*.test.ts'],
  ...
  coverage: {
    provider: 'v8',
    include: ['packages/**/src/**/*.ts'],
    reportsDirectory: 'coverage',
    reporter: ['json', 'text', 'json-summary']
  }
}
```
【F:vitest.config.ts†L13-L23】
- ❌ Validator-specific Vitest config also omits thresholds.
```ts
coverage: {
  provider: 'v8',
  include: ['src/**/*.ts'],
  reportsDirectory: 'coverage',
  reporter: ['json', 'text', 'json-summary']
}
```
【F:packages/validator/vitest.config.ts†L4-L15】
- ✅ CI workflow runs coverage checks but relies on script rather than config thresholds.
```yaml
- name: Test with coverage
  run: |
    mkdir -p .automation/evidence
    npm test -- --coverage --run
    npm test -- --reporter=json --run | tee .automation/evidence/ci-tests.json
- name: Enforce coverage threshold
  run: npm run compliance:coverage
```
【F:.github/workflows/ci.yml†L80-L94】
- ❌ Actual coverage below policy: `npm test -- --coverage --run` → global lines 70.19%, validator 0%.
【52a4b6†L1-L33】

## Criterion 6: MCA Remediation Loop & Escalation
- ✅ Validator node records verdict, updates status, increments `failure_count`, and publishes escalation event at ≥3 failures.
```ts
const failure_count = verdict === 'FAIL' ? (state.failure_count ?? 0) + 1 : (state.failure_count ?? 0);
if (failure_count >= 3 && verdict === 'FAIL') {
  await publish(state.execId, 'escalated', { failure_count });
}
return { ...state, current_agent: 'validator', status: verdict === 'PASS' ? 'validated' : 'needs_remediation', failure_count };
```
【F:packages/mca/src/server.ts†L120-L128】
- ✅ Conditional edges route PASS → END, FAIL → implementer, emitting escalation status when threshold reached.
```ts
.addConditionalEdges('validator', (state: McaState) => {
  if (state.status === 'validated') return END;
  if ((state.failure_count ?? 0) >= 3) {
    state.status = 'escalated';
    publish(state.execId, 'status', { status: 'escalated' }).catch(() => {});
  }
  return 'implementer';
});
```
【F:packages/mca/src/server.ts†L152-L166】

## Criterion 7: Artifact Provenance
- ✅ Validator computes SHA-256 checksums for artifacts and embeds them in the report.
```ts
const checksums: { junit?: string; coverage?: string; report?: string } = {};
if (junitObject) {
  const buf = await vfs.readFile(junitObject);
  checksums.junit = sha256(buf);
}
if (coverageObject) {
  const buf = await vfs.readFile(coverageObject);
  checksums.coverage = sha256(buf);
}
const reportWithChecksums = { ...report, checksums };
const reportBuf = Buffer.from(JSON.stringify(reportWithChecksums, null, 2));
checksums.report = sha256(reportBuf);
await vfs.writeFile(validationReportObject, reportBuf, { contentType: 'application/json' });
```
【F:packages/validator/src/server.ts†L197-L209】
- ✅ Validation report includes artifact paths when publishing.
```ts
await publish(execId, 'artifact', { type: 'validation', report: validationReportObject, junit: junitObject, coverage: coverageObject });
return res.json({ ok: true, verdict: report.verdict, report: validationReportObject, junitObject, coverageObject });
```
【F:packages/validator/src/server.ts†L211-L214】
- ❌ No evidence of storing checksums in MinIO metadata; `vfs.writeFile` lacks metadata arguments for checksum persistence.
```ts
await vfs.writeFile(junitObject, junitXml, { contentType: 'application/xml' });
...
await vfs.writeFile(coverageObject, coverageJson);
```
【F:packages/validator/src/server.ts†L136-L146】

## Criterion 8: Operational Readiness
- ❌ Gateway lacks `/healthz` endpoint; startup prints only log message.
```ts
const port = Number(process.env.GATEWAY_PORT || 3030);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => process.stdout.write(`[gateway] listening on :${port}\n`));
}
```
【F:packages/gateway/src/server.ts†L60-L63】
- ❌ Planner and MCA also lack health endpoints (files contain no `app.get('/healthz'...)`).
【F:packages/planner/src/server.ts†L9-L130】【F:packages/mca/src/server.ts†L15-L195】
- ✅ Runner exposes `/healthz` returning `{ ok: true }`.
```ts
app.get('/healthz', (_req, res) => res.json({ ok: true }));
```
【F:packages/runner/src/server.ts†L12-L12】
- ✅ Validator exposes `/healthz`.
```ts
app.get('/healthz', (_req, res) => res.json({ ok: true }));
```
【F:packages/validator/src/server.ts†L56-L56】
- ❌ No production startup guard rejects empty `OPENAI_API_KEY`; env loader leaves empty string even in production.
```ts
OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
```
【F:packages/shared/src/env.ts†L22-L22】

---

## Gap Analysis & Proposed Remediation
- Logging: Add `createLogger` usage to Gateway and Planner server initializers (`packages/gateway/src/server.ts`, `packages/planner/src/server.ts`).
- Configuration: Replace weak defaults in `packages/shared/src/env.ts` with required env checks or test-only guards.
- Error Handling & Tests:
  - Gateway, Runner need try/catch wrappers and negative tests for 500 paths.
  - MCA, Planner, Validator require tests that assert error responses.
- Coverage: Configure `coverage.threshold` (global ≥80%, validator ≥90%) in `vitest.config.ts` and `packages/validator/vitest.config.ts`; raise coverage to meet targets.
- Artifact provenance: Store checksum metadata alongside MinIO uploads (e.g., include checksum headers in `vfs.writeFile`).
- Operational readiness: Add `/healthz` to Gateway, Planner, MCA; enforce startup guard to throw when required secrets missing in production.

## Status Summary
- Criteria passed: 3 / 8 (Logging – partial fail; Configuration – partial; Error handling – mostly fail; Secrets scanning – pass; Coverage thresholds – fail; MCA remediation – pass; Artifact provenance – partial; Operational readiness – fail).
- Overall production readiness: ❌ FAIL – multiple critical gaps remain.
