#!/usr/bin/env bash
# Inside forge-dev: install → uninstall (deep) → verify zero residue → install again → e2e PASS.
set -o pipefail
LOG=/tmp/forge-uninstall-test
rm -rf "$LOG" && mkdir -p "$LOG"

echo "=== A. fresh install ==="
bash /workspace/forge/dev/install-harness.sh > "$LOG/install1.log" 2>&1 || { echo "  ✗ install1 failed"; tail -20 "$LOG/install1.log"; exit 1; }
echo "  ✓ install1 PASS"

echo
echo "=== B. uninstall ==="
bun /workspace/forge/dist/cli.js uninstall 2>&1 | tee "$LOG/uninstall.log"
UN_RC=${PIPESTATUS[0]}
if [ "$UN_RC" -ne 0 ]; then echo "  ✗ uninstall reported residue"; exit 1; fi
echo "  ✓ uninstall PASS"

echo
echo "=== C. independent residue check ==="
RESIDUE=0
for path in \
  /root/.claude/forge \
  /root/.claude/plugins/marketplaces/forge \
  /root/.claude/plugins/marketplaces/claude-plugins-official \
  /root/.claude/plugins/marketplaces/claude-code-workflows \
  /root/.claude/plugins/marketplaces/claude-code-plugins-plus \
  /root/.claude/plugins/marketplaces/tdd-guard \
  /root/.claude/plugins/cache/forge \
  /root/.claude/plugins/cache/claude-plugins-official \
  /root/.claude/plugins/cache/claude-code-workflows \
  /root/.claude/plugins/cache/claude-code-plugins-plus \
  /root/.claude/plugins/cache/tdd-guard; do
  if [ -e "$path" ]; then echo "  ✗ residue: $path"; RESIDUE=$((RESIDUE+1)); fi
done
# settings.json — no forge statusLine, no enabledPlugins entries for our marketplaces
if grep -q '"forge' /root/.claude/settings.json 2>/dev/null; then
  echo "  ✗ residue: settings.json contains 'forge' references:"
  grep '"forge\|claude-code-workflows\|claude-code-plugins-plus\|tdd-guard\|claude-plugins-official' /root/.claude/settings.json | head -5 | sed 's/^/    /'
  RESIDUE=$((RESIDUE+1))
fi
# known_marketplaces.json residue
if [ -f /root/.claude/plugins/known_marketplaces.json ]; then
  for k in forge claude-plugins-official claude-code-workflows claude-code-plugins-plus tdd-guard; do
    if jq -e --arg k "$k" '.[$k]' /root/.claude/plugins/known_marketplaces.json >/dev/null 2>&1; then
      echo "  ✗ residue: known_marketplaces.json has $k"
      RESIDUE=$((RESIDUE+1))
    fi
  done
fi
[ "$RESIDUE" -eq 0 ] && echo "  ✓ no residue" || { echo "  ✗ $RESIDUE residue items"; exit 1; }

echo
echo "=== D. reinstall + e2e ==="
bash /workspace/forge/dev/e2e-claude.sh > "$LOG/e2e.log" 2>&1
EC=$?
tail -20 "$LOG/e2e.log"
[ $EC -eq 0 ] && echo "FULL CYCLE PASS" || { echo "  ✗ e2e after reinstall failed"; exit 1; }
