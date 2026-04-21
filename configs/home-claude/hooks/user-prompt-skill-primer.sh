#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "user-prompt-skill-primer"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
set -euo pipefail
trap 'rc=$?; [ $rc -ne 0 ] && echo "[user-prompt-skill-primer] rc=$rc line=$LINENO" >&2; exit 0' ERR

command -v jq >/dev/null 2>&1 || exit 0

read_hook_stdin

prompt="$(printf '%s' "$HOOK_INPUT" | jq -r '.prompt // empty' 2>/dev/null)"
[[ -z "$prompt" ]] && exit 0

if ! printf '%s' "$prompt" | grep -qiE '\b(build|implement|add|ship|fix|refactor|audit|review|write|create|debug|migrate|port|extract|dedupe|simplify|clean.up)\b'; then
  exit 0
fi

tdd_required="no"
if printf '%s' "$prompt" | grep -qiE '\b(implement|build|design|create|write)\b.*\b(class|function|algorithm|parser|validator|reducer|middleware|handler|rate.?limiter|cache|queue|scheduler|state.?machine|fsm|protocol|codec|compiler|interpreter|serializer|encoder|decoder|hash|crypt|auth|guard|policy|router)\b' \
  || printf '%s' "$prompt" | grep -qiE '\b(correctness.?critical|infrastructure code|production code|core logic|business logic|security.?sensitive|concurrent|thread.?safe|atomic)\b' \
  || printf '%s' "$prompt" | grep -qiE '\b(fix|regression).*\b(bug|crash|error|failing test)\b'; then
  tdd_required="yes"
fi

multi_file="no"
if printf '%s' "$prompt" | grep -qiE '\b(multi.?file|across|refactor|reorganize|audit|review|build.*system|redesign|plan and implement)\b' \
  || [[ "$tdd_required" == "yes" ]]; then
  multi_file="yes"
fi

do_block=""
if [[ "$multi_file" == "yes" ]]; then
  do_block=$'\n- `Skill(skill: "do")` — front-door classifier; routes to the right sub-workflow (ship-feature / fix-bug / refactor-safely / security-audit / onboard-codebase) and loads research-first.'
fi

tdd_block=""
if [[ "$tdd_required" == "yes" ]]; then
  tdd_block=$'\n- `Skill(skill: "test-driven-development")` — red → green → refactor iron law. Required for any correctness-critical impl, net-new class/algorithm, bug fix (regression test first), or any code where "works" is ambiguous without tests. Non-negotiable.'
fi

injection="## Skill invocation directive (required for this turn — injected by yka-code hook)

This turn involves code work. Before your FIRST Bash/Edit/Write/Read tool call on this task, you MUST invoke these \`Skill\` tool calls in parallel:

- \`Skill(skill: \"karpathy-guidelines\")\`
- \`Skill(skill: \"coding-style\")\`${do_block}${tdd_block}

Before you emit ANY claim of completion (\"done\", \"complete\", \"shipped\", \"passes\", \"ready\", \"fixed\", \"works\", \"all good\", a checkmark, \"lgtm\"), AFTER any \`Write\` / \`Edit\` / \`MultiEdit\` in this turn, you MUST invoke:

- \`Skill(skill: \"verification-before-completion\")\` — upstream iron-law self-challenge. Re-runs verification commands and produces fresh evidence before you're allowed to say \"done\".

These are requirements, not suggestions. \`stop-verification-check.sh\` emits a post-hoc advisory on skips."

if command -v python3 >/dev/null 2>&1; then
  python3 - "$injection" <<'PY' 2>/dev/null || true
import json, sys
print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": sys.argv[1]}}))
PY
else
  printf '%s' "$injection" | jq -Rs --arg event "UserPromptSubmit" '{hookSpecificOutput: {hookEventName: $event, additionalContext: .}}'
fi

exit 0
