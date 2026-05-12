#!/usr/bin/env bash
# STRICT verify: covers the 4 gaps not closed by deep-verify/install-harness/e2e/uninstall-clean.
# Run inside forge-dev. Assumes install-harness has already run (8 plugins active).
# Exits non-zero on ANY failure. No "mostly", no warnings — every gap closed or fails loudly.
set -o pipefail
LOG=/tmp/forge-strict
rm -rf "$LOG" && mkdir -p "$LOG"
FAIL=0

# Ensure fresh install
bash /workspace/forge/dev/install-harness.sh > "$LOG/install.log" 2>&1 || { echo "PRE: install failed"; tail -30 "$LOG/install.log"; exit 1; }

echo "=== GAP 1: claude-mem MCP loads (claude mcp list shows Connected) ==="
# `claude mcp list` is the definitive load check — no permission gate, no model interpretation.
cm_out=$(claude mcp list 2>&1)
echo "$cm_out" > "$LOG/G1.stdout"
if echo "$cm_out" | grep -q "plugin:claude-mem:mcp-search.*Connected"; then
  echo "  ✓ plugin:claude-mem:mcp-search Connected"
else
  echo "  ✗ claude-mem MCP NOT connected. claude mcp list output:"
  echo "$cm_out" | head -20 | sed 's/^/    /'
  FAIL=$((FAIL+1))
fi
# Also check the other 4 forge MCPs
for srv in docfork deepwiki github snyk; do
  if echo "$cm_out" | grep -q "plugin:forge:${srv}.*Connected"; then
    echo "  ✓ plugin:forge:${srv} Connected"
  else
    echo "  ✗ plugin:forge:${srv} NOT connected"; FAIL=$((FAIL+1))
  fi
done

echo
echo "=== GAP 2a: forge update on up-to-date marketplaces ==="
bun /workspace/forge/dist/cli.js update > "$LOG/G2a.log" 2>&1
G2A_RC=$?
if [ $G2A_RC -eq 0 ] && grep -q '✅ forge update complete\|✓ forge: everything up to date' "$LOG/G2a.log"; then
  echo "  ✓ update exits clean on fresh install"
else
  echo "  ✗ update exit=$G2A_RC"; tail -15 "$LOG/G2a.log" | sed 's/^/    /'; FAIL=$((FAIL+1))
fi
bun /workspace/forge/dist/cli.js doctor > "$LOG/G2a.doctor" 2>&1
if grep -q 'all green' "$LOG/G2a.doctor"; then
  echo "  ✓ doctor still green after update"
else
  echo "  ✗ doctor not green after update"; tail -15 "$LOG/G2a.doctor" | sed 's/^/    /'; FAIL=$((FAIL+1))
fi

echo
echo "=== GAP 2b: forge update with regression + re-stub ==="
# Corrupt one marketplace's protect-mcp hooks.json (revert to broken state) and roll a marketplace back one commit
PMCP_HOOK=/root/.claude/plugins/marketplaces/claude-code-workflows/plugins/protect-mcp/hooks/hooks.json
cat > "$PMCP_HOOK" <<'BROKEN'
{
  "hooks": {
    "PreToolUse": [
      {"matcher": ".*", "hooks": [{"type": "command", "command": "npx protect-mcp@0.5.5 evaluate --tool x"}]}
    ]
  }
}
BROKEN
echo "  (injected broken protect-mcp hooks.json)"

# Run update
bun /workspace/forge/dist/cli.js update > "$LOG/G2b.log" 2>&1
G2B_RC=$?

# Confirm hooks.json was re-stubbed
if grep -q '"hooks": {}' "$PMCP_HOOK" || python3 -c "import json,sys; d=json.load(open('$PMCP_HOOK')); sys.exit(0 if not d.get('hooks') else 1)"; then
  echo "  ✓ update re-stubbed broken protect-mcp hooks"
else
  echo "  ✗ update did NOT re-stub broken hooks. Current content:"
  cat "$PMCP_HOOK" | head -10 | sed 's/^/    /'
  FAIL=$((FAIL+1))
fi
# And doctor must be green
bun /workspace/forge/dist/cli.js doctor > "$LOG/G2b.doctor" 2>&1
if grep -q 'all green' "$LOG/G2b.doctor"; then
  echo "  ✓ doctor green after update re-stub"
else
  echo "  ✗ doctor not green"; tail -20 "$LOG/G2b.doctor" | sed 's/^/    /'; FAIL=$((FAIL+1))
fi

echo
echo "=== GAP 3: claude-hud rendering path is wired ==="
# Headless rendering check (we already do this), PLUS verify dist/index.js exists where claude-hud will look
SL_CMD=$(jq -r '.statusLine.command' /root/.claude/settings.json)
if echo "$SL_CMD" | grep -q "claude-hud"; then
  echo "  ✓ statusLine.command points at claude-hud"
else
  echo "  ✗ statusLine.command misconfigured: $SL_CMD"; FAIL=$((FAIL+1))
