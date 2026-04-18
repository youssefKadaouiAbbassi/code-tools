#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "teammate-idle"
# TeammateIdle hook: log teammate idle state; optionally require artifacts.
# Input: {teammate_name, team_name, session_id}
# Exit 2 feeds stderr back to teammate and keeps it working instead of idling.
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
teammate="$(printf '%s' "$input" | jq -r '.teammate_name // "unknown"')"

printf '%s | IDLE team=%s teammate=%s\n' "$stamp" "$team" "$teammate" >>"$log_file"

exit 0
