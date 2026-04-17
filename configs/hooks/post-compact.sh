#!/usr/bin/env bash
# PostCompact hook: hash + archive each compaction summary for audit provenance.
# Input: {trigger, compact_summary:"...", session_id, transcript_path}
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input="$(cat)"
archive_dir="${HOME}/.claude/compact-archive"
mkdir -p "$archive_dir"

session_id="$(printf '%s' "$input" | jq -r '.session_id // "unknown"')"
trigger="$(printf '%s' "$input" | jq -r '.trigger // "unknown"')"
summary="$(printf '%s' "$input" | jq -r '.compact_summary // ""')"
stamp="$(date '+%Y%m%dT%H%M%S%z')"

out="${archive_dir}/${stamp}-${session_id}.md"
{
  printf -- '---\nsession_id: %s\ntrigger: %s\ntimestamp: %s\n---\n\n' \
    "$session_id" "$trigger" "$stamp"
  printf '%s\n' "$summary"
} >"$out"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$out" >>"${archive_dir}/SHA256SUMS"
fi

find "$archive_dir" -type f -name '*.md' -mtime +90 -delete 2>/dev/null || true

exit 0
