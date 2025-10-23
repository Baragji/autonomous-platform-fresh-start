#!/usr/bin/env bash
set -euo pipefail

# Week 3-4 Evidence Collector — Implements G1..G6 from WEEK_3_4_DOD.md
# Outputs evidence under .automation/evidence/week3/out and a summary under WEEK3_SUMMARY.md

BASE_DIR=".automation/evidence/week3"
EVID="${BASE_DIR}/out"
rm -rf "$EVID" && mkdir -p "$EVID"

DEFAULT_GATEWAY_PORT="${GATEWAY_PORT:-3030}"
DEFAULT_MCA_PORT="${MCA_PORT:-7010}"
DEFAULT_PLANNER_PORT="${PLANNER_PORT:-7020}"
DEFAULT_IMPL_PORT="${IMPLEMENTER_PORT:-7030}"
GATEWAY_ORIGIN="${GATEWAY_ORIGIN:-http://localhost:${DEFAULT_GATEWAY_PORT}}"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-umca-postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-umca-minio}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin123}"
MINIO_BUCKET="${MINIO_BUCKET:-umca-artifacts}"

PASS=PASS
FAIL=FAIL

###############################################################################
# G1 — VFS tests (MinIO-backed)
###############################################################################
set +e
npm --prefix packages/vfs test -- --reporter=json --coverage > "$EVID/vfs.tests.json.full" 2>&1
VFS_RC=$?
grep -m1 '^{"numTotalTestSuites"' "$EVID/vfs.tests.json.full" > "$EVID/vfs.tests.json" || echo '{}' > "$EVID/vfs.tests.json"
VFS_SUCCESS=$(jq -r '.success // false' "$EVID/vfs.tests.json" 2>/dev/null || echo false)
set -e
if [ "$VFS_RC" -eq 0 ] && [ "$VFS_SUCCESS" = true ]; then G1=$PASS; else G1=$FAIL; fi

###############################################################################
# G2 — Implementer generates code into MinIO with valid TS
###############################################################################
EXEC_ID=$(uuidgen)
printf "%s" "$EXEC_ID" > "$EVID/exec_id.txt"
curl -s -X POST "http://localhost:${DEFAULT_IMPL_PORT}/implement" \
  -H 'Content-Type: application/json' \
  -d "{\"execId\": \"$EXEC_ID\", \"plan\": { \"tasks\": [{ \"id\": \"1\", \"title\": \"Create TODO API\", \"description\": \"Build Express.js API with GET/POST /todos\" }] } }" \
  | tee "$EVID/implementer_response.json" >/dev/null

NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{printf "%s" $k}}{{end}}' "$MINIO_CONTAINER")
MC_ENV=("-e" "MC_HOST_local=http://$MINIO_ACCESS_KEY:$MINIO_SECRET_KEY@${MINIO_CONTAINER}:9000")

docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc ls local/${MINIO_BUCKET}/$EXEC_ID/code/ > "$EVID/minio_code_ls.txt" 2>/dev/null || true

# fetch app.ts for tsc validation if present
docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc cat local/${MINIO_BUCKET}/$EXEC_ID/code/src/app.ts > "$EVID/app.ts" 2>/dev/null || true
set +e
if [ -s "$EVID/app.ts" ]; then
  npx -y tsc --noEmit --pretty false --project /dev/null --stdin < "$EVID/app.ts" > "$EVID/app_ts_syntax_check.txt" 2>&1
  TSC_RC=$?
else
  echo "app.ts missing" > "$EVID/app_ts_syntax_check.txt"; TSC_RC=1
fi
set -e

OK_IMPL_RESP=$(jq -e '.ok == true' "$EVID/implementer_response.json" >/dev/null 2>&1 && echo 1 || echo 0)
OK_MINIO=$(grep -Eq '(app\.ts|app\.test\.ts)' "$EVID/minio_code_ls.txt" && echo 1 || echo 0)
if [ "$OK_IMPL_RESP" = 1 ] && [ "$OK_MINIO" = 1 ] && [ "$TSC_RC" -eq 0 ]; then G2=$PASS; else G2=$FAIL; fi

