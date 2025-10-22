#!/usr/bin/env bash
set -euo pipefail

# Sync selected values from local .env into GitHub repo Secrets/Variables.
# - Requires: gh CLI authenticated and this directory being a Git repo with origin set
# - Never prints secret values. Fails fast on missing prerequisites.

red() { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
note() { printf "\033[36m%s\033[0m\n" "$*"; }

if ! command -v gh >/dev/null 2>&1; then
  red "gh CLI not found. Install from https://cli.github.com/"
  exit 1
fi

# Verify auth and repo context
if ! gh auth status -h github.com >/dev/null 2>&1; then
  red "gh CLI not authenticated. Run: gh auth login"
  exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)
if [[ -z "${REPO}" ]]; then
  red "Could not determine GitHub repository. Ensure 'git remote origin' points to GitHub."
  exit 1
fi

ENV_FILE=".env"
if [[ ! -f "$ENV_FILE" ]]; then
  red ".env not found at repo root. Create it first."
  exit 1
fi

note "Loading variables from $ENV_FILE ..."
set -a
source "$ENV_FILE"
set +a

# Helper: ensure var present
need() {
  local name="$1"; shift || true
  if [[ -z "${!name:-}" ]]; then
    red "Missing required variable: $name in $ENV_FILE"
    exit 1
  fi
}

# Required secrets
need OPENAI_API_KEY
need MINIO_ACCESS_KEY
need MINIO_SECRET_KEY

# Optional secrets (set if present)
SECRETS=(
  OPENAI_API_KEY
  DATABASE_URL
  MINIO_ACCESS_KEY
  MINIO_SECRET_KEY
  LANGFUSE_PUBLIC_KEY
  LANGFUSE_SECRET_KEY
)

# Non-secret variables
VARS=(
  REDIS_URL
  MINIO_ENDPOINT
  OTEL_EXPORTER_OTLP_ENDPOINT
  GRAFANA_URL
)

note "Syncing repository SECRETS to $REPO ..."
for key in "${SECRETS[@]}"; do
  val="${!key:-}"
  if [[ -n "$val" ]]; then
    gh secret set "$key" --body "$val" >/dev/null
    echo "  - secret $key: set"
  else
    echo "  - secret $key: skipped (unset)"
  fi
done

note "Syncing repository VARIABLES to $REPO ..."
for key in "${VARS[@]}"; do
  val="${!key:-}"
  if [[ -n "$val" ]]; then
    gh variable set "$key" --body "$val" >/dev/null
    echo "  - var $key: set"
  else
    echo "  - var $key: skipped (unset)"
  fi
done

green "Done. Repo secrets/variables updated for $REPO"

