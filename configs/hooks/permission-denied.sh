#!/usr/bin/env bash
# PermissionDenied hook: audit every auto-mode classifier denial.
# Input: {tool_name, tool_input, tool_use_id, reason, session_id}
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input="$(cat)"
log_dir="${HOME}/.claude/session-logs"
mkdir -p "$log_dir"
log_file="${log_dir}/permission-denied.log"

stamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
session_id="$(printf '%s' "$input" | jq -r '.session_id // "unknown"')"
tool="$(printf '%s' "$input" | jq -r '.tool_name // "unknown"')"
reason="$(printf '%s' "$input" | jq -r '.reason // ""')"
tool_input="$(printf '%s' "$input" | jq -c '.tool_input // {}' | head -c 500)"

printf '%s | session=%s tool=%s reason=%q input=%s\n' \
  "$stamp" "$session_id" "$tool" "$reason" "$tool_input" >>"$log_file"

printf '{"retry":false}\n'
exit 0
