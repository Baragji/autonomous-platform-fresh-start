#!/usr/bin/env bash
set -euo pipefail

EVID=".automation/evidence"
mkdir -p "$EVID"

COMMIT_SHA=$(git rev-parse HEAD)
TS=$(date -u +%FT%TZ)

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

find "$EVID" -type f \
  ! -name 'ATTACHMENT_MANIFEST.json' \
  ! -name 'ATTACHMENT_MANIFEST.ci.json' \
  ! -name 'TAMPERING_ALERT.txt' \
  -print | sort > "$tmpfile"

files_json="[]"
while IFS= read -r f; do
  if command -v shasum >/dev/null 2>&1; then
    HASH=$(shasum -a 256 "$f" | awk '{print $1}')
  elif command -v sha256sum >/dev/null 2>&1; then
    HASH=$(sha256sum "$f" | awk '{print $1}')
  else
    echo "No SHA256 tool found" >&2
    exit 1
  fi
  sz=$(wc -c < "$f" | tr -d ' ')
  files_json=$(node -e "const j=$files_json; j.push({path: '$f', sha256: '$HASH', size_bytes: $sz}); process.stdout.write(JSON.stringify(j))")
done < "$tmpfile"

node -e "console.log(JSON.stringify({commit: '$COMMIT_SHA', generated_at_utc: '$TS', files: $files_json}, null, 2))" > "$EVID/ATTACHMENT_MANIFEST.json"

echo "Wrote $EVID/ATTACHMENT_MANIFEST.json"
