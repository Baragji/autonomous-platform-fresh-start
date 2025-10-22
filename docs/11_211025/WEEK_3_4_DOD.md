# Week 3-4: Implementer + VFS DoD (Definition of Done)

**Status:** READY TO EXECUTE
**Duration:** 10 days
**Phase:** Vertical Slice #1 – Week 3-4
**Constitutional Authority:** CONSTITUTION.md Articles I, II, III, V, VI, IX

---

## 🎯 Mission

**Outcome:** Planner output → Implementer generates TypeScript code → stored in MinIO with SSE streaming

**Success = All gates PASS (binary). No subjective evaluation.**

---

## 📋 Acceptance Criteria (BINARY GATES — Must ALL Pass)

### G1-VFS: Virtual File System Operational

**Test Commands:**
```bash
# Run VFS test suite (MinIO-backed only; tests use unique prefixes)
npm --prefix packages/vfs test -- --reporter=json | jq -e '.success'

# Optional: verify MinIO persistence via mc (prefix created by tests)
# NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{printf "%s" $k}}{{end}}' umca-minio)
# MC_ENV=("-e" "MC_HOST_local=http://minioadmin:minioadmin123@umca-minio:9000")
# docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc ls local/umca-artifacts/vfs-test- | grep -q .
```

**PASS Criteria:**
- VFS tests exit 0 with `.success == true` (tests cover create/read/list and versioning).
- No in-memory persistence used; all operations exercise MinIO with test-specific prefixes.

**FAIL Criteria:**
- VFS tests fail or skip MinIO-backed operations.
- Versioning not covered by tests.

---

### G2-IMPLEMENTER: Code Generation Works

**Test Commands:**
```bash
# 1) POST to Implementer with task → generates code
EXEC_ID=$(uuidgen)
curl -s -X POST http://localhost:7030/implement \
  -H 'Content-Type: application/json' \
  -d "{
    \"execId\": \"$EXEC_ID\",
    \"plan\": {
      \"tasks\": [{
        \"id\": \"1\",
        \"title\": \"Create TODO API\",
        \"description\": \"Build Express.js API with GET/POST /todos\"
      }]
    }
  }" | tee .automation/evidence/week3/implementer_response.json | jq -e '.ok'

# 2) Code files exist in MinIO
NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{printf "%s" $k}}{{end}}' umca-minio)
MC_ENV=("-e" "MC_HOST_local=http://minioadmin:minioadmin123@umca-minio:9000")
docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc ls local/umca-artifacts/$EXEC_ID/code/ \
  | tee .automation/evidence/week3/minio_code_ls.txt | grep -qE '(app\.ts|app\.test\.ts)'

# 3) TypeScript syntax valid
docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc cat local/umca-artifacts/$EXEC_ID/code/src/app.ts \
  | npx tsc --noEmit --stdin
```

**PASS Criteria:**
- Implementer returns `{ ok: true }`
- At least 2 files in MinIO: `src/app.ts`, `src/app.test.ts`
- TypeScript compiler validates syntax (exit 0)

**FAIL Criteria:**
- Implementer returns error
- No code files in MinIO
- Syntax errors in generated code

---

### G3-SSE: Live Edit Streaming Works

**Test Commands:**
```bash
# 1) SSE stream receives edit events during implementation
curl -sN --max-time 15 http://localhost:3030/api/executions/$EXEC_ID/stream \
  | tee .automation/evidence/week3/stream_edits.txt \
  | grep -qE '(event: edit\.start|event: edit\.complete)'

# 2) Edit events contain tool calls
grep -E 'data:.*tool_call' .automation/evidence/week3/stream_edits.txt
```

**PASS Criteria:**
- SSE stream emits at least one `edit.start` and one `edit.complete` event
- Events contain `tool_call` data (view/create/str_replace)

**FAIL Criteria:**
- No SSE events received within 15s
- Events missing tool_call data

---

### G4-MCA: Planner → Implementer Flow Works

