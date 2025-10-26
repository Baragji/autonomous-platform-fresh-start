#!/usr/bin/env bash
set -euo pipefail

# Stop Node services via recorded PIDs
npx tsx scripts/stop-services.ts || true

# Stop UI (Next dev)
pkill -f "next dev -p 4000" >/dev/null 2>&1 || true
lsof -i :4000 -t | xargs kill -9 2>/dev/null || true

# Bring down infra
docker compose -f infrastructure/docker-compose.yml down --remove-orphans >/dev/null 2>&1 || true

echo "dev-down complete"

