#!/usr/bin/env bash
set -uo pipefail
trap 'echo "Error on line $LINENO"' ERR

# Write artifacts into a subfolder to avoid deleting this script on reruns
BASE_DIR=".automation/evidence/week3"
EVID="${BASE_DIR}/out"
rm -rf "$EVID"
mkdir -p "$EVID"

DEFAULT_GATEWAY_PORT="${GATEWAY_PORT:-3030}"
GATEWAY_ORIGIN="${GATEWAY_ORIGIN:-http://localhost:${DEFAULT_GATEWAY_PORT}}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-umca}"
POSTGRES_DB="${POSTGRES_DB:-umca}"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin123}"
MINIO_BUCKET="${MINIO_BUCKET:-umca-artifacts}"

# G1 — API
EXEC_RESPONSE=$(curl -s -D "$EVID/http_202_headers.txt" -H 'Content-Type: application/json' \
  -X POST "$GATEWAY_ORIGIN/api/executions" -d '{"intent":"Build a TODO API with tests"}')
printf "%s" "$EXEC_RESPONSE" | tee "$EVID/http_202_body.json" >/dev/null
EXEC_ID=$(printf "%s" "$EXEC_RESPONSE" | jq -r '.id')
printf "%s" "$EXEC_ID" > "$EVID/exec_id.txt"

# Extract HTTP status code from headers (handles HTTP/1.1 and HTTP/2)
HEAD_STATUS_CODE=""
if [ -s "$EVID/http_202_headers.txt" ]; then
  # First line typically: HTTP/1.1 202 Accepted or HTTP/2 202
  HEAD_STATUS_CODE=$(awk 'NR==1 {print $2}' "$EVID/http_202_headers.txt" 2>/dev/null || true)
  if [ -z "$HEAD_STATUS_CODE" ]; then
    # Fallback: look for a 3-digit code anywhere
    HEAD_STATUS_CODE=$(grep -m1 -Eo ' [0-9]{3} ' "$EVID/http_202_headers.txt" | tr -d ' ' || true)
  fi
fi

# Optional debug
if [ -n "${DEBUG_EVIDENCE:-}" ]; then
  echo "--- http_202_headers.txt"; cat "$EVID/http_202_headers.txt" || true
  echo "--- http_202_body.json"; cat "$EVID/http_202_body.json" || true
fi

# Poll the execution API until it reaches planned (up to ~30s)
ATTEMPTS=30
DELAY=1
POLLED_STATUS=""
for i in $(seq 1 $ATTEMPTS); do
  if ! curl -s "$GATEWAY_ORIGIN/api/executions/$EXEC_ID" | tee "$EVID/get_execution.json" >/dev/null; then
    echo "Failed to fetch execution status (attempt $i/$ATTEMPTS)"
    sleep $DELAY
    continue
  fi
  POLLED_STATUS=$(jq -r '.status // ""' "$EVID/get_execution.json" 2>/dev/null || echo "")
  # Accept any forward progress beyond planning to avoid race conditions
  if jq -e '.status == "planned" or .status == "implementing" or .status == "implemented" or .status == "tested"' "$EVID/get_execution.json" >/dev/null 2>&1; then
    break
  fi
  sleep $DELAY
done

# Optional: try to capture some SSE lines without making PASS contingent on it
curl -sN --max-time 5 "$GATEWAY_ORIGIN/api/executions/$EXEC_ID/stream" | tee "$EVID/stream_sse.txt" >/dev/null || true

# G2 — Database (wait for execution + checkpoint)
DB_EXEC_TMP="$EVID/.db_execution.tmp"
DB_CHECK_TMP="$EVID/.db_checkpoint.tmp"

for attempt in {1..30}; do
  PGPASSWORD=umcapassword psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
    "SELECT id, status, created_at FROM executions WHERE id='$EXEC_ID';" > "$DB_EXEC_TMP" 2>/dev/null && break
  sleep 2
done
mv "$DB_EXEC_TMP" "$EVID/db_execution.txt" 2>/dev/null || echo "" > "$EVID/db_execution.txt"

STATUS_PLANNED=$(grep -c "planned" "$EVID/db_execution.txt" 2>/dev/null || echo 0)
if [ "$STATUS_PLANNED" -eq 0 ]; then
  for attempt in {1..30}; do
    PGPASSWORD=umcapassword psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
      "SELECT id, status, created_at FROM executions WHERE id='$EXEC_ID';" > "$DB_EXEC_TMP" 2>/dev/null
    mv "$DB_EXEC_TMP" "$EVID/db_execution.txt" 2>/dev/null || true
    if grep -q "planned" "$EVID/db_execution.txt" 2>/dev/null; then
      break
    fi
    sleep 2
  done
fi

for attempt in {1..30}; do
  PGPASSWORD=umcapassword psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
    "SELECT thread_id, checkpoint_id, created_at FROM checkpoints WHERE thread_id='$EXEC_ID' LIMIT 1;" > "$DB_CHECK_TMP" 2>/dev/null
  mv "$DB_CHECK_TMP" "$EVID/db_checkpoint.txt" 2>/dev/null || true
  if grep -q "$EXEC_ID" "$EVID/db_checkpoint.txt" 2>/dev/null; then
    break
  fi
  sleep 2
done