###############################################################################
# G3 — SSE: edit events during implementation
###############################################################################
curl -sN --max-time 15 "$GATEWAY_ORIGIN/api/executions/$EXEC_ID/stream" | tee "$EVID/stream_edits.txt" >/dev/null || true
if grep -q 'event: edit.start' "$EVID/stream_edits.txt" && grep -q 'event: edit.complete' "$EVID/stream_edits.txt" && grep -q 'tool_call' "$EVID/stream_edits.txt"; then
  G3=$PASS
else
  G3=$FAIL
fi

###############################################################################
# G4 — MCA end-to-end Planner → Implementer flow
###############################################################################
GATEWAY_EXEC=$(curl -s -X POST "$GATEWAY_ORIGIN/api/executions" -H 'Content-Type: application/json' -d '{"intent":"Build a TODO API with GET and POST endpoints"}')
printf "%s" "$GATEWAY_EXEC" > "$EVID/gateway_response.json"
G4_EXEC_ID=$(printf "%s" "$GATEWAY_EXEC" | jq -r '.id')
echo "$G4_EXEC_ID" > "$EVID/g4_exec_id.txt"

for i in {1..30}; do
  STATUS=$(curl -s "$GATEWAY_ORIGIN/api/executions/$G4_EXEC_ID" | jq -r '.status')
  echo "Attempt $i: status=$STATUS" | tee -a "$EVID/mca_flow.txt" >/dev/null
  if [ "$STATUS" = "implemented" ]; then echo PASS >> "$EVID/mca_flow.txt"; break; fi
  sleep 2
done

docker exec "$POSTGRES_CONTAINER" psql -U umca -d umca -c \
  "SELECT thread_id, checkpoint_id FROM checkpoints WHERE thread_id='$G4_EXEC_ID' AND checkpoint LIKE '%implementer%' LIMIT 1;" \
  > "$EVID/checkpoint_implementer.txt" 2>&1 || true

if grep -q "implemented" "$EVID/mca_flow.txt" && grep -q "$G4_EXEC_ID" "$EVID/checkpoint_implementer.txt"; then
  G4=$PASS
else
  G4=$FAIL
fi

###############################################################################
# G5 — Observability
###############################################################################
curl -s http://localhost:3200/ready | tee "$EVID/tempo_ready.txt" >/dev/null
curl -s http://localhost:3001/api/health | tee "$EVID/grafana_health.json" >/dev/null
if grep -q ready "$EVID/tempo_ready.txt" && jq -e '.database=="ok"' "$EVID/grafana_health.json" >/dev/null; then
  G5=$PASS
else
  G5=$FAIL
fi

###############################################################################
# G6 — Quality gates (lint, types, tests, coverage >=80%)
###############################################################################
set +e
npm run lint > "$EVID/lint.txt" 2>&1; LINT_RC=$?
npm run typecheck > "$EVID/typecheck.txt" 2>&1; TYPE_RC=$?
rm -rf coverage
npm test -- --reporter=json --coverage > "$EVID/tests.json.full" 2>&1; TEST_RC=$?
grep -m1 '^{"numTotalTestSuites"' "$EVID/tests.json.full" > "$EVID/tests.json" || echo '{}' > "$EVID/tests.json"
set -e
TEST_SUCCESS=$(jq -r '.success // false' "$EVID/tests.json" 2>/dev/null || echo false)
if [ -f coverage/coverage-summary.json ]; then
  cp coverage/coverage-summary.json "$EVID/coverage-summary.json"
  COVERAGE=$(jq -r '.total.lines.pct // 0' coverage/coverage-summary.json)
else
  COVERAGE=0
fi

if [ "$LINT_RC" -eq 0 ] && [ "$TYPE_RC" -eq 0 ] && [ "$TEST_RC" -eq 0 ] && [ "$TEST_SUCCESS" = true ] && awk -v cov="$COVERAGE" 'BEGIN { exit !(cov + 0 >= 80) }'; then
  G6=$PASS
