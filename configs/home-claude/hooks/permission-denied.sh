#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "permission-denied"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
# PermissionDenied hook: audit every auto-mode classifier denial.
# Input: {tool_name, tool_input, tool_use_id, reason, session_id}
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

read_hook_stdin
log_file="$(hook_log_dir)/permission-denied.log"

stamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
session_id="$(hook_session_id)"; : "${session_id:=unknown}"
tool="$(hook_tool_name)"; : "${tool:=unknown}"
reason="$(printf '%s' "$HOOK_INPUT" | jq -r '.reason // ""')"
tool_input="$(printf '%s' "$HOOK_INPUT" | jq -c '.tool_input // {}' | head -c 500)"

printf '%s | session=%s tool=%s reason=%q input=%s\n' \
  "$stamp" "$session_id" "$tool" "$reason" "$tool_input" >>"$log_file"

printf '{"retry":false}\n'
exit 0
