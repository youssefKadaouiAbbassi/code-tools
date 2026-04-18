#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "pre-secrets-guard"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
set -euo pipefail

# PreToolUse hook: blocks tool inputs containing secrets or credentials.
# Reads Claude Code hook JSON from stdin, outputs allow/block decision.

# Fail-secure: if jq is missing, block (a security hook can't silently disable itself).
if ! command -v jq >/dev/null 2>&1; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"pre-secrets-guard: jq not found in PATH — install jq to enable secret scanning"}}\n'
  exit 0
fi

read_hook_stdin

tool_name="$(hook_tool_name)"

# Serialize tool input to string for pattern matching
tool_input_str="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input | tostring')"

if [[ -z "$tool_input_str" ]]; then
  exit 0
fi

check_secret() {
  local pattern="$1"
  local reason="$2"
  if printf '%s' "$tool_input_str" | grep -qE "$pattern"; then
    # PreToolUse uses the new hookSpecificOutput.permissionDecision schema.
    # The deprecated top-level {"decision":"block"} fails CC's validator now.
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
    exit 0
  fi
}

# AWS credentials
check_secret 'AKIA[0-9A-Z]{16}' "Blocked: AWS access key ID detected (AKIA...)"
check_secret 'ASIA[0-9A-Z]{16}' "Blocked: AWS temporary access key detected (ASIA...)"
check_secret 'aws_secret_access_key[[:space:]]*=[[:space:]]*[A-Za-z0-9/+=]{40}' "Blocked: AWS secret access key detected"

# GitHub tokens
check_secret 'ghp_[A-Za-z0-9]{36}' "Blocked: GitHub personal access token (ghp_...)"
check_secret 'gho_[A-Za-z0-9]{36}' "Blocked: GitHub OAuth token (gho_...)"
check_secret 'ghs_[A-Za-z0-9]{36}' "Blocked: GitHub app token (ghs_...)"
check_secret 'github_pat_[A-Za-z0-9_]{82}' "Blocked: GitHub fine-grained PAT detected"

# Stripe keys
check_secret 'sk_live_[A-Za-z0-9]{24,}' "Blocked: Stripe live secret key (sk_live_...)"
check_secret 'rk_live_[A-Za-z0-9]{24,}' "Blocked: Stripe live restricted key (rk_live_...)"
check_secret 'sk_test_[A-Za-z0-9]{24,}' "Blocked: Stripe test secret key (sk_test_...)"

# Private keys / certificates
check_secret 'BEGIN[[:space:]]+(RSA[[:space:]]+)?PRIVATE[[:space:]]+KEY' "Blocked: PEM private key detected"
check_secret 'BEGIN[[:space:]]+OPENSSH[[:space:]]+PRIVATE[[:space:]]+KEY' "Blocked: OpenSSH private key detected"
check_secret 'BEGIN[[:space:]]+EC[[:space:]]+PRIVATE[[:space:]]+KEY' "Blocked: EC private key detected"

# .env access via Bash commands (grep, tail, less, bat, etc.).
# Read tool is already blocked by settings.json Read(.env*) deny.
if [[ "$tool_name" == "Bash" ]]; then
  check_secret '(^|[^a-zA-Z0-9_/])\.(env)(\.[a-zA-Z]+)?([^a-zA-Z0-9_]|$)' "Blocked: .env file access via Bash — use environment variable references instead"
fi

# Database connection strings with passwords
check_secret 'postgres(ql)?://[^:]+:[^@]+@' "Blocked: PostgreSQL connection string with embedded password"
check_secret 'mysql://[^:]+:[^@]+@' "Blocked: MySQL connection string with embedded password"
check_secret 'mongodb(\+srv)?://[^:]+:[^@]+@' "Blocked: MongoDB connection string with embedded password"
check_secret 'redis://:[^@]+@' "Blocked: Redis connection string with embedded password"

# API keys in URLs
check_secret '[?&]api[_-]?key=[A-Za-z0-9_\-]{16,}' "Blocked: API key in URL query parameter"
check_secret '[?&]token=[A-Za-z0-9_\-]{16,}' "Blocked: Token in URL query parameter"
check_secret '[?&]secret=[A-Za-z0-9_\-]{16,}' "Blocked: Secret in URL query parameter"

# JWT tokens
check_secret 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' "Blocked: JWT token detected"

# Anthropic / OpenAI / other LLM provider keys
check_secret 'sk-ant-[A-Za-z0-9_\-]{90,}' "Blocked: Anthropic API key detected"
check_secret 'sk-proj-[A-Za-z0-9_\-]{40,}' "Blocked: OpenAI project key detected (sk-proj-...)"
check_secret 'sk-svcacct-[A-Za-z0-9_\-]{40,}' "Blocked: OpenAI service account key detected"
check_secret 'sk-[A-Za-z0-9]{48}' "Blocked: OpenAI legacy key detected"
check_secret 'sk-or-[vV][0-9]-[A-Za-z0-9_\-]{40,}' "Blocked: OpenRouter API key detected"
check_secret 'gsk_[A-Za-z0-9]{50,}' "Blocked: Groq API key detected"
check_secret 'xai-[A-Za-z0-9]{40,}' "Blocked: xAI API key detected"
check_secret 'AIzaSy[A-Za-z0-9_\-]{33}' "Blocked: Google API key detected"

# Slack tokens
check_secret 'xoxb-[A-Za-z0-9\-]+' "Blocked: Slack bot token (xoxb-...)"
check_secret 'xoxp-[A-Za-z0-9\-]+' "Blocked: Slack user token (xoxp-...)"
check_secret 'xoxa-[A-Za-z0-9\-]+' "Blocked: Slack app token (xoxa-...)"

# Azure connection strings
check_secret 'DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=' "Blocked: Azure Storage connection string detected"
check_secret 'Endpoint=sb://[^;]+;SharedAccessKeyName=[^;]+;SharedAccessKey=' "Blocked: Azure Service Bus connection string detected"

# npm tokens
check_secret 'npm_[a-zA-Z0-9]{36}' "Blocked: npm access token (npm_...)"

# GitLab PATs
check_secret 'glpat-[A-Za-z0-9_\-]{20,}' "Blocked: GitLab personal access token (glpat-...)"

# HuggingFace tokens
check_secret 'hf_[A-Za-z0-9]{34,}' "Blocked: HuggingFace token (hf_...)"

# SendGrid
check_secret 'SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}' "Blocked: SendGrid API key (SG....)"

# Linear
check_secret 'lin_api_[A-Za-z0-9]{40,}' "Blocked: Linear API key (lin_api_...)"

# Postman
check_secret 'PMAK-[A-Za-z0-9]{24}-[A-Za-z0-9]{34}' "Blocked: Postman API key (PMAK-...)"

# Twilio
check_secret 'AC[a-f0-9]{32}' "Blocked: Twilio Account SID (AC...)"
check_secret 'SK[a-f0-9]{32}' "Blocked: Twilio API key SID (SK...)"

# Slack app-level
check_secret 'xapp-[0-9]+-[A-Z0-9]+-[0-9]+-[a-f0-9]+' "Blocked: Slack app-level token (xapp-...)"

# Generic high-entropy secrets in variable assignments
check_secret '(password|passwd|secret|api_key|apikey|auth_token|access_token)[[:space:]]*=[[:space:]]*["\x27][A-Za-z0-9+/=_\-]{20,}["\x27]' "Blocked: Hardcoded credential in assignment"

exit 0
