#!/usr/bin/env bash
# Sourced by yka-code hooks right after _hook-guard.sh:
#     source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
#     read_hook_stdin
#     tool_name="$(hook_tool_name)"
#
# Defines functions only — sourcing this file MUST NOT change the hook's
# set-options, exit code, or working state. Each function degrades gracefully
# when jq is missing (prints empty string) or the payload is malformed.

read_hook_stdin() {
  HOOK_INPUT="$(cat 2>/dev/null || true)"
  : "${HOOK_INPUT:=}"
}

_hook_jq_field() {
  command -v jq >/dev/null 2>&1 || { printf ''; return 0; }
  printf '%s' "${HOOK_INPUT:-}" | jq -r "$1 // empty" 2>/dev/null || printf ''
}

hook_tool_name()   { _hook_jq_field '.tool_name'; }
hook_session_id()  { _hook_jq_field '.session_id'; }

hook_log_dir() {
  local dir="${HOME}/.claude/session-logs"
  mkdir -p "$dir" 2>/dev/null || true
  printf '%s' "$dir"
}

hook_timestamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
