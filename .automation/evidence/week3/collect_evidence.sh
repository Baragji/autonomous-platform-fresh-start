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
  -d "{\"execId\": \"$EXEC_ID\", \"plan\": { \"tasks\": [{\"id\":\"1\",\"title\":\"Setup project\",\"description\":\"Create package.json and TypeScript config\",\"dependsOn\":[]},{\"id\":\"2\",\"title\":\"Implement API\",\"description\":\"Build Express API with GET/POST /todos in src/app.ts\",\"dependsOn\":[\"1\"]}], \"acceptance_criteria\": [\"API must respond to GET /todos\",\"API must accept POST /todos\"] } }" \
  | tee "$EVID/implementer_response.json" >/dev/null

NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{printf "%s" $k}}{{end}}' "$MINIO_CONTAINER")
MC_ENV=("-e" "MC_HOST_local=http://$MINIO_ACCESS_KEY:$MINIO_SECRET_KEY@${MINIO_CONTAINER}:9000")

docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc ls --recursive local/${MINIO_BUCKET}/$EXEC_ID/code/ > "$EVID/minio_code_ls.txt" 2>/dev/null || true

# fetch app.ts for tsc validation if present (tools return paths with code/ prefix, so actual path is code/code/src/app.ts)
docker run --rm --network "$NET" "${MC_ENV[@]}" minio/mc cat local/${MINIO_BUCKET}/$EXEC_ID/code/code/src/app.ts > "$EVID/app.ts" 2>/dev/null || true
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
## End of collector

