#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "pre-research-check"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
# PreToolUse(WebSearch|WebFetch|mcp__docfork__*|mcp__deepwiki__*|mcp__github__*):
# advisory warning if research-first skill was not invoked this turn. Non-blocking.
set -uo pipefail
trap 'exit 0' ERR

command -v jq >/dev/null 2>&1 || exit 0

read_hook_stdin

tool_name="$(hook_tool_name)"
case "$tool_name" in
  WebSearch|WebFetch) ;;
  mcp__docfork__*|mcp__deepwiki__*|mcp__github__*) ;;
  *) exit 0 ;;
esac

transcript="$(printf '%s' "$HOOK_INPUT" | jq -r '.transcript_path // empty')"
[[ -z "$transcript" || ! -f "$transcript" ]] && exit 0

turn_start="$(awk '/"role": *"user"/ { start = NR } END { print (start ? start : 1) }' "$transcript")"
turn_slice="$(sed -n "${turn_start},\$p" "$transcript")"

invoked="$(
  printf '%s' "$turn_slice" \
    | jq -r 'select(.type == "assistant")
             | .message.content[]?
             | select(.type == "tool_use" and .name == "Skill")
             | .input.skill // empty' 2>/dev/null \
    | grep -Fx 'research-first' || true
)"

[[ -n "$invoked" ]] && exit 0

{
  printf '\n=== Research-First Advisory (pre-tool) ===\n'
  printf 'Tool %s fired before Skill("research-first") was invoked this turn.\n' "$tool_name"
  printf 'Fix: call Skill(skill: "research-first") now, then retry %s.\n\n' "$tool_name"
} >&2

exit 0
