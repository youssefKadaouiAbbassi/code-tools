#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "user-prompt-submit"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
# UserPromptSubmit hook: inject today's ISO date and current git branch into
# every turn via the `additionalContext` field of the advanced JSON response.
# Kills the training-cutoff class of bugs — Claude always has the correct date
# without needing to call `date -I` each turn.
set -euo pipefail
trap 'exit 0' ERR

read_hook_stdin

cwd=""
if command -v jq >/dev/null 2>&1; then
  cwd="$(printf '%s' "$HOOK_INPUT" | jq -r '.cwd // empty' 2>/dev/null || true)"
fi
[[ -z "$cwd" ]] && cwd="$(pwd)"

iso_date="$(date -I 2>/dev/null || date '+%Y-%m-%d')"

branch=""
if (cd "$cwd" && git rev-parse --is-inside-work-tree &>/dev/null); then
  branch="$(cd "$cwd" && git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi

context="## Session context (injected by UserPromptSubmit hook)"$'\n'"- Today's date: ${iso_date}"
if [[ -n "$branch" ]]; then
  context="${context}"$'\n'"- Current branch: ${branch}"
fi
context="${context}"$'\n'"- Working directory: ${cwd}"

if command -v python3 >/dev/null 2>&1; then
  python3 - "$context" <<'PY'
import json, sys
print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": sys.argv[1]}}))
PY
elif command -v jq >/dev/null 2>&1; then
  printf '%s' "$context" | jq -Rs --arg event "UserPromptSubmit" '{hookSpecificOutput: {hookEventName: $event, additionalContext: .}}'
fi

exit 0
