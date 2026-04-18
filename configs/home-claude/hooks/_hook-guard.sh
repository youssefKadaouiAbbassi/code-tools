#!/usr/bin/env bash
# Sourced by every yka-code hook at the top, right after the shebang:
#     source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "<hook-name>"
#
# Exits the hook early (exit 0) if the named hook is disabled by either:
#   1. Env var  YKA_HOOKS_BYPASS  — comma-separated list ("all" matches every
#      hook). For one-shot: `YKA_HOOKS_BYPASS=pre-pr-gate git push origin master`.
#   2. State file ~/.claude/yka-hooks-disabled — one hook name per line,
#      "all" to disable every hook. Managed by `yka-code-setup hooks disable|enable`.
#
# The `exit 0` inside a sourced script terminates the sourcing hook process,
# so the hook's main logic never runs.
_yka_hook_name="${1:-}"
[[ -z "$_yka_hook_name" ]] && return 0

# Env-var bypass
if [[ -n "${YKA_HOOKS_BYPASS:-}" ]]; then
  case ",${YKA_HOOKS_BYPASS}," in
    *,all,*|*,"$_yka_hook_name",*) exit 0;;
  esac
fi

# State-file bypass
_yka_state_file="${HOME}/.claude/yka-hooks-disabled"
if [[ -f "$_yka_state_file" ]]; then
  while IFS= read -r _yka_line || [[ -n "$_yka_line" ]]; do
    _yka_line="${_yka_line%%#*}"
    _yka_line="$(printf '%s' "$_yka_line" | tr -d '[:space:]')"
    [[ -z "$_yka_line" ]] && continue
    if [[ "$_yka_line" == "all" || "$_yka_line" == "$_yka_hook_name" ]]; then
      exit 0
    fi
  done < "$_yka_state_file"
fi

unset _yka_hook_name _yka_state_file _yka_line
