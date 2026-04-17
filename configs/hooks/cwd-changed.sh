#!/usr/bin/env bash
# CwdChanged hook: log every cwd change for audit. No decision control.
# Input: {old_cwd, new_cwd, session_id}
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input="$(cat)"
log_dir="${HOME}/.claude/session-logs"
mkdir -p "$log_dir"
log_file="${log_dir}/cwd-changes.log"

stamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
session_id="$(printf '%s' "$input" | jq -r '.session_id // "unknown"')"
old_cwd="$(printf '%s' "$input" | jq -r '.old_cwd // ""')"
new_cwd="$(printf '%s' "$input" | jq -r '.new_cwd // ""')"

printf '%s | session=%s %s -> %s\n' "$stamp" "$session_id" "$old_cwd" "$new_cwd" >>"$log_file"

exit 0