# G3 — Plan artifact (wait for MinIO object) - use mc client directly
MC_ALIAS="local"
MC_HOST=$(echo "$MINIO_ENDPOINT" | sed 's|http://||')
if command -v mc >/dev/null 2>&1; then
  mc alias set "$MC_ALIAS" "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null 2>&1 || true
  for attempt in {1..30}; do
    if mc ls "${MC_ALIAS}/${MINIO_BUCKET}/$EXEC_ID/" > "$EVID/minio_ls.txt" 2>/dev/null \
      && grep -q 'plan.json' "$EVID/minio_ls.txt"; then
      break
    fi
    sleep 2
  done
  mc cat "${MC_ALIAS}/${MINIO_BUCKET}/$EXEC_ID/plan.json" > "$EVID/plan.json" 2>/dev/null || echo '{}' > "$EVID/plan.json"
else
  # Fallback: use curl to check MinIO
  for attempt in {1..30}; do
    if curl -s "$MINIO_ENDPOINT/${MINIO_BUCKET}/$EXEC_ID/plan.json" > "$EVID/plan.json" 2>/dev/null \
      && [ -s "$EVID/plan.json" ]; then
      echo "plan.json" > "$EVID/minio_ls.txt"
      break
    fi
    sleep 2
  done
fi

# G4 — Observability
curl -s http://localhost:3200/ready | tee "$EVID/tempo_ready.txt" >/dev/null
curl -s http://localhost:3001/api/health | tee "$EVID/grafana_health.json" >/dev/null

# G5 — Langfuse env (accept keys from environment OR .env)
if [ -n "${LANGFUSE_PUBLIC_KEY:-}" ] && [ -n "${LANGFUSE_SECRET_KEY:-}" ]; then
  echo OK > "$EVID/langfuse_env.txt"
else
  if [ -f .env ]; then
    (grep -q "LANGFUSE_PUBLIC_KEY" .env && grep -q "LANGFUSE_SECRET_KEY" .env && echo OK > "$EVID/langfuse_env.txt") || echo FAIL > "$EVID/langfuse_env.txt"
  else
    echo FAIL > "$EVID/langfuse_env.txt"
  fi
fi

# G6 — Quality
set +e
npm run lint > "$EVID/lint.txt" 2>&1; LINT_RC=$?
npm run typecheck > "$EVID/typecheck.txt" 2>&1; TYPE_RC=$?
rm -rf coverage
# Capture full JSON test output and the correct test exit code
npm test -- --reporter=json --coverage > "$EVID/tests.json.full" 2>&1; TEST_RC=$?
# Extract the JSON line from the mixed output reliably
grep -m1 '^{"numTotalTestSuites"' "$EVID/tests.json.full" > "$EVID/tests.json" || echo '{}' > "$EVID/tests.json"
set -e

if [ -f coverage/coverage-summary.json ]; then
  cp coverage/coverage-summary.json "$EVID/coverage-summary.json"
  COVERAGE=$(jq -r '.total.lines.pct // 0' coverage/coverage-summary.json)
else
  COVERAGE=0
fi

TEST_SUCCESS=$(jq -r '.success // false' "$EVID/tests.json" 2>/dev/null || echo false)
COVERAGE=${COVERAGE:-0}

G1=$({ { [ "$HEAD_STATUS_CODE" = "202" ] || [ "$HEAD_STATUS_CODE" = "200" ]; } \
  && jq -e '.status == "planned" or .status == "implementing" or .status == "implemented" or .status == "tested"' "$EVID/get_execution.json" >/dev/null; } \
  && echo PASS || echo FAIL)
G2=$(grep -q "$EXEC_ID" "$EVID/db_execution.txt" && grep -q "$EXEC_ID" "$EVID/db_checkpoint.txt" && echo PASS || echo FAIL)
G3=$(grep -q 'plan.json' "$EVID/minio_ls.txt" && jq -e '.tasks and .acceptance_criteria' "$EVID/plan.json" >/dev/null && echo PASS || echo FAIL)
G4=$(grep -q ready "$EVID/tempo_ready.txt" && jq -e '.database=="ok"' "$EVID/grafana_health.json" >/dev/null && echo PASS || echo FAIL)
G5=$(grep -q OK "$EVID/langfuse_env.txt" && echo PASS || echo FAIL)

if [ "$LINT_RC" -eq 0 ] && [ "$TYPE_RC" -eq 0 ] && [ "$TEST_RC" -eq 0 ] && [ "$TEST_SUCCESS" = true ] && awk -v cov="$COVERAGE" 'BEGIN { exit !(cov + 0 >= 80) }'; then
  G6=PASS
else
  G6=FAIL
fi

# Write summary at a stable location under week3 root
cat > "${BASE_DIR}/WEEK3_SUMMARY.md" <<EOF
# Week 3 Evidence Summary

- G1-API: $G1
- G2-DB: $G2
- G3-PLAN: $G3
- G4-TRACE: $G4
- G5-LANGFUSE: $G5
- G6-QUALITY: $G6

Execution ID: $EXEC_ID
HTTP Status (POST /api/executions): ${HEAD_STATUS_CODE:-unknown}
Polled Status (GET /api/executions/:id): ${POLLED_STATUS:-unknown}
Timestamp: $(date -Iseconds)
EOF
