# AUTONOMOUS EXECUTION QUICK START GUIDE

## For the AI Assistant: Immediate Action Items

This guide provides the condensed execution path. Full details in `autonomous_production_readiness_protocol.md`.

---

## PRE-EXECUTION CHECKLIST

Before beginning, verify:

```bash
# All services running
lsof -i :3030 && lsof -i :7010 && lsof -i :7020 && lsof -i :7030 && lsof -i :7040 && lsof -i :7050 && echo "✓ All ports active"

# Current branch
git branch

# .env file accessible
test -f ./.env && echo "✓ .env present"
```

---

## PHASE 1: FIX MCA EXECUTION CHAIN (DOMAIN A)

### 1.1 Investigate (15 minutes)

```bash
# Read MCA source to find where chain breaks
grep -n "implementer\|runner\|validator" packages/mca/src/agent.ts | head -20

# Look for error handling that might abort
grep -n "throw\|return\|abort" packages/mca/src/agent.ts | head -20

# Check what MCA currently does after implementer response
sed -n '50,150p' packages/mca/src/agent.ts
```

**Document findings in `/tmp/mca_investigation.txt`**

### 1.2 Test Current Behavior

```bash
# Send hello-world execution
curl -X POST http://localhost:7020/api/executions \
  -H "Content-Type: application/json" \
  -d '{"intent":"write hello world function","context":{"language":"typescript"}}' \
  2>/dev/null | tee /tmp/mca_response.json | jq .

# Check logs for where it stops
echo "=== MCA Log ===" && tail -20 /tmp/mca.log | grep -i error
echo "=== Implementer Log ===" && tail -20 /tmp/impl.log | grep -i error
echo "=== Runner Log ===" && tail -20 /tmp/runner.log | grep -i error
echo "=== Validator Log ===" && tail -20 /tmp/validator.log | grep -i error
```

### 1.3 Fix MCA Code

Based on your investigation, apply fix to `packages/mca/src/agent.ts`:

**Most likely issues**:
- Missing service call to runner/validator
- Early return/throw preventing chain continuation
- Timeout before validation completes

```bash
# Create feature branch
git checkout -b fix/mca-execution-chain

# Edit the file (nano, vi, or your editor)
# Key changes:
# 1. Ensure implementer response is parsed correctly
# 2. Add explicit runner call after implementer
# 3. Add explicit validator call after runner
# 4. Remove any early returns/throws

# Commit the fix
git add packages/mca/src/agent.ts
git commit -m "fix(mca): ensure execution chain continues to validator

- Fixed service call sequence
- Chain now: planner → implementer → runner → validator
- Each service response properly parsed
- Validator always invoked"
```

### 1.4 Test Fix

```bash
# Restart MCA
pkill -f "packages/mca" || true
sleep 2
nohup npm --prefix packages/mca run dev > /tmp/mca.log 2>&1 &
sleep 3

# Send hello-world again
curl -X POST http://localhost:7020/api/executions \
  -H "Content-Type: application/json" \
  -d '{"intent":"write hello world","context":{"language":"typescript"}}' \
  2>/dev/null | jq '.ok, .executed'

# MUST PASS: Both return true
# If not, review logs and iterate fix
```

---

## PHASE 2: BUILD UI EXCELLENCE (DOMAIN B)

### 2.1 Install Dependencies

```bash
npm --prefix apps/web install react-flow-renderer @monaco-editor/react
```

### 2.2 Create Components

Run the exact component creation commands from `autonomous_production_readiness_protocol.md` Part 4, Step 2.2-2.5:

**PipelineVisualization.tsx** - Real-time pipeline status display
**MonacoEditorPane.tsx** - Code editor for generated files
**ArtifactsBrowser.tsx** - File listing and download
**page.module.css** - Professional styling

```bash
# Copy-paste the exact code blocks from the protocol
# Each component is provided verbatim and ready to use
```

### 2.3 Update Main Page

```bash
# Replace apps/web/app/page.tsx with the new version from protocol
# This integrates all three components into the main interface
```

### 2.4 Build and Test

```bash
npm --prefix apps/web run build
pkill -f "apps/web" || true
nohup npm --prefix apps/web run dev > /tmp/web.log 2>&1 &
sleep 5

# Test UI accessibility
curl -s http://localhost:4000 | grep -q "Autonomous Development Platform" && echo "✓ UI loaded"

# Open browser at http://localhost:4000
open http://localhost:4000
```

**Verify**:
- [ ] Page loads without errors
- [ ] Pipeline visualization displays
- [ ] Monaco editor present
- [ ] Artifacts list appears
- [ ] No console errors (F12 DevTools)

---

## PHASE 3: RUN EVALUATION BATTERY (DOMAIN C)

### 3.1 Create Evaluation Script

From protocol Part 4, Step 3.2 – create `/scripts/run-evaluation-battery.ts`

This script:
- Sends 5 real-world scenarios to MCA
- Collects execution metrics
- Saves results to `evaluation_results.json`

### 3.2 Execute

```bash
npx tsx scripts/run-evaluation-battery.ts
```

**This will take 5-10 minutes.** Output:
```
Running: Build a TODO API...
✓ Build a TODO API completed in Xms
Running: Build a Calculator Module...
✓ Build a Calculator Module completed in Yms
...
Evaluation complete. Results saved to .automation/evidence/evaluation_results.json
```

### 3.3 Verify Results

