#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "pre-compact"
# PreCompact hook: block auto-compact when transcript contains active secrets.
# Input: {trigger:"manual"|"auto", custom_instructions:"", transcript_path:"..."}
# Exit 2 blocks the compaction; stderr is fed back to Claude.
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input="$(cat)"
trigger="$(printf '%s' "$input" | jq -r '.trigger // "unknown"')"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty')"

# Only gate auto-compact — manual means the user accepted the loss.
[[ "$trigger" != "auto" ]] && exit 0
[[ -z "$transcript" || ! -f "$transcript" ]] && exit 0

patterns='(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36,}|sk-ant-[A-Za-z0-9_-]{40,}|sk_live_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})'

if grep -Eqo "$patterns" "$transcript" 2>/dev/null; then
  printf '{"decision":"block","reason":"pre-compact: transcript contains live-looking credential material. Rotate or redact, then /compact manually."}\n'
  exit 0
fi

exit 0
