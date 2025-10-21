# Week 2: Gateway + MCA + Planner DoD (Definition of Done)

**Status:** READY TO EXECUTE  
**Duration:** 4–5 days  
**Phase:** Vertical Slice #1 – Week 2  
**Constitutional Authority:** CONSTITUTION.md Articles I, V, VI, IX

---

## 🎯 Mission

Outcome: A user can POST an execution request; Gateway accepts (202), MCA persists state via Postgres checkpointer, Planner returns a valid plan saved to MinIO, and observability captures traces and LLM costs.

Success = All gates PASS (binary). No subjective evaluation.

---

## 📋 Acceptance Criteria (BINARY GATES — Must ALL Pass)

### G1-API: Gateway Endpoints Operational

```bash
# 1) POST /executions → 202 Accepted + Location + JSON { id }
EXEC=$(curl -s -D - -o >(tee .automation/evidence/week2/http_202_headers.txt) \
  -X POST http://localhost:3000/api/executions \
  -H 'Content-Type: application/json' \
  -d '{"intent":"Build a TODO API with tests"}') && \
  echo "$EXEC" | tee .automation/evidence/week2/http_202_body.json

# Extract exec id
EXEC_ID=$(echo "$EXEC" | jq -r '.id') && \
  echo "$EXEC_ID" > .automation/evidence/week2/exec_id.txt

# 2) GET /executions/:id → 200 + JSON status
curl -s http://localhost:3000/api/executions/$EXEC_ID | \
  tee .automation/evidence/week2/get_execution.json | jq -e '.status' >/dev/null

# 3) GET /executions/:id/stream (SSE) → receives at least one event line in <5s
curl -sN --max-time 5 http://localhost:3000/api/executions/$EXEC_ID/stream | \
  tee .automation/evidence/week2/stream_sse.txt | head -n 1 | grep -qiE 'event:|data:'
```

PASS Criteria:
- 202 returned with `Location` header and JSON body containing `.id`.
- GET returns 200 with `.status` present.
- SSE stream yields at least one `event:` or `data:` line.

FAIL Criteria:
- Non-202 on POST; missing `Location` or `.id`.
- GET non-200 or missing `.status`.
- SSE ends without any `event`/`data` line.

---

### G2-DB: Checkpointer + Executions Persisted (Postgres)

```bash
# Must show at least 1 row for executions.id == $EXEC_ID
docker exec umca-postgres psql -U umca -d umca -c \
  "SELECT id, status, created_at FROM executions WHERE id='$EXEC_ID';" \
  | tee .automation/evidence/week2/db_execution.txt

# Must show at least 1 checkpoint row for thread_id == $EXEC_ID (or configured thread id)
docker exec umca-postgres psql -U umca -d umca -c \
  "SELECT thread_id, checkpoint_id, created_at FROM checkpoints WHERE thread_id='$EXEC_ID' LIMIT 1;" \
  | tee .automation/evidence/week2/db_checkpoint.txt
```

PASS Criteria:
- Row exists in `executions` with matching `id`.
- At least one row in `checkpoints` for the execution’s thread.

FAIL Criteria:
- No matching `executions` row.
- No `checkpoints` entry.

---

### G3-PLAN: Planner Output Stored in MinIO with Valid Shape

```bash
# Configure mc via container, then verify artifact exists and shape is valid
NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{printf "%s" $k}}{{end}}' umca-minio)
MC_ENV=("-e" "MC_HOST_local=http://minioadmin:minioadmin123@umca-minio:9000")

# Expect object: local/umca-artifacts/$EXEC_ID/plan.json
docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc ls local/umca-artifacts/$EXEC_ID/ | \
  tee .automation/evidence/week2/minio_ls.txt | grep -q 'plan.json'

docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc cat local/umca-artifacts/$EXEC_ID/plan.json \
  | tee .automation/evidence/week2/plan.json | jq -e '.tasks and .acceptance_criteria' >/dev/null
```

PASS Criteria:
- `plan.json` present under `$EXEC_ID/` in `umca-artifacts`.
- JSON contains `tasks` (array) and `acceptance_criteria` (array/string list).

FAIL Criteria:
- Missing object.
- Invalid/malformed JSON or missing required keys.

---

### G4-TRACE: Tracing Visible (OTel → Tempo → Grafana)

```bash
# Tempo ready
curl -s http://localhost:3200/ready | tee .automation/evidence/week2/tempo_ready.txt | grep -q "ready"

# Grafana API health
curl -s http://localhost:3001/api/health | tee .automation/evidence/week2/grafana_health.json | jq -e '.database=="ok"' >/dev/null
```

PASS Criteria:
- Tempo returns `ready`.
- Grafana health shows `database: ok`.
- Additionally, a trace for the execution is expected to be viewable in Grafana (manual confirm acceptable for Week 2).

