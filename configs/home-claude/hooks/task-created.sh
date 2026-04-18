#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "task-created"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
# TaskCreated hook: log every team task; exit 2 to reject malformed tasks.
# Input: {task_id, task_subject, task_description?, teammate_name?, team_name?, session_id}
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

read_hook_stdin
log_file="$(hook_log_dir)/team-tasks.log"

stamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
team="$(printf '%s' "$HOOK_INPUT" | jq -r '.team_name // "none"')"
task_id="$(printf '%s' "$HOOK_INPUT" | jq -r '.task_id // "unknown"')"
subject="$(printf '%s' "$HOOK_INPUT" | jq -r '.task_subject // ""')"
description="$(printf '%s' "$HOOK_INPUT" | jq -r '.task_description // ""')"

printf '%s | CREATED team=%s task=%s subject=%q desc_len=%d\n' \
  "$stamp" "$team" "$task_id" "$subject" "${#description}" >>"$log_file"

if [[ -z "$subject" ]]; then
  printf 'Refusing task: subject is required.\n' >&2
  exit 2
fi

if [[ ${#subject} -lt 8 ]]; then
  printf 'Refusing task: subject too terse (%d chars, need 8+). Add context.\n' "${#subject}" >&2
  exit 2
fi

exit 0
