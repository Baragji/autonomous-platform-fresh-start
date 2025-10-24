**INSTRUCTION FOR AI ASSISTANT:**

**TASK: Production Readiness Evidence Validation**

You must verify that the system is truly production-ready by providing **source code evidence** with exact file paths and line numbers. Follow this evidence-based methodology:

---

## EVIDENCE REQUIREMENTS

For each production-readiness criterion below, you MUST:
1. Cite exact file paths and line ranges
2. Quote relevant source code (5-10 lines max per citation)
3. State PASS or FAIL with evidence
4. If FAIL, cite missing code or provide counter-evidence

**DO NOT claim something exists without citing the exact lines.**
**DO NOT accept test passing as evidence—verify the test AND implementation.**

---

## CRITERIA TO VALIDATE (Evidence-Based)

### 1. LOGGING CONSISTENCY

**Requirement:** All services must use `createLogger` from shared package, not `console.log`.

**Validate:**
- [ ] Search all `packages/*/src/server.ts` files for `createLogger` initialization
- [ ] Search all `packages/*/src/**/*.ts` files for `console.log` usage
- [ ] Cite each service's logger initialization (file path + line number)

**Evidence format:**
```
✅ Gateway: packages/gateway/src/server.ts L5 `const logger = createLogger('gateway');`
✅ MCA: packages/mca/src/server.ts L8 `const logger = createLogger('mca');`
❌ Planner: No createLogger found in packages/planner/src/server.ts
✅ No console.log in packages/*/src/**/*.ts (searched, 0 matches)
```

---

### 2. CONFIGURATION EXTERNALIZATION

**Requirement:** No hardcoded secrets; all config via environment variables with safe defaults for test only.

**Validate:**
- [ ] Read `packages/shared/src/env.ts` completely
- [ ] Cite each default value (line numbers)
- [ ] Identify unsafe defaults (localhost URLs, weak passwords, empty API keys)
- [ ] Search for hardcoded API keys: `sk-ant-`, `sk-`, `e2b_`, `pk-lf-`, pattern matching

**Evidence format:**
```
⚠️ packages/shared/src/env.ts L15: `MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || 'minioadmin'` - Unsafe default
⚠️ packages/shared/src/env.ts L16: `MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || 'minioadmin123'` - Unsafe default
✅ packages/shared/src/env.ts L10: `OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''` - Empty default (safe for test)
✅ No hardcoded API keys found in packages/*/src/**/*.ts (searched patterns, 0 matches)
```

---

### 3. ERROR HANDLING & NEGATIVE TESTS

**Requirement:** All API endpoints must have error handling AND negative test coverage.

**Validate for each service (gateway, mca, planner, implementer, runner, validator):**
- [ ] Cite error handling code in endpoint (try/catch, status codes)
- [ ] Cite corresponding negative test (file + line + assertion)
- [ ] Verify test actually asserts error conditions (not just 200 OK)

**Evidence format:**
```
Gateway POST /api/executions:
✅ Error handling: packages/gateway/src/server.ts L45-52 (try/catch, returns 500 with Problem Details)
✅ Negative test: packages/gateway/src/server.test.ts L78-85 (expects 400 on invalid body, asserts error message)

Planner POST /plan:
✅ Error handling: packages/planner/src/server.ts L25-30 (catch block, returns 500)
❌ Negative test: NOT FOUND - No test file asserting 400/500 error paths
```

---

### 4. SECRETS SCANNING

**Requirement:** Validator must scan for hardcoded secrets with documented patterns.

**Validate:**
- [ ] Cite validator secret scanning implementation (file + line range)
- [ ] List all regex patterns used (quote the actual regex strings)
- [ ] Verify patterns detect: AWS keys, API keys, passwords, tokens
- [ ] Cite test proving detection works (test file + line + assertion)

**Evidence format:**
```
✅ Implementation: packages/validator/src/server.ts L142-158
   Patterns:
   - L145: /(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"]+)['"]/gi
   - L146: /(sk-[a-zA-Z0-9]{20,})/g
   - L147: /(pk-lf-[a-zA-Z0-9-]+)/g
   
❌ Test coverage: No test in packages/validator/src/server.test.ts asserting secrets detection
   (Search result: 0 matches for "secret" in test file)
```

---

### 5. COVERAGE THRESHOLDS ENFORCEMENT

**Requirement:** CI must enforce ≥80% global coverage, ≥90% validator coverage.

**Validate:**
- [ ] Cite jest/vitest config coverage thresholds (file + line numbers)
- [ ] Cite CI workflow enforcing coverage (file + line numbers)
- [ ] Run coverage report and cite actual percentages from output