else
  G6=$FAIL
fi

###############################################################################
# Summary
###############################################################################
cat > "${BASE_DIR}/WEEK3_SUMMARY.md" <<EOF
# Week 3-4 Evidence Summary

- G1-VFS: $G1
- G2-IMPLEMENTER: $G2
- G3-SSE: $G3
- G4-MCA: $G4
- G5-TRACE: $G5
- G6-QUALITY: $G6

Execution ID: $EXEC_ID
Timestamp: $(date -Iseconds)
EOF

if [ -n "${DEBUG_EVIDENCE:-}" ]; then
  echo "--- SUMMARY"; cat "${BASE_DIR}/WEEK3_SUMMARY.md" || true
fi

# Exit non-zero if any FAIL to signal CI job failure
if grep -q "FAIL" "${BASE_DIR}/WEEK3_SUMMARY.md"; then
  echo "Week3 smoke failed"; exit 1; fi
#!/usr/bin/env bash
set -euo pipefail

BASE_DIR=".automation/evidence/week3"
RUN_DIR="${BASE_DIR}/run"
VALID_DIR="${BASE_DIR}/valid"
rm -rf "$RUN_DIR" "$VALID_DIR"
mkdir -p "$RUN_DIR" "$VALID_DIR"

DEFAULT_GATEWAY_PORT="${GATEWAY_PORT:-3030}"
GATEWAY_ORIGIN="${GATEWAY_ORIGIN:-http://localhost:${DEFAULT_GATEWAY_PORT}}"
IMPLEMENTER_URL="${IMPLEMENTER_URL:-http://localhost:7030/implement}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-umca-postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-umca-minio}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin123}"
MINIO_BUCKET="${MINIO_BUCKET:-umca-artifacts}"

node -v >"${BASE_DIR}/env.txt"
npm -v >>"${BASE_DIR}/env.txt"
git rev-parse HEAD >>"${BASE_DIR}/env.txt"

echo '{}' >"${BASE_DIR}/baseline.json"

echo '# Week 3-4 Evidence Summary

- G1-VFS: TBD
- G2-IMPLEMENTER: TBD
- G3-SSE: TBD
- G4-MCA: TBD
- G5-TRACE: TBD
- G6-QUALITY: TBD

Execution ID: 
Timestamp: ' >"${BASE_DIR}/WEEK3_SUMMARY.md"

REQUEST_PAYLOAD='{"intent":"Generate hello world web app"}'
HTTP_HEADERS_FILE="${RUN_DIR}/gateway_headers.txt"
GATEWAY_RESPONSE_FILE="${BASE_DIR}/gateway_response.json"

curl -s -D "$HTTP_HEADERS_FILE" -H 'Content-Type: application/json' \
  -X POST "$GATEWAY_ORIGIN/api/executions" -d "$REQUEST_PAYLOAD" \
  | tee "$GATEWAY_RESPONSE_FILE" >/dev/null

EXEC_ID=$(jq -r '.id' "$GATEWAY_RESPONSE_FILE")
if [ -z "$EXEC_ID" ] || [ "$EXEC_ID" = "null" ]; then
  echo "Failed to obtain execution id" >&2
  exit 1
fi

echo "Execution ID: $EXEC_ID" >>"${BASE_DIR}/WEEK3_SUMMARY.md"

STREAM_FILE="${BASE_DIR}/stream_edits.txt"
if command -v timeout >/dev/null 2>&1; then
  timeout 60 curl -sN "$GATEWAY_ORIGIN/api/executions/$EXEC_ID/stream" | tee "$STREAM_FILE" >/dev/null || true
else
  curl -sN --max-time 60 "$GATEWAY_ORIGIN/api/executions/$EXEC_ID/stream" | tee "$STREAM_FILE" >/dev/null || true
fi

STATUS_FILE="${RUN_DIR}/execution_status.json"
for attempt in {1..60}; do
  curl -s "$GATEWAY_ORIGIN/api/executions/$EXEC_ID" | tee "$STATUS_FILE" >/dev/null
  STATE=$(jq -r '.status' "$STATUS_FILE")
  if [ "$STATE" = "implemented" ] || [ "$STATE" = "failed" ]; then
    break
  fi
  sleep 2
