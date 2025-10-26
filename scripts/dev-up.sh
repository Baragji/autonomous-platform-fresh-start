#!/usr/bin/env bash
set -euo pipefail

# Load secrets silently
if [ -f ./.env ]; then
  set -a; . ./.env; set +a
fi
unset WEEK2_PLANNER_ONLY || true

# Clean up any previous runs
pkill -f "packages/(gateway|planner|mca|implementer|runner|validator)" >/dev/null 2>&1 || true
pkill -f "next dev -p 4000" >/dev/null 2>&1 || true
for p in 3030 7010 7020 7030 7040 7050 4000; do
  lsof -i :$p -t | xargs kill -9 2>/dev/null || true
done

# Bring up infra + services and keep them alive
KEEP_RUNNING=1 npx tsx scripts/collect-healthz.ts || true

# Start UI in live mode
UI_BACKEND_MODE=live UI_GATEWAY_BASE=${UI_GATEWAY_BASE:-http://localhost:3030} \
  nohup npm -w apps/web run dev > /tmp/ui.log 2>&1 &

# Wait for UI
for i in {1..60}; do
  if curl -fsS http://localhost:4000 >/dev/null 2>&1; then break; fi
  sleep 1
done

# Print health summary (JSON)
node -e '
  const fetch = global.fetch;
  const targets = [
    { name: "gateway", url: "http://localhost:3030/healthz" },
    { name: "mca", url: "http://localhost:7010/healthz" },
    { name: "planner", url: "http://localhost:7020/healthz" },
    { name: "implementer", url: "http://localhost:7030/healthz" },
    { name: "runner", url: "http://localhost:7040/healthz" },
    { name: "validator", url: "http://localhost:7050/healthz" },
    { name: "ui", url: "http://localhost:4000" }
  ];
  (async () => {
    const out = [];
    for (const t of targets) {
      try { const r = await fetch(t.url); out.push({ name: t.name, status: r.status }); }
      catch (e) { out.push({ name: t.name, error: String(e && e.message || e) }); }
    }
    console.log(JSON.stringify({ status: out }, null, 2));
  })();
'

echo "UI running at http://localhost:4000"

