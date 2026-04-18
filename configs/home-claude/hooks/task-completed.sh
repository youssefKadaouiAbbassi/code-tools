#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "task-completed"
# TaskCompleted hook: append-only audit log of completed tasks.
# Input: {task_id, task_subject, task_description?, teammate_name?, team_name?, session_id}
# Non-blocking. Consumed by session-end.sh / stop-summary.sh for the per-session recap.
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
