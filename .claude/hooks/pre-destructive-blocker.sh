#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook: blocks destructive shell commands before execution.
# Reads Claude Code hook JSON from stdin, outputs allow/block decision.

# Fail-secure: if jq is missing, block (a security hook can't silently disable itself).
if ! command -v jq >/dev/null 2>&1; then
  printf '{"decision":"block","reason":"pre-destructive-blocker: jq not found in PATH — install jq to enable command screening"}\n'
  exit 0
fi

input="$(cat)"

tool_name="$(printf '%s' "$input" | jq -r '.tool_name // empty')"

if [[ "$tool_name" != "Bash" ]]; then
  printf '{"decision":"allow"}\n'
  exit 0
fi

command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"

if [[ -z "$command" ]]; then
  printf '{"decision":"allow"}\n'
  exit 0
fi

check_pattern() {
  local pattern="$1"
  local reason="$2"
  if printf '%s' "$command" | grep -qE "$pattern"; then
    printf '{"decision":"block","reason":"%s"}\n' "$reason"
    exit 0
  fi
}

check_pattern_i() {
  local pattern="$1"
  local reason="$2"
  if printf '%s' "$command" | grep -qEi "$pattern"; then
    printf '{"decision":"block","reason":"%s"}\n' "$reason"
    exit 0
  fi
}

# File system destruction
check_pattern 'rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f[[:space:]]+/' "Blocked: recursive force delete targeting root path"
check_pattern 'rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f[[:space:]]+~' "Blocked: recursive force delete targeting home directory"
check_pattern 'rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f[[:space:]]+\.' "Blocked: recursive force delete targeting current directory"
check_pattern 'rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f[[:space:]]+\*' "Blocked: recursive force delete with wildcard"
check_pattern 'rm[[:space:]]+--recursive[[:space:]]+--force' "Blocked: rm --recursive --force"
check_pattern 'rm[[:space:]]+--force[[:space:]]+--recursive' "Blocked: rm --force --recursive"
check_pattern 'find[[:space:]]+.*[[:space:]]+-delete' "Blocked: find -delete (mass deletion)"
check_pattern 'chmod[[:space:]]+-R[[:space:]]+777' "Blocked: recursive world-writable chmod"
check_pattern 'chown[[:space:]]+-R' "Blocked: recursive chown"
check_pattern 'mkfs' "Blocked: filesystem creation (mkfs)"
check_pattern 'dd[[:space:]]+if=' "Blocked: dd disk operation"
check_pattern '>[[:space:]]*/dev/sd' "Blocked: direct write to block device"
check_pattern '>[[:space:]]*/dev/hd' "Blocked: direct write to block device"

# Git destructive operations
check_pattern 'git[[:space:]]+push[[:space:]]+.*--force' "Blocked: git force push"
check_pattern 'git[[:space:]]+push[[:space:]]+-f([[:space:]]|$)' "Blocked: git force push (-f)"
check_pattern 'git[[:space:]]+push[[:space:]]+.*--force-with-lease' "Blocked: git force-with-lease push"
check_pattern 'git[[:space:]]+reset[[:space:]]+--hard' "Blocked: git reset --hard"
check_pattern 'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f' "Blocked: git clean -f (destructive)"
check_pattern 'git[[:space:]]+checkout[[:space:]]+--[[:space:]]+\.' "Blocked: git checkout -- . (discard all changes)"
check_pattern 'git[[:space:]]+restore[[:space:]]+\.' "Blocked: git restore . (discard all changes)"

# Infrastructure destruction
check_pattern 'terraform[[:space:]]+destroy' "Blocked: terraform destroy"
check_pattern 'terraform[[:space:]]+apply[[:space:]]+.*-auto-approve' "Blocked: terraform apply -auto-approve"
check_pattern 'kubectl[[:space:]]+delete[[:space:]]+namespace' "Blocked: kubectl delete namespace"
check_pattern 'kubectl[[:space:]]+delete[[:space:]]+-f' "Blocked: kubectl delete -f"
check_pattern 'kubectl[[:space:]]+delete[[:space:]]+.*--all' "Blocked: kubectl delete --all"
check_pattern 'docker[[:space:]]+system[[:space:]]+prune[[:space:]]+-[a-zA-Z]*f' "Blocked: docker system prune -f"

# Database destruction (case-insensitive)
check_pattern_i 'DROP[[:space:]]+DATABASE' "Blocked: DROP DATABASE statement"
check_pattern_i 'DROP[[:space:]]+TABLE' "Blocked: DROP TABLE statement"
check_pattern_i 'DROP[[:space:]]+SCHEMA' "Blocked: DROP SCHEMA statement"
check_pattern_i 'TRUNCATE[[:space:]]+TABLE' "Blocked: TRUNCATE TABLE statement"
# Note: bare DELETE FROM is a normal SQL operation when paired with WHERE — only
# block unbounded deletes that omit a WHERE clause entirely.
check_pattern_i 'DELETE[[:space:]]+FROM[[:space:]]+[A-Za-z_][A-Za-z0-9_.]*[[:space:]]*;' "Blocked: unbounded DELETE FROM (no WHERE clause)"

# System operations
check_pattern 'sudo[[:space:]]+rm' "Blocked: sudo rm"
check_pattern 'sudo[[:space:]]+chmod' "Blocked: sudo chmod"
check_pattern 'sudo[[:space:]]+chown' "Blocked: sudo chown"
check_pattern 'pkill[[:space:]]+-9' "Blocked: pkill -9 (SIGKILL)"
check_pattern 'kill[[:space:]]+-9' "Blocked: kill -9 (SIGKILL)"
check_pattern 'killall[[:space:]]' "Blocked: killall command"
check_pattern '(^|;|&&|\|\|)[[:space:]]*(sudo[[:space:]]+)?(shutdown|reboot|halt)([[:space:]]|$)' "Blocked: system shutdown/reboot/halt"
check_pattern 'init[[:space:]]+[06]([[:space:]]|$)' "Blocked: init 0/6 (shutdown/reboot)"
check_pattern 'systemctl[[:space:]]+(stop|disable)[[:space:]]' "Blocked: systemctl stop/disable"

# Publish operations
check_pattern 'npm[[:space:]]+publish' "Blocked: npm publish (use explicit --dry-run first)"
check_pattern 'cargo[[:space:]]+publish' "Blocked: cargo publish (use explicit --dry-run first)"

# Code execution from network
check_pattern 'curl[[:space:]]+.*\|[[:space:]]*(ba)?sh' "Blocked: curl pipe to shell (supply chain risk)"
check_pattern 'wget[[:space:]]+.*\|[[:space:]]*(ba)?sh' "Blocked: wget pipe to shell (supply chain risk)"
check_pattern 'eval[[:space:]]*\(' "Blocked: eval() execution"
check_pattern 'base64[[:space:]]+-d[[:space:]]+.*\|[[:space:]]*(ba)?sh' "Blocked: base64 decode pipe to shell"

# Fork bomb
check_pattern ':\(\)\{[[:space:]]*:\|:' "Blocked: fork bomb pattern detected"
check_pattern ':\s*\(\s*\)\s*\{' "Blocked: fork bomb pattern detected"

printf '{"decision":"allow"}\n'
