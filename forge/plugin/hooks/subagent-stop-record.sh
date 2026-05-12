#!/usr/bin/env bash
set -euo pipefail
event="$(cat || true)"
sub_id=$(jq -r '.subagent_id // "unknown"' <<<"$event" 2>/dev/null || echo unknown)
parent=$(jq -r '.session_id // "unknown"' <<<"$event" 2>/dev/null || echo unknown)
outcome=$(jq -r '.outcome // .status // "unknown"' <<<"$event" 2>/dev/null || echo unknown)
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
[ -d .forge ] || mkdir -p .forge
echo "$ts subagent=$sub_id parent=$parent outcome=$outcome" >> .forge/subagent.log
