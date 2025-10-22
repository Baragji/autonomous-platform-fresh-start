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

