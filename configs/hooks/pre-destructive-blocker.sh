#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook: blocks destructive patterns that settings.json deny can't
# express (regex, case-insensitive SQL, fork bombs). Literal-prefix denies
# (rm -rf /, git push --force, terraform destroy, sudo rm, curl | sh, etc.)
# are handled at the permissions layer before this hook fires.

if ! command -v jq >/dev/null 2>&1; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"pre-destructive-blocker: jq not found in PATH"}}\n'
  exit 0
fi

input="$(cat)"
tool_name="$(printf '%s' "$input" | jq -r '.tool_name // empty')"

if [[ "$tool_name" != "Bash" ]]; then
  exit 0
fi

command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
if [[ -z "$command" ]]; then
  exit 0
fi

check() {
  local pattern="$1"
  local reason="$2"
  if printf '%s' "$command" | grep -qE "$pattern"; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
    exit 0
  fi
}

check_i() {
  local pattern="$1"
  local reason="$2"
  if printf '%s' "$command" | grep -qEi "$pattern"; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
    exit 0
  fi
}

# Filesystem destruction beyond what literal denies cover.
check 'chmod[[:space:]]+-R[[:space:]]+777' "Blocked: recursive world-writable chmod"
check 'chown[[:space:]]+-R' "Blocked: recursive chown"
check 'find[[:space:]]+.*[[:space:]]+-delete' "Blocked: find -delete (mass deletion)"
check 'mkfs' "Blocked: filesystem creation (mkfs)"
check 'dd[[:space:]]+if=' "Blocked: dd disk operation"
check '>[[:space:]]*/dev/sd' "Blocked: direct write to block device (sd)"
check '>[[:space:]]*/dev/hd' "Blocked: direct write to block device (hd)"
check '>[[:space:]]*/dev/nvme' "Blocked: direct write to NVMe device"

# Git destructive patterns settings can't glob cleanly.
check 'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f' "Blocked: git clean with -f (matches -fd, -fxd, -df, etc.)"
check 'git[[:space:]]+checkout[[:space:]]+--[[:space:]]+\.' "Blocked: git checkout -- . (discard all changes)"
check 'git[[:space:]]+restore[[:space:]]+\.' "Blocked: git restore . (discard all changes)"

# Database destruction (case-insensitive, regex).
check_i 'DROP[[:space:]]+DATABASE' "Blocked: DROP DATABASE statement"
check_i 'DROP[[:space:]]+TABLE' "Blocked: DROP TABLE statement"
check_i 'DROP[[:space:]]+SCHEMA' "Blocked: DROP SCHEMA statement"
check_i 'TRUNCATE[[:space:]]+TABLE' "Blocked: TRUNCATE TABLE statement"
check_i 'DELETE[[:space:]]+FROM[[:space:]]+[A-Za-z_][A-Za-z0-9_.]*[[:space:]]*;' "Blocked: unbounded DELETE FROM (no WHERE clause)"

# Code execution.
check 'eval[[:space:]]*\(' "Blocked: eval() execution"
check 'base64[[:space:]]+-d[[:space:]]+.*\|[[:space:]]*(ba)?sh' "Blocked: base64 decode pipe to shell"

# Fork bomb.
check ':\(\)\{[[:space:]]*:\|:' "Blocked: fork bomb pattern detected"
check ':\s*\(\s*\)\s*\{' "Blocked: fork bomb pattern detected"

exit 0