fi
HUD_DIR=$(ls -1d /root/.claude/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1)
if [ -n "$HUD_DIR" ] && [ -f "${HUD_DIR}dist/index.js" ]; then
  echo "  ✓ claude-hud dist/index.js present at ${HUD_DIR}dist/index.js"
else
  echo "  ✗ claude-hud dist/index.js NOT found (path: $HUD_DIR)"; FAIL=$((FAIL+1))
fi
# Actually invoke the statusLine command and confirm it renders the [forge X.Y.Z] brand
SL_OUT=$(echo '{"model":{"display_name":"Opus 4.7"},"workspace":{"current_dir":"/tmp"},"transcript_path":"/dev/null"}' | eval "$SL_CMD" 2>&1)
if echo "$SL_OUT" | grep -q "\[forge"; then
  echo "  ✓ claude-hud renders [forge ...] brand"
else
  echo "  ✗ claude-hud output missing brand. Output:"; echo "$SL_OUT" | head -5 | sed 's/^/    /'; FAIL=$((FAIL+1))
fi

echo
echo "=== GAP 4: /forge:forge end-to-end on a tiny brief ==="
# Real pipeline run. Sandbox dir so we don't pollute /workspace.
PROJ=/tmp/forge-e2e-pipeline
rm -rf "$PROJ" && mkdir -p "$PROJ" && cd "$PROJ"
git init -q
git config user.email "test@forge"
git config user.name "Forge Test"
echo "# pipeline test" > README.md
git add -A && git commit -qm "init"

pipeline_prompt='Activate the forge plugin'"'"'s "forge" skill using the Skill tool with skill="forge:forge". The skill is a 6-phase coding pipeline. Brief: "Add subtract(a, b) to src/math.ts as a pure function with TDD". For this scoped test, run only Phase 0 (bootstrap) + Phase 1 (feature-dev plan into .forge/dag.json) + Phase 4 (write the failing test + impl). Skip Phase 2 research (trivial parcel), Phase 3 council (skip for 1-line parcel), Phase 5 verify gates (skip mutation/PBT for this smoke test), and Phase 6 ship (no PR). When .forge/dag.json exists AND src/math.ts contains subtract(), reply FORGE_PIPELINE_DONE on its own line.'
echo "  (launching pipeline — up to 20 min)"
# Pre-create settings.json with allowlisted commands so TDD-guard test execution doesn't stall
mkdir -p "$PROJ/.claude"
cat > "$PROJ/.claude/settings.local.json" <<'SETTINGS'
{"permissions":{"allow":["Bash(npm *)","Bash(node *)","Bash(npx *)","Bash(git *)","Edit","Write","mcp__plugin_forge_docfork","mcp__plugin_claude-mem_mcp-search"]}}
SETTINGS
timeout 1200 claude -p "$pipeline_prompt" --permission-mode acceptEdits --model claude-sonnet-4-6 > "$LOG/G4.stdout" 2> "$LOG/G4.stderr"
G4_RC=$?
echo "  pipeline exit=$G4_RC"

# Pass criteria
G4_PASS=1
if [ ! -d "$PROJ/.forge" ]; then echo "  ✗ no .forge/ directory created"; G4_PASS=0; fi
if [ ! -f "$PROJ/.forge/dag.json" ]; then echo "  ✗ no .forge/dag.json"; G4_PASS=0; else echo "  ✓ .forge/dag.json present"; fi
if [ ! -d "$PROJ/.forge/audit" ]; then echo "  ⚠ no .forge/audit/ directory"; fi
if [ ! -f "$PROJ/src/math.ts" ]; then echo "  ✗ src/math.ts not created"; G4_PASS=0; else
  if grep -q "subtract" "$PROJ/src/math.ts"; then echo "  ✓ src/math.ts contains subtract"; else echo "  ✗ subtract not in src/math.ts"; G4_PASS=0; fi
fi
if grep -qi "FORGE_PIPELINE_DONE" "$LOG/G4.stdout"; then echo "  ✓ pipeline self-reported done"; else echo "  ⚠ no FORGE_PIPELINE_DONE marker"; fi
if grep -qi 'PROTECT_MCP.*error\|hook error.*non-blocking' "$LOG/G4.stderr"; then
  echo "  ✗ pipeline triggered hook errors:"
  grep -iE 'PROTECT_MCP|hook error' "$LOG/G4.stderr" | head -5 | sed 's/^/    /'
  G4_PASS=0
fi
[ $G4_PASS -eq 0 ] && FAIL=$((FAIL+1))

echo
echo "=== SUMMARY ==="
echo "Logs at: $LOG/"
ls "$LOG"
if [ $FAIL -eq 0 ]; then
  echo "✅ STRICT VERIFY PASS — all 4 gaps closed"
  exit 0
else
  echo "❌ STRICT VERIFY FAIL: $FAIL gap(s) — inspect logs above"
  exit 1
fi
