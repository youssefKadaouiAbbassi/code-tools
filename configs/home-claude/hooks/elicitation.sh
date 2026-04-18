#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "elicitation"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
# Elicitation hook: log every MCP elicitation + flag non-allowlisted sources.
# Input: {mcp_server_name, message, mode:"form"|"url", requested_schema?, session_id}
# Passive observer — does not override the decision (action enum undocumented in v2.1.112).
# Allowlist is the set of MCPs we register ourselves; override with CC_ELICITATION_ALLOWLIST.
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

read_hook_stdin
allowlist="${CC_ELICITATION_ALLOWLIST:-serena,docfork,deepwiki,github,claude-mem,context-mode,composio,snyk,stitch}"
server="$(printf '%s' "$HOOK_INPUT" | jq -r '.mcp_server_name // ""')"

log_file="$(hook_log_dir)/elicitations.log"
stamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"

case ",${allowlist}," in
  *,"$server",*)
    printf '%s | allowlisted %s\n' "$stamp" "$server" >>"$log_file"
    exit 0
    ;;
esac

printf '%s | non-allowlisted %s (review manually)\n' "$stamp" "$server" >>"$log_file"
printf '[WARN] Elicitation from non-allowlisted MCP server %q — decide carefully.\n' "$server" >&2
exit 0
