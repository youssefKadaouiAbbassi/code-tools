#!/usr/bin/env bash
set -euo pipefail

# Notification hook: logs session metadata on session end.
# Writes to ~/.claude/session-logs/{date}.log

# Fail-open: notification hook, exit cleanly if jq is missing.
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input="$(cat)"

log_dir="${HOME}/.claude/session-logs"
mkdir -p "$log_dir"

date_str="$(date '+%Y-%m-%d')"
time_str="$(date '+%H:%M:%S')"
timestamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
log_file="${log_dir}/${date_str}.log"

# Extract session metadata from hook input if available
session_id="$(printf '%s' "$input" | jq -r '.session_id // "unknown"')"
stop_hook_active="$(printf '%s' "$input" | jq -r '.stop_hook_active // false')"

# Gather context
git_branch="unknown"
git_repo="unknown"
if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  git_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')"
  git_repo="$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || printf 'unknown')"
fi

# Write log entry. Use `printf '%s\n' '---'` rather than `printf '---\n'` because
# some printf implementations (busybox, dash) parse a leading `--` in the format
# string as an attempt at option termination and error out.
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