done
cp "$STATUS_FILE" "${BASE_DIR}/final.json"

CHECK_FILE="${BASE_DIR}/checkpoint_implementer.txt"
docker exec "$POSTGRES_CONTAINER" psql -U umca -d umca -c \
  "SELECT thread_id, checkpoint_id, created_at FROM checkpoints WHERE thread_id='$EXEC_ID' ORDER BY created_at DESC LIMIT 10;" \
  >"$CHECK_FILE" || true

FLOW_FILE="${BASE_DIR}/mca_flow.txt"
docker exec "$POSTGRES_CONTAINER" psql -U umca -d umca -c \
  "SELECT thread_id, values->>'current_agent' AS current_agent, values->>'status' AS status FROM langgraph_state WHERE thread_id='$EXEC_ID';" \
  >"$FLOW_FILE" || true

NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{printf "%s" $k}}{{end}}' "$MINIO_CONTAINER")
MC_ENV=("-e" "MC_HOST_local=http://$MINIO_ACCESS_KEY:$MINIO_SECRET_KEY@${MINIO_CONTAINER}:9000")
PLAN_PATH="${RUN_DIR}/plan.json"
docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc cat "local/${MINIO_BUCKET}/${EXEC_ID}/plan.json" \
  | tee "$PLAN_PATH" >/dev/null || true

docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc ls "local/${MINIO_BUCKET}/${EXEC_ID}/code/" \
  | tee "${BASE_DIR}/minio_code_ls.txt" >/dev/null || true

if [ -f "$PLAN_PATH" ]; then
  IMPLEMENTER_PAYLOAD=$(jq -c "{execId: \"${EXEC_ID}-validation\", plan: .}" "$PLAN_PATH")
  curl -s -H 'Content-Type: application/json' -X POST "$IMPLEMENTER_URL" -d "$IMPLEMENTER_PAYLOAD" \
    | tee "${BASE_DIR}/implementer_response.json" >/dev/null || true
fi

APP_FILE="${RUN_DIR}/app.ts"
if docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc cat "local/${MINIO_BUCKET}/${EXEC_ID}/code/src/app.ts" >/dev/null 2>&1; then
  docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc cat "local/${MINIO_BUCKET}/${EXEC_ID}/code/src/app.ts" >"$APP_FILE"
  npx tsc --noEmit "$APP_FILE" >"${BASE_DIR}/app_ts_syntax_check.txt" 2>&1 || true
else
  echo 'app.ts not generated' >"${BASE_DIR}/app_ts_syntax_check.txt"
fi

curl -s http://localhost:3200/ready | tee "${BASE_DIR}/tempo_ready.txt" >/dev/null || true
curl -s http://localhost:3001/api/health | tee "${BASE_DIR}/grafana_health.json" >/dev/null || true

npm run lint >"${VALID_DIR}/lint.txt" 2>&1 || true
npm run typecheck >"${VALID_DIR}/typecheck.txt" 2>&1 || true
rm -rf coverage
npm test -- --reporter=json --coverage >"${VALID_DIR}/tests.full" 2>&1 || true
grep -m1 '^{"numTotalTestSuites"' "${VALID_DIR}/tests.full" >"${VALID_DIR}/tests.json" || echo '{}' >"${VALID_DIR}/tests.json"
[ -f coverage/coverage-summary.json ] && cp coverage/coverage-summary.json "${VALID_DIR}/coverage.json"

echo '{"artifacts":[]}' >"${BASE_DIR}/task_provenance.json"
echo '{}' >"${BASE_DIR}/audit.json"

if command -v sha256sum >/dev/null 2>&1; then
  find "$BASE_DIR" -type f ! -name 'artifacts.sha256' -print0 \
    | sort -z \
    | xargs -0 sha256sum >"${BASE_DIR}/artifacts.sha256"
fi