**Test Commands:**
```bash
# 1) POST to Gateway triggers full Planner → Implementer flow
EXEC_RESPONSE=$(curl -s -X POST http://localhost:3030/api/executions \
  -H 'Content-Type: application/json' \
  -d '{"intent":"Build a TODO API with GET and POST endpoints"}')
echo "$EXEC_RESPONSE" | tee .automation/evidence/week3/gateway_response.json
EXEC_ID=$(echo "$EXEC_RESPONSE" | jq -r '.id')

# 2) Wait for status to reach 'implemented' (max 60s)
for i in {1..30}; do
  STATUS=$(curl -s http://localhost:3030/api/executions/$EXEC_ID | jq -r '.status')
  echo "Attempt $i: status=$STATUS"
  if [ "$STATUS" = "implemented" ]; then
    echo "PASS" > .automation/evidence/week3/mca_flow.txt
    break
  fi
  sleep 2
done

# 3) Checkpoint exists for 'implementer' agent
docker exec umca-postgres psql -U umca -d umca -c \
  "SELECT thread_id, checkpoint_id FROM checkpoints WHERE thread_id='$EXEC_ID' AND checkpoint LIKE '%implementer%' LIMIT 1;" \
  | tee .automation/evidence/week3/checkpoint_implementer.txt | grep -q "$EXEC_ID"
```

**PASS Criteria:**
- Gateway returns 202 with exec ID
- Status reaches `implemented` within 60s
- Postgres checkpoint shows `implementer` in state

**FAIL Criteria:**
- Status stuck at `planning`
- No implementer checkpoint
- MCA doesn't route to implementer

---

### G5-TRACE: Observability Captures Implementer

**Test Commands:**
```bash
# 1) Tempo has traces for implementer span
curl -s http://localhost:3200/ready | grep -q "ready"

# 2) Grafana health OK
curl -s http://localhost:3001/api/health | jq -e '.database=="ok"'

# 3) Manual verification: Grafana UI shows implementer span
# (Automated trace query can be added if Tempo query API configured)
```

**PASS Criteria:**
- Tempo ready
- Grafana healthy
- Traces visible in Grafana for execId (manual check acceptable for Week 3-4)

**FAIL Criteria:**
- Tempo not ready
- Grafana unhealthy

---

### G6-QUALITY: Lint, Types, Tests, Coverage ≥ 80%

**Test Commands:**
```bash
npm run lint | tee .automation/evidence/week3/lint.txt
npm run typecheck | tee .automation/evidence/week3/typecheck.txt
npm test -- --coverage --reporter=json | tail -n 1 > .automation/evidence/week3/tests.json
jq -r '.total.lines.pct' coverage/coverage-summary.json > .automation/evidence/week3/coverage_pct.txt
```

**PASS Criteria:**
- Lint exit 0
- Typecheck exit 0
- Tests exit 0, all tests pass
- Coverage ≥ 80% lines

**FAIL Criteria:**
- Lint errors
- Type errors
- Test failures
- Coverage < 80%

---

## 📊 Evidence Requirements

Follow AGENTS.md structure. Create `.automation/evidence/week3/` containing:

```
.automation/evidence/week3/
  valid/
    lint.txt            # npm run lint output (exit 0)
    typecheck.txt       # npm run typecheck output (exit 0)
    tests.json          # npm test --reporter=json (all passing)
    coverage.json       # coverage/coverage-summary.json

  baseline.json         # Metrics before change (optional for first runs)
  final.json            # Metrics after change
  implementer_response.json
  minio_code_ls.txt
  app_ts_syntax_check.txt
  stream_edits.txt
  gateway_response.json
  mca_flow.txt
  checkpoint_implementer.txt
  tempo_ready.txt
  grafana_health.json
  task_provenance.json  # Task metadata + file list
  artifacts.sha256      # Hashes of evidence files
  audit.json            # Compliance audit summary
  env.txt               # node -v, npm -v, git rev-parse HEAD
  WEEK3_SUMMARY.md
```

**Summary Template:**
```bash
cat > .automation/evidence/week3/WEEK3_SUMMARY.md <<EOF
# Week 3-4 Evidence Summary

- G1-VFS: [PASS/FAIL]
- G2-IMPLEMENTER: [PASS/FAIL]
- G3-SSE: [PASS/FAIL]
- G4-MCA: [PASS/FAIL]
- G5-TRACE: [PASS/FAIL]
- G6-QUALITY: [PASS/FAIL]

Execution ID: $EXEC_ID
Timestamp: $(date -Iseconds)
EOF
```

---

## 🛠️ Required Tools & Stack (LOCKED)

**LLM Provider:** OpenAI ONLY (V1 scope)
- Model: `gpt-4o-2024-08-06` (or `gpt-5` if available)
- API: OpenAI Function Calling (NOT Anthropic Text Editor)
- Tools: `view`, `create`, `str_replace`, `insert`

