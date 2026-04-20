#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "post-compact"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
# PostCompact hook: hash + archive each compaction summary for audit provenance.
# Input: {trigger, compact_summary:"...", session_id, transcript_path}
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

read_hook_stdin
archive_dir="${HOME}/.claude/compact-archive"
mkdir -p "$archive_dir"

session_id="$(hook_session_id)"; : "${session_id:=unknown}"
trigger="$(printf '%s' "$HOOK_INPUT" | jq -r '.trigger // "unknown"')"
summary="$(printf '%s' "$HOOK_INPUT" | jq -r '.compact_summary // ""')"
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

reminder=$'[yka-code] /compact just ran. Skill-load state was dropped. Re-invoke Skill("karpathy-guidelines"), Skill("coding-style"), Skill("research-first") at your next Phase 0 before any tool call. The 1% rule still applies: if any skill might apply to your next step, you MUST invoke it.'
python3 - "$reminder" <<'PY' 2>/dev/null || true
import json, sys
print(json.dumps({"systemMessage": sys.argv[1]}))
PY

exit 0
