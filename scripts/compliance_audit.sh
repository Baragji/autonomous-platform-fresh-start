#!/usr/bin/env bash
# Universal quick compliance scan (helper). macOS + Linux compatible.
# This does NOT replace the manual checklist in COMPLIANCE_AUDIT.md.

set -euo pipefail

RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
NC="\033[0m"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

violations=0

note() { echo -e "${YELLOW}==> $*${NC}"; }
fail() { echo -e "${RED}$*${NC}"; violations=$((violations+1)); }
ok() { echo -e "${GREEN}$*${NC}"; }

note "Running quick compliance checks from $ROOT_DIR"

# 1) Forbidden placeholders in src
note "Checking for TODO/FIXME/PLACEHOLDER/STUB in packages/*/src/ ..."
if grep -RinE "\b(TODO|FIXME|PLACEHOLDER|STUB)\b" packages/*/src/ --exclude-dir=node_modules --exclude=*.md --exclude=*.spec.* --exclude=*.test.* 2>/dev/null; then
  fail "Found TODO/FIXME/PLACEHOLDER/STUB markers in source"
else
  ok "No placeholder markers found"
fi

# 2) Hardcoded success returns
note "Checking for hardcoded success returns ..."
if grep -Rin "return\s*{\s*success:\s*true\s*}" packages/*/src/ --exclude-dir=node_modules 2>/dev/null; then
  fail "Found hardcoded success returns"
else
  ok "No hardcoded success returns found"
fi

# 3) Console.log in src
note "Checking for console.log in src ..."
if grep -Rin "console\\.log\\(" packages/*/src/ --exclude-dir=node_modules 2>/dev/null; then
  fail "Found console.log in src (use a proper logger)"
else
  ok "No console.log found in src"
fi

# 4) TypeScript any
note "Checking for ': any' in TS sources ..."
if grep -RinE ":\s*any\b" packages/*/src/ --include=*.ts --include=*.tsx --exclude-dir=node_modules 2>/dev/null; then
  fail "Found ': any' in TS sources"
else
  ok "No ': any' types found"
fi

# 5) Anthropic imports
note "Checking for Anthropic imports ..."
if grep -RinE "from ['\"]@anthropic|require\(['\"]@anthropic|from ['\"]anthropic['\"]|require\(['\"]anthropic['\"]\)" packages/*/src/ --exclude-dir=node_modules 2>/dev/null; then
  fail "Found Anthropic references (OpenAI-only policy)"
else
  ok "No Anthropic references detected"
fi

# 6) Disallowed SQLite usage
note "Checking for SQLite usage ..."
if grep -RinE "sqlite3|better-sqlite3" packages/*/src/ package.json --exclude-dir=node_modules 2>/dev/null; then
  fail "Found SQLite usage (use Postgres 16+)"
else
  ok "No SQLite usage detected"
fi

# 7) Monolith anti-pattern check (src at root)
note "Checking for root-level src directory ..."
if [ -d "src" ]; then
  fail "Found root-level 'src' directory (services must live under packages/*)"
else
  ok "No root-level 'src' directory found"
fi

if [ "$violations" -gt 0 ]; then
  echo -e "${RED}Compliance quick checks found $violations issue(s). See above.${NC}"
  exit 1
else
  echo -e "${GREEN}Compliance quick checks passed (no issues found).${NC}"
  exit 0
fi
