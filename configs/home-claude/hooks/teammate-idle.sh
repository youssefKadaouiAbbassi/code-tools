#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "teammate-idle"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
# TeammateIdle hook: log teammate idle state; optionally require artifacts.
# Input: {teammate_name, team_name, session_id}
# Exit 2 feeds stderr back to teammate and keeps it working instead of idling.
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

read_hook_stdin
log_file="$(hook_log_dir)/team-tasks.log"

stamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
team="$(printf '%s' "$HOOK_INPUT" | jq -r '.team_name // "none"')"
teammate="$(printf '%s' "$HOOK_INPUT" | jq -r '.teammate_name // "unknown"')"

printf '%s | IDLE team=%s teammate=%s\n' "$stamp" "$team" "$teammate" >>"$log_file"

exit 0