**Evidence format:**
```
✅ Global threshold: jest.config.js L25-28
   coverageThreshold: { global: { lines: 80, branches: 65 } }
   
✅ Validator threshold: packages/validator/jest.config.js L12-15
   coverageThreshold: { global: { lines: 90 } }
   
✅ CI enforcement: .github/workflows/ci.yml L45-48
   - run: npm run test:coverage
   - run: npm run validate:coverage
   
✅ Actual coverage (from `npm run test:coverage` output):
   Global: 85% lines, 68% branches
   Validator: 92% lines
```

---

### 6. MCA REMEDIATION LOOP & ESCALATION

**Requirement:** MCA must route Validator FAIL → Implementer, track failure count, escalate at 3 failures.

**Validate:**
- [ ] Cite MCA graph validator node (file + line range)
- [ ] Cite conditional edge: PASS → END (file + line)
- [ ] Cite conditional edge: FAIL → implementer (file + line)
- [ ] Cite failure_count tracking in state (file + line)
- [ ] Cite escalation logic at 3 failures (file + line + publish event code)

**Evidence format:**
```
✅ Validator node: packages/mca/src/server.ts L118-135
   (calls validator HTTP endpoint, reads report, updates state)

✅ PASS → END edge: packages/mca/src/server.ts L158
   `.addConditionalEdges("validator", (s) => s.verdict === "PASS" ? END : "implementer")`

✅ Failure tracking: packages/mca/src/server.ts L122
   `state.failure_count = (state.failure_count || 0) + 1;`

❌ Escalation at 3: NOT FOUND
   (Searched for "failure_count >= 3" or "escalate" - 0 matches in packages/mca/src/server.ts)
```

---

### 7. ARTIFACT PROVENANCE

**Requirement:** All artifacts stored with checksums; validation report includes artifact URLs.

**Validate:**
- [ ] Cite code computing artifact checksums (file + line + algorithm)
- [ ] Cite code storing checksums in MinIO metadata (file + line)
- [ ] Cite validation report including artifact URLs (file + line in validator)

**Evidence format:**
```
❌ Checksums: NOT IMPLEMENTED
   (Searched for "createHash", "sha256", "checksum" in packages/vfs/src/*.ts - 0 matches)

✅ Artifact URLs in validation report: packages/validator/src/server.ts L185-190
   validation_report.artifacts = {
     junit_url: `${execId}/validator/validator-junit.xml`,
     coverage_url: `${execId}/validator/validator-coverage.json`
   }
```

---

### 8. OPERATIONAL READINESS

**Requirement:** Health checks on all services; startup fails fast on missing required config.

**Validate:**
- [ ] Cite health check endpoints in each service (file + line + response code)
- [ ] Cite startup validation blocking boot on missing OPENAI_API_KEY in production (file + line)
- [ ] Cite NODE_ENV=production check disabling weak defaults (file + line)

**Evidence format:**
```
✅ Gateway health: packages/gateway/src/server.ts L55 `app.get('/healthz', (req, res) => res.status(200).json({status:'ok'}))`
✅ MCA health: packages/mca/src/server.ts L195
✅ Validator health: packages/validator/src/server.ts L220

❌ Startup validation: NOT FOUND
   (Searched for "NODE_ENV" and "production" checks in packages/shared/src/env.ts - No boot-time guard)
   (No code throws error when OPENAI_API_KEY is empty in production)
```

---

## EXECUTION PROCESS

1. **For each criterion above:**
   - Search codebase for relevant files
   - Read files completely (no truncation)
   - Extract exact line numbers and code snippets
   - State PASS ✅ or FAIL ❌ with evidence

2. **Create evidence report:**
   - File: `docs/production_readiness_evidence.md`
   - Format: Criterion → Evidence citations → PASS/FAIL
   - Include counter-examples for FAIL cases

3. **Identify gaps:**
   - List all FAIL items with missing code
   - Propose exact implementation (file + lines to add)

4. **Update progress.md:**
   - Add "Production Readiness Validation" section
   - Cite this evidence file
   - Mark as INCOMPLETE if any criteria FAIL

---

## OUTPUT DELIVERABLE

Create `docs/production_readiness_evidence_with_data.md` with:
- Executive summary (% criteria passed)
- Evidence table (Criterion | Evidence | Status)
- Gap analysis (what's missing + where to add it)
- Recommendations (prioritized by risk)

**CRITICAL:** Every claim must cite file:line. No assertions without evidence.

**BEGIN VALIDATION NOW.**