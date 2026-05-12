#!/usr/bin/env bash
set -o pipefail
# Runs inside the forge-dev container. Exercises:
#  1. wipe ~/.claude state (fresh user)
#  2. bun dist/cli.js install --local /workspace/forge
#  3. every hooks.json command in every installed plugin, fed a fake event payload
#  4. statusline command
# Emits PASS/FAIL summary + /tmp/forge-harness/*.log for each failing hook.
set -u
LOG=/tmp/forge-harness
rm -rf "$LOG" && mkdir -p "$LOG"
exec > >(tee "$LOG/run.log") 2>&1

echo "=== 1. wipe ~/.claude state ==="
rm -rf ~/.claude/plugins ~/.claude/forge
# preserve credentials.json and .claude.json (mounted from host); reset settings.json
[ -f ~/.claude/settings.json ] && cp ~/.claude/settings.json ~/.claude/settings.json.harness-bak || true
echo '{"permissions":{"defaultMode":"auto"}}' > ~/.claude/settings.json

echo
echo "=== 2. bun dist/cli.js install --local /workspace/forge ==="
bun /workspace/forge/dist/cli.js install --local /workspace/forge 2>&1 | tee "$LOG/install.log"
INSTALL_RC=${PIPESTATUS[0]}
if [ "$INSTALL_RC" -ne 0 ]; then
  echo "INSTALL FAILED — see $LOG/install.log"
  exit 1
fi

echo
echo "=== 3. exercise every hook with fake payload ==="
FAIL=0
FAKE='{"hook_event_name":"UserPromptSubmit","prompt":"hi","session_id":"abc","cwd":"/tmp"}'
declare -A EVENTS=(
  [UserPromptSubmit]='{"hook_event_name":"UserPromptSubmit","prompt":"hi","session_id":"abc","cwd":"/tmp"}'
  [PreToolUse]='{"hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"/tmp/x"},"session_id":"abc","cwd":"/tmp"}'
  [PostToolUse]='{"hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"/tmp/x"},"tool_response":"ok","session_id":"abc","cwd":"/tmp"}'
  [SessionStart]='{"hook_event_name":"SessionStart","source":"startup","session_id":"abc","cwd":"/tmp"}'
  [Stop]='{"hook_event_name":"Stop","session_id":"abc","cwd":"/tmp"}'
)

for hookfile in $(find ~/.claude/plugins/marketplaces -name hooks.json 2>/dev/null); do
  plugin=$(echo "$hookfile" | sed 's|.*/plugins/\([^/]*\)/.*|\1|')
  # skip plugins not currently enabled
  if ! grep -q "\"$plugin@" ~/.claude/settings.json 2>/dev/null; then continue; fi
  echo "--- $plugin ($hookfile) ---"
  for event in "${!EVENTS[@]}"; do
    # Extract commands matching this event
    cmds=$(jq -r --arg ev "$event" '.hooks[$ev][]?.hooks[]?.command // empty' "$hookfile" 2>/dev/null)
    [ -z "$cmds" ] && continue
    while IFS= read -r cmd; do
      [ -z "$cmd" ] && continue
      expanded=$(echo "$cmd" | sed "s|\${CLAUDE_PLUGIN_ROOT}|$(dirname $(dirname $hookfile))|g")
      tag="${plugin}_${event}"
      out=$(echo "${EVENTS[$event]}" | CLAUDE_PLUGIN_ROOT=$(dirname $(dirname $hookfile)) timeout 15 bash -c "$expanded" 2>&1)
      ec=$?
      if [ $ec -ne 0 ] || echo "$out" | grep -qiE 'permission denied|missing.*separator|traceback|fatal|error.*hook'; then
        echo "  ✗ $event: exit=$ec"
        echo "    cmd: $expanded"
        echo "$out" | head -5 | sed 's/^/    /'
        echo "$out" > "$LOG/${tag}.err"
        FAIL=$((FAIL+1))
      else
        echo "  ✓ $event: exit=$ec"
      fi
    done <<< "$cmds"
  done
done

echo
echo "=== 4. statusline ==="
slout=$(echo '{"model":{"display_name":"Opus 4.7"},"workspace":{"current_dir":"/tmp"}}' | ~/.claude/forge/bin/forge statusline 2>&1)
slec=$?
if [ $slec -eq 0 ] && [ -n "$slout" ]; then
  echo "  ✓ statusline: $slout"
else
  echo "  ✗ statusline: exit=$slec, output=[$slout]"
  FAIL=$((FAIL+1))
fi

echo
echo "=== SUMMARY ==="
if [ $FAIL -eq 0 ]; then
  echo "ALL GREEN. install + hooks + statusline clean."
  exit 0
else
  echo "FAIL count: $FAIL — see $LOG/*.err"
  exit 1
fi
