#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "stop-team-balance-check"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
set -u
trap 'exit 0' ERR

command -v jq >/dev/null 2>&1 || exit 0
read_hook_stdin

transcript="$(printf '%s' "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || true)"
[[ -n "$transcript" && -f "$transcript" ]] || exit 0

turn_start="$(awk '/"role": *"user"/ { start = NR } END { print (start ? start : 1) }' "$transcript" 2>/dev/null || echo 1)"
turn_json="$(sed -n "${turn_start},\$p" "$transcript" 2>/dev/null || true)"

count_tool() {
  local tool="$1"
  printf '%s' "$turn_json" | jq -r --arg t "$tool" '
    select(.type == "assistant")
    | .message.content[]?
    | select(.type == "tool_use" and .name == $t)
    | .name
  ' 2>/dev/null | grep -c "^${tool}\$" || echo 0
}

create_count="$(count_tool "TeamCreate")"
delete_count="$(count_tool "TeamDelete")"

if (( create_count > delete_count )); then
  {
    printf '\n=== Team lifecycle advisory ===\n'
    printf 'This turn had %s TeamCreate call(s) but only %s TeamDelete call(s).\n' "$create_count" "$delete_count"
    printf 'Every TeamCreate owes a TeamDelete. Unbalanced turns leave orphan team dirs\n'
    printf 'at ~/.claude/teams/<name>/ that the session-start-team-reaper.sh hook will clean\n'
    printf 'up after 24h + all tmux panes dead — but the right fix is to tear down inside the\n'
    printf 'stage that created the team. Run the team-do Shutdown contract before leaving a stage.\n\n'
  } >&2
fi

exit 0
