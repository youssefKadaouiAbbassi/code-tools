#!/usr/bin/env bash
set -euo pipefail
event="$(cat || true)"
session=$(jq -r '.session_id // "unknown"' <<<"$event" 2>/dev/null || echo unknown)
command -v claude-mem >/dev/null 2>&1 || exit 0
claude-mem capture --session "$session" --tag forge --tag pre-compact >/dev/null 2>&1 || true