**VFS Implementation:**
- Persistent: MinIO-backed (all environments)
- Versioning: Shadow copies to `{execId}/code/versions/{timestamp}/`

**Infrastructure (unchanged from Week 2):**
- LangGraph JS + Postgres checkpointer
- Redis Streams (message bus for SSE)
- MinIO (artifact storage)
- OpenTelemetry → Tempo → Grafana
- Langfuse (LLM cost tracking)

**Future Migration Path (V2 - Week 9+):**
- Add LLM provider abstraction layer
- Support: OpenAI, Anthropic, Azure OpenAI
- Trigger: Production readiness OR vendor diversification need

---

## 📐 Architecture Constraints (LOCKED)

**Microservices:**
- `packages/gateway` (existing)
- `packages/mca` (existing, add implementer node)
- `packages/planner` (existing)
- `packages/implementer` (NEW)
- `packages/vfs` (NEW - library, not service)
- `packages/shared` (existing, add VFS interface)

**Contracts:**
- Implementer request: `{ execId: string, plan: Plan }` (where Plan = output from Planner)
- Implementer response: `{ ok: boolean, files: string[], error?: string }`
- SSE events: `edit.start`, `edit.complete`, `tool_call` (with delta streaming)

**Zero-Trust:**
- Implementer self-reports file count
- Runner will independently verify files exist and compile
- Validator will independently run tests (Week 5-6)

---

## 🔄 Iteration Protocol

If any gate fails:
1. **Diagnose** (read logs/evidence)
2. **Fix** (code/config, not architecture)
3. **Retry** (re-run gate validation)
4. **Save evidence** under `.automation/evidence/week3/iterations/`
5. Repeat up to 3 attempts
6. After 3 failures: escalate with artifacts

---

## 🎓 References (READ BEFORE WORK)

- [VERTICAL_1_PLAN.md](VERTICAL_1_PLAN.md) (Week 3-4 section)
- [ARCHITECTURE_DECISION.md](ARCHITECTURE_DECISION.md) (Smart MCA + Smart Specialists)
- [VERTICAL_1_TOOLING.md](VERTICAL_1_TOOLING.md) (OpenAI Function Calling examples)
- [AGENTS.md](../../AGENTS.md) (Iteration protocol, forbidden patterns)
- [CONSTITUTION.md](../../CONSTITUTION.md) (Battle-tested tools, production from line 1)

---

## 🚀 Implementation Tasks (11 tasks)

### Phase 1: VFS (Days 1-2)

1. Create `packages/vfs/src/interface.ts` - VFS TypeScript interface
2. Create `packages/vfs/src/minio.ts` - MinIO-backed implementation with versioning
3. Create `packages/vfs/src/__tests__/vfs.test.ts` - Tests (create/read/list/version) using unique MinIO prefixes
4. Add VFS to `packages/shared/src/vfs.ts` - Export factory function

### Phase 2: Implementer (Days 3-6)

6. Create `packages/implementer/src/server.ts` - Express server with POST /implement
7. Create `packages/implementer/src/agent.ts` - OpenAI Function Calling logic
8. Create `packages/implementer/src/tools.ts` - Tool definitions (view, create, str_replace, insert)
9. Create `packages/implementer/src/__tests__/agent.test.ts` - Unit tests with mock OpenAI
10. Add Langfuse tracing to implementer agent

### Phase 3: SSE + MCA Integration (Days 7-10)

11. Update `packages/mca/src/server.ts` - Add implementer node, wire planner → implementer
12. Update `packages/gateway/src/server.ts` - Enhance SSE to stream edit events from Redis
13. Create `packages/implementer/src/publisher.ts` - Publish edit events to Redis Stream
14. Create `.automation/evidence/week3/collect_evidence.sh` - Automated gate validation
15. Test end-to-end flow, iterate to green

---

## ⚖️ Definition of Done (Week 3-4 Complete When)

- [ ] All 6 gates PASS
- [ ] Evidence artifacts generated and committed
- [ ] No lint/type/test errors
- [ ] Coverage ≥ 80% across all packages
- [ ] End-to-end flow: `POST /executions` → code in MinIO with SSE streaming
- [ ] Week 3-4 summary shows all PASS in WEEK3_SUMMARY.md
