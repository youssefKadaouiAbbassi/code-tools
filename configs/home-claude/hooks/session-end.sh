#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "session-end"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

read_hook_stdin
log_dir="$(hook_log_dir)"

date_str="$(date '+%Y-%m-%d')"
time_str="$(date '+%H:%M:%S')"
timestamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
log_file="${log_dir}/${date_str}.log"

session_id="$(hook_session_id)"; : "${session_id:=unknown}"
stop_hook_active="$(printf '%s' "$HOOK_INPUT" | jq -r '.stop_hook_active // false')"

git_branch="unknown"
git_repo="unknown"
if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  git_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')"
  git_repo="$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || printf 'unknown')"
fi

{
  printf '%s\n' '---'
  printf 'timestamp: %s\n' "$timestamp"
  printf 'session_id: %s\n' "$session_id"
  printf 'repo: %s\n' "$git_repo"
  printf 'branch: %s\n' "$git_branch"
  printf 'stop_hook_active: %s\n' "$stop_hook_active"
  printf '%s\n' '---'
} >> "$log_file"

printf 'Session logged to %s\n' "$log_file" >&2

find "$log_dir" -type f -name '*.log' -mtime +30 -delete 2>/dev/null || true

exit 0
