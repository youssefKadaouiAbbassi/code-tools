#!/usr/bin/env bash
set -euo pipefail
event="$(cat)"
prompt=$(jq -r '.prompt // empty' <<<"$event" 2>/dev/null || echo "")
session=$(jq -r '.session_id // "unknown"' <<<"$event" 2>/dev/null || echo unknown)
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
[ -d .forge ] || mkdir -p .forge
echo "$ts session=$session prompt=$(jq -Rs . <<<"$prompt")" >> .forge/invocations.log
