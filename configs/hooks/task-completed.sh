#!/usr/bin/env bash
# TaskCompleted hook: log completion, audit final state.
# Input: {task_id, task_subject, task_description?, teammate_name?, team_name?, session_id}
# Exit 2 to block completion — e.g., tests must pass before a task can be marked done.
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input="$(cat)"
log_dir="${HOME}/.claude/session-logs"
mkdir -p "$log_dir"
log_file="${log_dir}/team-tasks.log"

stamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
team="$(printf '%s' "$input" | jq -r '.team_name // "none"')"
task_id="$(printf '%s' "$input" | jq -r '.task_id // "unknown"')"
owner="$(printf '%s' "$input" | jq -r '.teammate_name // "lead"')"
subject="$(printf '%s' "$input" | jq -r '.task_subject // ""')"

printf '%s | COMPLETED team=%s task=%s owner=%s subject=%q\n' \
  "$stamp" "$team" "$task_id" "$owner" "$subject" >>"$log_file"

exit 0
