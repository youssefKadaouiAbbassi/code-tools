#!/usr/bin/env bash
# StopFailure hook: log abnormal stops; alert loudly on credential/billing failures.
# Input: {error, error_details, last_assistant_message, session_id}
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input="$(cat)"
log_dir="${HOME}/.claude/session-logs"
mkdir -p "$log_dir"
log_file="${log_dir}/stop-failures.log"

session_id="$(printf '%s' "$input" | jq -r '.session_id // "unknown"')"
error="$(printf '%s' "$input" | jq -r '.error // "unknown"')"
details="$(printf '%s' "$input" | jq -r '.error_details // ""')"
stamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"

{
  printf -- '---\ntimestamp: %s\nsession_id: %s\nerror: %s\n---\n%s\n' \
    "$stamp" "$session_id" "$error" "$details"
} >>"$log_file"

case "$error" in
  authentication_failed|billing_error)
    printf '[ALERT] Stop on %s at %s — investigate credentials/billing.\n' \
      "$error" "$stamp" >&2
    ;;
esac

exit 0
