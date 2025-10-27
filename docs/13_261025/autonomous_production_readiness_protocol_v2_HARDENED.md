# AUTONOMOUS PRODUCTION READINESS PROTOCOL v2 (HARDENED)
## Refined October 2025 with Supply Chain & Security Controls

**This is the production-specification version** with all technical ambiguities resolved.

---

## EXECUTIVE SUMMARY

Three-domain achievement with hardened security, measurable gates, and supply chain attestation.

### Domains
1. **Domain A**: MCA execution chain debug → root cause fix → validator touched
2. **Domain B**: UI excellence → headless-verified (no subjective "professional")
3. **Domain C**: Evaluation battery → 5 scenarios executed and validated

### Success Gate
All criteria simultaneously true; CI enforces via required status checks.

---

## PART 1: TECHNICAL PRECISION & CORRECTED DEPENDENCIES

### Correct Dependency Versions (Oct 2025)

**Web UI** (`apps/web/package.json`):
```json
{
  "dependencies": {
    "reactflow": "^11.10.4",
    "@monaco-editor/react": "^4.6.0",
    "next": "^14.2.5",
    "react": "^18.3.1"
  }
}
```

**NOT** `react-flow-renderer` (legacy).

**Runner** (`packages/runner/package.json`):
```json
{
  "dependencies": {
    "@e2b/sdk": "^2.1.1"
  }
}
```

Update to align with repo's current version. API used: `sandbox.files.makeDir()`, `sandbox.commands.run()`.