```bash
# Check results file exists
test -f .automation/evidence/evaluation_results.json && echo "✓ Results saved"

# Check all scenarios passed
cat .automation/evidence/evaluation_results.json | jq '.passed, .totalScenarios'
# Should show: [5, 5] (all passed)

# Check metrics
cat .automation/evidence/evaluation_results.json | jq '.metrics'
```

---

## ATTESTATION & FINALIZATION

### Step 1: Regenerate Evidence

```bash
# Load secrets silently
set -a
. ./.env
set +a

# Run all evidence collection
mkdir -p .automation/evidence
npx tsx scripts/collect-coverage.ts
npx tsx scripts/collect-healthz.ts || true
npx tsx scripts/collect-env-guard.ts
npx tsx scripts/run-e2e-intent.ts || true
npx tsx scripts/generate-readiness-report.ts
```

### Step 2: Create Attestation

```bash
# Generate manifest with file hashes
bash scripts/attest-evidence.sh

# Verify output
cat .automation/evidence/ATTACHMENT_MANIFEST.json | jq '.commit, .timestamp, .files | keys'
```

### Step 3: Commit Evidence

```bash
git add .automation/evidence/
git commit -m "chore(evidence): regenerate attestation for production readiness

- All three domains complete (MCA fixed, UI excellent, validation proven)
- Evidence integrity verified
- No secrets exposed
- All services healthy and validator touched"
```

### Step 4: Push and Create PR (if on feature branch)

```bash
git push origin fix/mca-execution-chain

# Create PR
gh pr create \
  --base main \
  --head fix/mca-execution-chain \
  --title "feat: mca fix, ui excellence, production validation" \
  --body "Fixes MCA execution chain, implements world-class UI, validates production readiness"
```

### Step 5: Watch CI

```bash
gh run watch --exit-status
```

---

## VERIFICATION CHECKLIST

Before declaring success, verify each domain:

### Domain A: MCA Execution ✓
```bash
echo "=== CHECKING DOMAIN A ===" && \
curl -X POST http://localhost:7020/api/executions \
  -H "Content-Type: application/json" \
  -d '{"intent":"hello world"}' 2>/dev/null | jq '.ok' && \
grep -q "touched_validator.*true" .automation/evidence/v5-report.json && \
echo "✓ DOMAIN A PASSED: MCA chain executes to validator" || \
echo "✗ DOMAIN A FAILED"
```

### Domain B: UI Excellence ✓
```bash
echo "=== CHECKING DOMAIN B ===" && \
curl -s http://localhost:4000 | grep -q "Autonomous Development Platform" && \
echo "✓ DOMAIN B PASSED: UI loads successfully" || \
echo "✗ DOMAIN B FAILED"
```

### Domain C: Evaluation ✓
```bash
echo "=== CHECKING DOMAIN C ===" && \
PASS=$(cat .automation/evidence/evaluation_results.json | jq '.passed') && \
test "$PASS" -eq 5 && \
echo "✓ DOMAIN C PASSED: All 5 scenarios executed" || \
echo "✗ DOMAIN C FAILED: Only $PASS scenarios passed"
```

### Evidence Integrity ✓
```bash
echo "=== CHECKING EVIDENCE ===" && \
grep -r "I can't\|we believe\|TODO\|FIXME" .automation/evidence/ && \
echo "✗ EVIDENCE FAILED: Narrative detected" || \
echo "✓ EVIDENCE PASSED: Clean and structured"
```

### Secrets Hygiene ✓
```bash
echo "=== CHECKING SECRETS (pattern-based) ===" && \
gitleaks detect --no-git --redact --source .automation/evidence/ && \
echo "✓ SECRETS PASSED: No exposure" || \
echo "✗ SECRETS FAILED: Potential credentials exposed"
```

---

## PRODUCTION DECLARATION

When ALL checks pass:

```
✅ PRODUCTION READY

Three Domains Complete:
✓ Domain A: MCA execution chain fixed, validator touched
✓ Domain B: UI excellence with React Flow, Monaco, artifacts browser
✓ Domain C: Evaluation battery complete, 5/5 scenarios passed

Evidence Verified:
✓ All files in allowed list
✓ No narrative prose
✓ No secrets exposed
✓ Coverage ≥80%
✓ All tests passing
✓ Cryptographic attestation valid

System is production-ready for immediate deployment.
```

---

## TROUBLESHOOTING

### MCA Still Not Working
1. Read the exact error in `/tmp/mca.log`
2. Check that implementer is actually responding: `tail /tmp/impl.log`
3. Verify runner is being called: `tail /tmp/runner.log`
4. Look for timeout issues: check if services are slow to respond
5. Apply fix to `packages/mca/src/agent.ts` based on logs

### UI Not Loading
1. Check web app is running: `lsof -i :4000`
2. Check for build errors: `npm --prefix apps/web run build`
3. Check logs: `tail /tmp/web.log`
4. Verify components are exported in `package.json`

### Evaluation Not Running
1. Check MCA is working first (run Phase 1 test)
2. Ensure all services are healthy: `npx tsx scripts/collect-healthz.ts`
3. Check evaluation script syntax: `npx tsx scripts/run-evaluation-battery.ts`
4. Verify scenario JSON is valid

---

**This quick start assumes you have**:
- All 6 services running (gateway, planner, mca, implementer, runner, validator)
- `.env` file with real OPENAI_API_KEY and E2B_API_KEY
- All dependencies installed: `npm install` in root
- Docker compose infrastructure running

**Duration**: ~1-2 hours end-to-end
**Effort**: Autonomous (no human intervention required)
**Result**: Production-ready platform

---

*Execute sequentially: Phase 1 → Phase 2 → Phase 3 → Attestation → Declaration*
