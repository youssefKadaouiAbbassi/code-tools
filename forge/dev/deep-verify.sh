#!/usr/bin/env bash
set -o pipefail
LOG=/tmp/forge-deep-verify
rm -rf "$LOG" && mkdir -p "$LOG"
FAIL=0

bash /workspace/forge/dev/install-harness.sh > "$LOG/install.log" 2>&1 || { echo "install failed"; tail -20 "$LOG/install.log"; exit 1; }

echo "=== A. each enabled plugin has loadable components ==="
# Resolve plugin dir dynamically; pass if ANY of {SKILL.md, agent, command, hooks.json, plugin.json} exists
for spec in forge@forge feature-dev@claude-plugins-official pr-review-toolkit@claude-plugins-official ralph-loop@claude-plugins-official tdd-workflows@claude-code-workflows tdd-guard@tdd-guard mutation-test-runner@claude-code-plugins-plus protect-mcp@claude-code-workflows; do
  plugin=${spec%@*}; market=${spec#*@}
  dir=$(find /root/.claude/plugins/marketplaces/$market /root/.claude/plugins/cache/$market -maxdepth 4 -type d \( -name "$plugin" -o -path "*$plugin/*" \) 2>/dev/null | head -1)
  [ -z "$dir" ] && dir=$(find /root/.claude/plugins -path "*$plugin*" -name plugin.json 2>/dev/null | head -1 | xargs -r dirname | xargs -r dirname)
  if [ -z "$dir" ] || [ ! -d "$dir" ]; then
    # fallback: forge is from local path
    [ "$spec" = "forge@forge" ] && dir=/workspace/forge/plugin
  fi
  if [ -z "$dir" ] || [ ! -d "$dir" ]; then
    echo "  ✗ $spec: no dir located"; FAIL=$((FAIL+1)); continue
  fi
  n_skill=$(find "$dir" -maxdepth 6 -name SKILL.md 2>/dev/null | wc -l)
  n_agent=$(find "$dir/agents" -maxdepth 4 -name "*.md" 2>/dev/null | wc -l)
  n_cmd=$(find "$dir/commands" -maxdepth 4 -name "*.md" 2>/dev/null | wc -l)
  has_hooks=$([ -f "$dir/hooks/hooks.json" ] && echo yes || echo no)
  has_manifest=$([ -f "$dir/.claude-plugin/plugin.json" ] && echo yes || echo no)
  total=$((n_skill + n_agent + n_cmd))
  if [ $total -gt 0 ] || [ "$has_hooks" = "yes" ]; then
    echo "  ✓ $spec: skills=$n_skill agents=$n_agent cmds=$n_cmd hooks=$has_hooks manifest=$has_manifest"
  else
    echo "  ✗ $spec: no components found in $dir"; FAIL=$((FAIL+1))
  fi
done

echo
echo "=== B. forge .mcp.json declares servers ==="
MCP=$(find /root/.claude/plugins -name .mcp.json -path "*forge*" 2>/dev/null | head -1)
[ -z "$MCP" ] && MCP=/workspace/forge/plugin/.mcp.json
if [ -f "$MCP" ]; then
  for srv in docfork deepwiki github snyk; do
    jq -e --arg s "$srv" '.mcpServers[$s]' "$MCP" >/dev/null 2>&1 \
      && echo "  ✓ $srv declared" || { echo "  ✗ $srv missing in $MCP"; FAIL=$((FAIL+1)); }
  done
else
  echo "  ✗ .mcp.json not found"; FAIL=$((FAIL+1))
fi

echo
echo "=== C. SessionStart hook ==="
HOOK=$(find /root/.claude/plugins -name forge-status-check.sh | head -1)
[ -z "$HOOK" ] && HOOK=/workspace/forge/plugin/hooks/forge-status-check.sh
out=$(echo '{"hook_event_name":"SessionStart","session_id":"abc","cwd":"/tmp","source":"startup"}' | bash "$HOOK" 2>&1)
[ $? -eq 0 ] && echo "  ✓ SessionStart exit 0 (no updates pending)" || { echo "  ✗ SessionStart errored"; FAIL=$((FAIL+1)); }

echo
echo "=== D. tdd-guard responds to PreToolUse ==="
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"/tmp/x","old_string":"a","new_string":"b"},"session_id":"abc","cwd":"/tmp"}' | npx -y tdd-guard@latest 2>&1)
ec=$?
[ $ec -eq 0 ] || [ $ec -eq 2 ] && echo "  ✓ tdd-guard exit=$ec" || { echo "  ✗ tdd-guard errored"; FAIL=$((FAIL+1)); }

echo
echo "=== E. enabledPlugins count = 9 ==="
COUNT=$(jq '.enabledPlugins | with_entries(select(.value==true)) | length' /root/.claude/settings.json)
keys=$(jq -r '.enabledPlugins | keys[]' /root/.claude/settings.json)
[ "$COUNT" -eq 9 ] && echo "  ✓ exactly 9: $(echo "$keys" | tr '\n' ' ')" || { echo "  ✗ count = $COUNT (expected 9):"; echo "$keys" | sed 's/^/    /'; FAIL=$((FAIL+1)); }

echo
echo "=== F. claude -p sees forge skills ==="
out=$(claude -p "List EXACTLY the names of the plugin-provided skills currently available, one per line, then on a new line print DONE." --permission-mode acceptEdits --model claude-haiku-4-5-20251001 2>"$LOG/F_stderr")
echo "$out" > "$LOG/F_stdout"
for sk in feature-dev pr-review-toolkit ralph-loop tdd-red protect-mcp; do
  grep -qi "$sk" "$LOG/F_stdout" && echo "  ✓ '$sk' visible" || { echo "  ✗ '$sk' NOT visible"; FAIL=$((FAIL+1)); }
done

echo
echo "=== G. claude -p starts MCPs without error ==="
if grep -qi 'mcp.*error\|failed to start.*mcp' "$LOG/F_stderr"; then
  echo "  ✗ MCP errors in claude -p stderr:"; grep -i mcp "$LOG/F_stderr" | head -5 | sed 's/^/    /'; FAIL=$((FAIL+1))
else
  echo "  ✓ no MCP startup errors in stderr"
fi

echo
echo "=== SUMMARY ==="
[ $FAIL -eq 0 ] && echo "DEEP VERIFY PASS" || { echo "DEEP VERIFY FAIL: $FAIL — see $LOG/"; exit 1; }
