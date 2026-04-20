#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "stop-verification-check"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
# Stop hook: if the turn wrote/edited files AND claimed done without invoking
# the verification-before-completion skill, emit an advisory. Non-blocking.
set -euo pipefail
trap 'rc=$?; [ $rc -ne 0 ] && echo "[stop-verification-check] rc=$rc line=$LINENO" >&2; exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

read_hook_stdin

transcript="$(printf '%s' "$HOOK_INPUT" | jq -r '.transcript_path // empty')"
[[ -z "$transcript" || ! -f "$transcript" ]] && exit 0

turn_start="$(jq -s '[to_entries[] | select(
  .value.type == "user" and
  (.value.message.content | if type == "array" then all(.[]; .type != "tool_result") else true end)
)] | (last.key // -1) + 1 | if . < 1 then 1 else . end' "$transcript" 2>/dev/null || echo 1)"
: "${turn_start:=1}"
turn_json="$(sed -n "${turn_start},\$p" "$transcript")"

turn_tools="$(printf '%s' "$turn_json" | jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use") | .name' 2>/dev/null | sort -u || true)"
turn_text="$(printf '%s' "$turn_json" | jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text' 2>/dev/null || true)"

if ! printf '%s\n' "$turn_tools" | grep -qE '^(Write|Edit|MultiEdit)$'; then
  exit 0
fi

[[ -z "$turn_text" ]] && exit 0

if ! printf '%s' "$turn_text" | grep -qiE '\b(done|complete|completed|shipped|passes|passing|green|ready|finished)\b'; then
  exit 0
fi

verification_used="$(printf '%s' "$turn_json" | jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and .name == "Skill" and .input.skill == "verification-before-completion") | .name' 2>/dev/null | head -1 || true)"
if [[ -n "$verification_used" ]]; then
  exit 0
fi

{
  printf '\n=== Verification-Before-Completion Advisory ===\n'
  printf 'Turn edited files and claimed completion without invoking Skill("verification-before-completion").\n'
  printf 'Next turn: run Skill("verification-before-completion") before declaring the work done — confirm tests, build, and lsp_diagnostics pass.\n\n'
} >&2

exit 0
