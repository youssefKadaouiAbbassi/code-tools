#!/usr/bin/env bash
# core-install-health: each stdout line becomes a Claude notification.
# Poll interval is governed by CC; exit 0 keeps the monitor alive.
set -uo pipefail

claude_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
hooks_dir="${claude_dir}/hooks"

required_hooks=(
  pre-secrets-guard.sh
  pre-destructive-blocker.sh
  pre-pr-gate.sh
  post-lint-gate.sh
  session-start.sh
  session-end.sh
  stop-summary.sh
  pre-compact.sh
  post-compact.sh
  stop-failure.sh
  permission-denied.sh
  elicitation.sh
  file-changed.sh
)

for hook in "${required_hooks[@]}"; do
  [[ -x "${hooks_dir}/${hook}" ]] || printf 'drift: hook %s missing or not executable\n' "$hook"
done

settings="${claude_dir}/settings.json"
if [[ -f "$settings" ]] && command -v jq >/dev/null 2>&1; then
  scrub=$(jq -r '.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB // "unset"' "$settings" 2>/dev/null)
  [[ "$scrub" == "0" ]] && printf 'drift: CLAUDE_CODE_SUBPROCESS_ENV_SCRUB explicitly set to "0" — leaks secrets to Bash subprocesses\n'
fi

if command -v claude >/dev/null 2>&1; then
  if ! claude mcp list 2>/dev/null | grep -q '^serena:'; then
    printf 'drift: MCP "serena" not registered (run yka-code setup)\n'
  fi
fi

exit 0
