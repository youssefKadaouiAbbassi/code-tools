#!/usr/bin/env bash
# FileChanged hook: flag out-of-band edits to trust-sensitive config files.
# Input: {file_path, event:"change"|"add"|"unlink"}
# Matcher in settings.json limits which files trigger this hook.
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input="$(cat)"
log_dir="${HOME}/.claude/session-logs"
mkdir -p "$log_dir"
log_file="${log_dir}/config-changes.log"

stamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
file_path="$(printf '%s' "$input" | jq -r '.file_path // "unknown"')"
event="$(printf '%s' "$input" | jq -r '.event // "unknown"')"

printf '%s | %s %s\n' "$stamp" "$event" "$file_path" >>"$log_file"

printf '[WARN] Trust-sensitive file %s (%s). Verify the change is intentional.\n' \
  "$file_path" "$event" >&2

exit 0