**Sandbox/E2B APIs** (production):
- `sandbox.files.makeDir()` (not `filesystem.makeDir()`)
- `sandbox.commands.run()` (not `process.start()`)
- Reference: [@e2b/sdk npm](https://www.npmjs.com/package/@e2b/sdk), [GitHub SDK docs](https://github.com/e2b-dev/e2b)

---

## PART 2: MACHINE-VERIFIABLE SUCCESS CRITERIA

### Domain A: MCA Execution Chain

- [ ] Root cause of MCA failure identified from source code
- [ ] Code fix applied to `packages/mca/src/agent.ts` or related
- [ ] Hello-world execution: `curl POST /api/executions` returns `{ ok: true, executed: true }`
- [ ] Service chain traced in logs: planner → implementer → runner → validator
- [ ] `v5-report.json` shows:
  - `"exercised_chain": true`
  - `"e2e.touched_validator": true`
  - All service names listed

### Domain B: UI Excellence (Headless-Verified)

Measurable via Playwright E2E tests. **NO manual browser inspection in CI.**

- [ ] Playwright test: Load http://localhost:4000 → No console errors, no 4xx/5xx network
- [ ] Playwright test: SSE endpoint `/api/sse/execution` streams at least one event
- [ ] Playwright test: React Flow nodes render on page (DOM check: `.react-flow__node`)
- [ ] Playwright test: Monaco editor present and mounts (DOM check: `.monaco-editor`)
- [ ] Playwright test: Artifacts list renders (DOM check: `[data-testid="artifacts-list"]`)
- [ ] No unhandled promise rejections captured in page events

### Domain C: Evaluation Battery

- [ ] 5 real-world scenarios executed via POST /api/executions
- [ ] Each scenario returns `{ ok: true }` and includes validator result
- [ ] Metrics captured per scenario: execution time, files generated, code lines
- [ ] All 5 validator results: `passed: true`
- [ ] Results stored in `evaluation_results.json` (structured, no prose)

### Evidence Integrity

**Allowed evidence files** (whitelist):
- `coverage.json` – Vitest coverage report
- `healthz_sweep.json` – Service health snapshots
- `e2e_request_response.json` – MCA execution proof
- `prod_env_guard.json` – Credential safety proof
- `v5-report.json` – Readiness verdict
- `evaluation_results.json` – Scenario execution metrics
- `ATTACHMENT_MANIFEST.json` – Cryptographic attestation with sha256 per file
- `TAMPERING_ALERT.txt` – (only if tampering detected)
- `.gitkeep` – Directory marker

**Additional allowed (not attested, for CI reference)**:
- `ci-tests.json` – Vitest JSON output (generated in CI only)
- `ci_guard_failure.txt`, `ci_guard_success.txt` – Env guard evidence

**Forbidden**:
- Any `.md` file (narrative)
- Freeform text
- Comments, TODOs, FIXMEs
- Explanatory prose

**Verification**:
```bash
# Scan must return ZERO matches
rg -n --ignore-case \
  "(I can't|we believe|TODO|FIXME|should be fine|I'll need)" \
  .automation/evidence/ --include="*.json" --include="*.txt"
```

### Tests & Coverage

- [ ] `npm test -- --coverage --run` exits 0 (no failures)
- [ ] `coverage.json` shows ≥80% line coverage globally
- [ ] Critical packages (runner, validator, mca) ≥85% coverage
- [ ] Zero skipped tests: `grep -r "\.skip\|\.only\|xit" packages --include="*.test.ts"` returns 0

### Secrets Hygiene

- [ ] No OPENAI_API_KEY, E2B_API_KEY, DATABASE_URL, or similar in evidence
- [ ] No secret values in CI logs (GitHub Actions auto-masks, verified)
- [ ] Gitleaks scan passes: `gitleaks detect --verbose --source=.`
- [ ] All secrets loaded silently: `set -a; . ./.env; set +a`

**Safe secret checking**:
```bash
# ✗ UNSAFE (may leak secret value in logs/CI)
grep "$OPENAI_API_KEY" .automation/evidence/

# ✓ SAFE (pattern-based, no values printed)
gitleaks detect --verbose --source .automation/evidence/
# or regex for patterns only:
rg 'sk-[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9_-]{20,}' .automation/evidence/
```

### CI Enforcement

`.github/workflows/ci.yml` must include:

1. **Dependency & build** (already in place)
   - `npm ci --no-audit`
   - Build shared: `npm --prefix packages/shared run build`

2. **Lint, typecheck, tests** (already in place)
   - `npm run lint`
   - `npm run typecheck`
   - `npm test -- --coverage --run`
   - Coverage threshold checks

3. **Evidence collection** (already in place)
   - `collect-healthz.ts`, `collect-env-guard.ts`, `run-e2e-intent.ts`, `generate-readiness-report.ts`
   - Narrative prose ban
   - Validator execution check

4. **NEW: Gitleaks secret scanning**
   - `gitleaks detect --verbose --source=.`
   - Fail CI if any secrets found

5. **NEW: Headless UI tests (Playwright)**
   - Load UI, assert no console errors
   - Verify SSE endpoints stream events
   - Check critical React components render
   - Fail CI on any assertion failure

6. **NEW: Supply Chain attestation**
   - Generate CycloneDX SBOM
   - Cosign attest evidence bundle with GitHub OIDC keyless
   - Verify Cosign attestation (optionally strict)

7. **NEW: OpenSSF Scorecard**
   - Run OpenSSF Scorecard action
   - Fail CI on critical findings

### Branch Protection

- Require PR for main/release branches
- Require CI job to pass (all steps above)
- Block force-push
- "Red is red" – no bypass

---

## PART 3: CORRECTED EXECUTION PLAN (LEAN)

### Phase 1: MCA Debug (30 min)

**1.1 Investigate**
```bash
# Read MCA source
head -200 packages/mca/src/agent.ts

# Grep for service calls and error handling
grep -n "implementer\|runner\|validator\|throw\|return" packages/mca/src/agent.ts | head -30
```

**1.2 Test current behavior**
```bash
curl -X POST http://localhost:7020/api/executions \
  -H "Content-Type: application/json" \
  -d '{"intent":"write hello world","context":{"language":"typescript"}}' \
  2>/dev/null | jq .

# Check logs
tail -30 /tmp/mca.log | grep -i error
```

**1.3 Identify root cause** (pattern matching)
- Early abort/throw before runner/validator?
- Timeout cutting chain short?
- Response parsing failure?
- Missing service call?

**1.4 Apply fix**
```bash
git checkout -b fix/mca-execution-chain

# Edit packages/mca/src/agent.ts
# Ensure: no early returns/throws; explicit runner call; explicit validator call

git add packages/mca/src/agent.ts
git commit -m "fix(mca): complete execution chain to validator"
```

**1.5 Verify**
```bash
# Restart MCA
pkill -f "packages/mca"; sleep 2
nohup npm --prefix packages/mca run dev > /tmp/mca.log 2>&1 &
sleep 3

# Re-test
curl -X POST http://localhost:7020/api/executions \
  -H "Content-Type: application/json" \
  -d '{"intent":"write hello world"}' 2>/dev/null | jq '.ok, .executed'

# Must be: true, true
# Check v5-report.json
grep -q '"touched_validator".*true' .automation/evidence/v5-report.json && echo "✓ PASS"
```

---

### Phase 2: UI Excellence – Headless Verified (45 min)

**2.1 Update dependencies**
```bash
npm --prefix apps/web install reactflow@^11.10.4 @monaco-editor/react@^4.6.0 @playwright/test@latest
```

**2.2 Implement React components** (exact code from EXECUTION_QUICK_START.md)
- PipelineVisualization.tsx (React Flow nodes)
- MonacoEditorPane.tsx (Code editor)
- ArtifactsBrowser.tsx (File listing)

**2.3 Apply styling**
- page.module.css with clean typography, spacing, color, micro-interactions
- Tailwind config (already in place)

**2.4 Create Playwright test**
```bash
cat > apps/web/e2e/home.spec.ts <<'EOF'
import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test('loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('http://localhost:4000', { waitUntil: 'networkidle' });
    expect(errors).toHaveLength(0);
  });

  test('no 4xx/5xx network requests', async ({ page }) => {
    const failedRequests: string[] = [];
    page.on('response', resp => {
      if (resp.status() >= 400) failedRequests.push(`${resp.url()} ${resp.status()}`);
    });

    await page.goto('http://localhost:4000', { waitUntil: 'networkidle' });
    expect(failedRequests).toHaveLength(0);
  });

  test('SSE stream delivers events', async ({ page }) => {
    const events: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('SSE')) events.push(msg.text());
    });

    // Inject event listener
    await page.goto('http://localhost:4000', { waitUntil: 'networkidle' });
    const eventCount = await page.evaluate(() => {
      return new Promise(resolve => {
        const es = new EventSource('/api/sse/execution');
        es.addEventListener('stage-update', () => {
          es.close();
          resolve(1);
        });
        setTimeout(() => { es.close(); resolve(0); }, 5000);
      });
    });

    expect(eventCount).toBeGreaterThan(0);
  });

  test('critical UI elements render', async ({ page }) => {
    await page.goto('http://localhost:4000', { waitUntil: 'networkidle' });

    // React Flow
    const flowNode = page.locator('.react-flow__node').first();
    await expect(flowNode).toBeVisible();

    // Monaco
    const monaco = page.locator('.monaco-editor').first();
    await expect(monaco).toBeVisible();

    // Artifacts list
    const artifacts = page.locator('[data-testid="artifacts-list"]');
    await expect(artifacts).toBeVisible();
  });
});
EOF

# Run tests locally
npm --prefix apps/web run test:e2e

# Add to package.json scripts
# "test:e2e": "playwright test --config=playwright.config.ts"
```

**2.5 Build and verify**
```bash
npm --prefix apps/web run build

# Start services
npm run dev:up

# Run Playwright tests
npm --prefix apps/web run test:e2e

# All tests must pass
```

---

### Phase 3: Evaluation Battery (1-2 hours)

**3.1 Create script** (`scripts/run-evaluation-battery.ts`)
```typescript
// Exact implementation from EXECUTION_QUICK_START.md
// Sends 5 scenarios, collects metrics, saves to evaluation_results.json
```

**3.2 Execute**
```bash
npx tsx scripts/run-evaluation-battery.ts
```

**3.3 Verify results**
```bash
# All 5 scenarios passed
cat .automation/evidence/evaluation_results.json | jq '.passed, .totalScenarios'
# Should output: [5, 5]

# Each has validator result
cat .automation/evidence/evaluation_results.json | \
  jq '.results[] | {name, status, validation: .validationResult.passed}'
# All should show: status="success", passed=true
```

---

## PART 4: HARDENED CI WORKFLOW ADDITIONS

### New Steps to Add to `.github/workflows/ci.yml`

**After "Lint" step, add: Gitleaks secret scanning**
```yaml
- name: Secrets | Gitleaks scan
  run: |
    npm install -g gitleaks
    gitleaks detect --verbose --source=. || exit 1
```

**After "Test with coverage" step, add: Playwright UI tests**
```yaml
- name: UI | Headless tests
  run: |
    npm --prefix apps/web install -D @playwright/test
    # Ensure UI app is running or start it here
    nohup npm --prefix apps/web run dev > /tmp/web.log 2>&1 &
    sleep 5
    npm --prefix apps/web run test:e2e
```

**After "Evidence | Attest" step, add: SBOM generation**
```yaml
- name: Supply Chain | Generate SBOM
  run: |
    npm install -g @cyclonedx/npm
    cyclonedx-npm --output-file=.automation/evidence/sbom.json
```

**After SBOM, add: Cosign attestation**
```yaml
- name: Supply Chain | Cosign attestation (keyless)
  run: |
    # Install Cosign
    curl -sSL https://github.com/sigstore/cosign/releases/download/v2.2.1/cosign-linux-amd64 -o /tmp/cosign
    chmod +x /tmp/cosign

    # Create attestation payload
    cat > /tmp/evidence-attestation.json <<'PAYLOAD'
    {
      "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "commit": "$(git rev-parse HEAD)",
      "evidence": {
        "v5-report": "$(cat .automation/evidence/v5-report.json | jq -c .)",
        "manifest": "$(cat .automation/evidence/ATTACHMENT_MANIFEST.json | jq -c .)"
      }
    }
    PAYLOAD

    # Attest with Cosign (GitHub OIDC token)
    /tmp/cosign attest \
      --predicate=/tmp/evidence-attestation.json \
      --attestation-type=slsaprovenance \
      ghcr.io/your-org/evidence-bundle:latest 2>&1 | tee .automation/evidence/cosign-attestation.log
```

**After attestation, add: OpenSSF Scorecard**
```yaml
- name: Supply Chain | OpenSSF Scorecard
  uses: ossf/scorecard-action@v2
  with:
    results_file: .automation/evidence/scorecard-results.sarif
    results_format: sarif
    publish_results: false
  # Fail on critical findings
  - name: Supply Chain | Check Scorecard results
    run: |
      CRITICAL=$(jq '.runs[0].results[] | select(.level=="error") | length' .automation/evidence/scorecard-results.sarif | wc -l)
      if [ "$CRITICAL" -gt 0 ]; then
        echo "Critical findings in Scorecard" >&2
        exit 1
      fi
```

**After all evidence steps, add: Final integrity check**
```yaml
- name: Evidence | Final integrity check
  run: |
    set -e

    # Check allowed files only
    ALLOWED="coverage.json healthz_sweep.json e2e_request_response.json prod_env_guard.json v5-report.json evaluation_results.json ATTACHMENT_MANIFEST.json TAMPERING_ALERT.txt .gitkeep ci-tests.json ci_guard_failure.txt ci_guard_success.txt sbom.json cosign-attestation.log scorecard-results.sarif"

    for file in .automation/evidence/*; do
      basename=$(basename "$file")
      if ! echo "$ALLOWED" | grep -q "$basename"; then
        echo "Unauthorized evidence file: $basename" >&2
        exit 1
      fi
    done

    # Narrative scan
    if rg -n --ignore-case "(I can't|we believe|TODO|FIXME)" .automation/evidence/ --include="*.json"; then
      echo "Narrative prose detected" >&2
      exit 1
    fi

    # Gitleaks evidence directory
    gitleaks detect --verbose --source=.automation/evidence/ && echo "✓ No secrets in evidence"

    # Verify required fields in v5-report
    jq -e '.e2e.touched_validator == true' .automation/evidence/v5-report.json || { echo "Validator not touched" >&2; exit 1; }

    echo "✓ Evidence integrity verified"
```

---

## PART 5: PROOF OF WORK (WHAT TO SUBMIT)

When all criteria pass:

### 1. Domain A Evidence
- Git commit SHA on fix/mca-execution-chain
- Full code diff showing MCA fix
- Curl response showing hello-world success
- Log grep output proving service chain: planner → implementer → runner → validator
- v5-report.json excerpt: `"touched_validator": true`, `"exercised_chain": true`

### 2. Domain B Evidence
- Playwright test run output showing all tests passed
- Screenshot (or page DOM dump) showing React Flow, Monaco, Artifacts components
- npm build output showing zero errors

### 3. Domain C Evidence
- evaluation_results.json with all 5 scenarios
- Metrics table: execution time, files, lines of code, validation status per scenario
- All validator results: `"passed": true`

### 4. Evidence Integrity
- Gitleaks output: "No secrets found"
- Narrative scan grep: "0 matches"
- ATTACHMENT_MANIFEST.json complete with all sha256 hashes
- Coverage.json excerpt: line coverage ≥80%
- Test count: zero failures, zero skipped

### 5. Supply Chain
- SBOM generated (CycloneDX JSON present)
- Cosign attestation log showing successful keyless signing
- OpenSSF Scorecard report: no critical findings
- Branch protection rules confirmed active

---

## PART 6: FINAL PRODUCTION DECLARATION

**Output this if and only if ALL criteria are true:**

```
✅ PRODUCTION READY – October 2025

THREE DOMAINS COMPLETE:

Domain A: MCA Execution Chain ✓
├─ Root cause: [specific technical issue identified]
├─ Fix: [code change applied to packages/mca/src/agent.ts]
├─ Proof: v5-report.json shows touched_validator=true, exercised_chain=true
└─ Validation: Hello-world execution completes planner→implementer→runner→validator

Domain B: UI Excellence ✓
├─ Components: React Flow pipeline, Monaco editor, artifacts browser
├─ Styling: Professional, attention to detail
├─ Verification: Playwright headless tests pass
│  ├─ No console errors
│  ├─ No 4xx/5xx network failures
│  ├─ SSE events stream successfully
│  └─ All critical elements render
└─ Build: npm build succeeds, zero errors

Domain C: Evaluation Battery ✓
├─ Scenarios executed: 5/5 completed
├─ Metrics captured: execution time, code generated, validation results
├─ Validator touched: All 5 scenarios passed validation
└─ Results: evaluation_results.json with complete metrics

EVIDENCE VERIFIED:
├─ Narrative scan: 0 matches (rg confirms)
├─ Secret scan: 0 exposures (Gitleaks confirms)
├─ Coverage: [X]% ≥80% (vitest coverage.json confirms)
├─ Tests: All passing, zero skipped (npm test confirms)
├─ Manifest: SHA256 attestation complete (ATTACHMENT_MANIFEST.json)
└─ Supply Chain: SBOM, Cosign attestation, Scorecard all confirmed

CI ENFORCEMENT ACTIVE:
├─ Gitleaks scanning on every push
├─ Playwright headless UI tests required
├─ SBOM generation enforced
├─ Cosign attestation required
├─ OpenSSF Scorecard checks active
└─ Branch protection: Required status checks, no force-push

DEPLOYMENT READY:
├─ All code committed and pushed
├─ Release branch created with final attestation
├─ All 6 microservices boot cleanly from docker/npm
├─ Health checks pass on gateway, planner, mca, implementer, runner, validator
└─ No secrets leaked, complete audit trail present

This system demonstrates:
✓ Autonomous AI-driven development (no human in loop)
✓ Full microservice architecture (proper separation of concerns)
✓ Real-time execution monitoring (React Flow visualization)
✓ Enterprise-grade security (supply chain attestation, secrets hygiene)
✓ Machine-verifiable quality (objective metrics, CI enforcement)
✓ Production-grade operational readiness

READY FOR IMMEDIATE DEPLOYMENT AND USER ONBOARDING.
```

---

## ANTI-PATTERNS ELIMINATED

| Anti-Pattern | Eliminated By |
|--------------|---------------|
| Unsafe secret checking with grep | Use Gitleaks (pattern-based) or regex that doesn't leak values |
| Manual browser testing in CI | Playwright headless tests with objective assertions |
| Subjective "professional styling" | Measurable headless checks (DOM elements present, no errors) |
| Outdated library versions | Dependency audit: reactflow@^11, @e2b/sdk@^2.1 |
| Missing supply chain controls | Gitleaks, SBOM, Cosign, OpenSSF Scorecard all required |
| Ambiguous evidence scope | Explicit whitelist enforced in CI step |
| No CI enforcement | All steps required; "red is red" policy |

---

## QUICK SUMMARY FOR AI EXECUTION

1. **Phase 1 (Domain A)**: Fix MCA – read source, identify blocker, apply code fix, verify hello-world succeeds
2. **Phase 2 (Domain B)**: UI – use correct libraries (reactflow, monaco), build Playwright tests, verify headless
3. **Phase 3 (Domain C)**: Evaluation – run 5 scenarios, collect metrics, verify all passed
4. **Evidence**: Generate, scan with Gitleaks, verify whitelist, attest with Cosign
5. **CI**: Add Gitleaks, Playwright, SBOM, Cosign, Scorecard steps
6. **Declaration**: Output production-ready statement only when all criteria true

---

*End of Hardened Production Protocol v2*
*Effective: October 27, 2025*
*Authority: Evidence-based, machine-verifiable, supply-chain secured*