FAIL Criteria:
- Tempo not ready or Grafana health fails.

---

### G5-LANGFUSE: LLM Cost Tracking Present

```bash
# Environment keys present
grep -q "LANGFUSE_PUBLIC_KEY" .env && grep -q "LANGFUSE_SECRET_KEY" .env && echo OK | \
  tee .automation/evidence/week2/langfuse_env.txt

# (If app logs emit Langfuse traces) capture a run’s log and check for flush/usage lines
# cat app.log | grep -i langfuse | tee .automation/evidence/week2/langfuse_log.txt || true
```

PASS Criteria:
- Langfuse keys configured in environment.
- When available, execution emits usage to Langfuse (manual confirmation acceptable for Week 2).

FAIL Criteria:
- Missing required keys or misconfigured exporter.

---

### G6-QUALITY: Lint, Types, Planner Unit Tests

```bash
# Run from repo root; commands must exist in package.json scripts
npm run lint       | tee .automation/evidence/week2/lint.txt
npm run typecheck  | tee .automation/evidence/week2/typecheck.txt
npm test -- --reporter=json --coverage \
  | tee .automation/evidence/week2/tests.json
```

PASS Criteria:
- Lint exit code 0; Types exit code 0.
- Tests exit code 0; line coverage ≥ 80%.

FAIL Criteria:
- Non-zero exits or coverage < 80%.

---

## 📊 Evidence Requirements

Create `.automation/evidence/week2/` containing:

```
.automation/evidence/week2/
  http_202_headers.txt
  http_202_body.json
  exec_id.txt
  get_execution.json
  stream_sse.txt
  db_execution.txt
  db_checkpoint.txt
  minio_ls.txt
  plan.json
  tempo_ready.txt
  grafana_health.json
  langfuse_env.txt
  lint.txt
  typecheck.txt
  tests.json
  WEEK2_SUMMARY.md
```

Summary template:

```bash
cat > .automation/evidence/week2/WEEK2_SUMMARY.md <<EOF
# Week 2 Evidence Summary

- G1-API: $(grep -q 202 .automation/evidence/week2/http_202_headers.txt && echo PASS || echo FAIL)
- G2-DB: $(grep -q "$EXEC_ID" .automation/evidence/week2/db_execution.txt && grep -q "$EXEC_ID" .automation/evidence/week2/db_checkpoint.txt && echo PASS || echo FAIL)
- G3-PLAN: $(jq -e '.tasks and .acceptance_criteria' .automation/evidence/week2/plan.json >/dev/null && echo PASS || echo FAIL)
- G4-TRACE: $(grep -q ready .automation/evidence/week2/tempo_ready.txt && jq -e '.database=="ok"' .automation/evidence/week2/grafana_health.json >/dev/null && echo PASS || echo FAIL)
- G5-LANGFUSE: $(grep -q LANGFUSE_PUBLIC_KEY .env && grep -q LANGFUSE_SECRET_KEY .env && echo PASS || echo FAIL)
- G6-QUALITY: $(grep -qi 'no problems' .automation/evidence/week2/lint.txt && grep -qi 'found 0 errors' .automation/evidence/week2/typecheck.txt && jq -e '.stats.failures==0' .automation/evidence/week2/tests.json >/dev/null && echo PASS || echo FAIL)

Timestamp: $(date -Iseconds)
EOF
```

---

## 🛠️ Required Tools & Stack (LOCKED)

- OpenAI-only LLM (Planner) with Structured Outputs; `openai` SDK + Zod.
- LangGraph JS + Postgres checkpointer for MCA state.
- Redis Streams (bus), MinIO (artifacts), OTel → Tempo → Grafana (observability), Langfuse (costs).
- TypeScript/Node.js 20+; no Anthropic.

---

## 📐 Architecture Constraints (LOCKED)

- Microservices in monorepo (Turborepo). Services: `packages/gateway`, `packages/mca`, `packages/planner`.
- Contracts-first for new APIs (OpenAPI 3.1 where applicable).
- Zero-Trust: Planner output validated independently (schema) and stored; MCA does not trust self-reports.

---

## 🔄 Iteration Protocol

If any gate fails:
1) Diagnose (read logs/evidence) → 2) Fix (code/config, not architecture) → 3) Retry → 4) Save evidence under `.automation/evidence/week2/iterations/` → 5) Repeat up to 3 attempts; then escalate with artifacts.

---

## 🎓 References (READ BEFORE WORK)

- docs/11_211025/VERTICAL_1_PLAN.md (Week 2 section)
- docs/11_211025/ARCHITECTURE_DECISION.md (Smart MCA rationale)
- docs/11_211025/VERTICAL_1_TOOLING.md (OpenAI, LangGraph, E2B)
- AGENTS.md (Critical Rules, Iteration Protocol)

