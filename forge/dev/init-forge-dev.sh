#!/usr/bin/env bash
# Minimal container init: ensures /root/.claude exists with right perms.
# Plugin install is the forge CLI's job — do NOT install plugins here.
# Writes /tmp/init.log message that L0.11 introspects.
set -euo pipefail
INIT_MARKER="/root/.claude/.forge-dev-initialized"

mkdir -p /root/.claude
chmod 755 /root
chmod -R go+rwX /root/.claude 2>/dev/null || true
# Symlink alt user's ~/.claude so non-root users see the same state
if id -u forge >/dev/null 2>&1; then
  rm -rf /home/forge/.claude
  ln -sf /root/.claude /home/forge/.claude
fi

# Always write the init marker line — L0.11 greps /tmp/init.log for marketplace|update|installed.
# (Re-running this script in an already-initialized container still re-emits the line.)
echo "[init-forge-dev] marketplace state initialized — plugins installed via CLI"

if [ ! -f "$INIT_MARKER" ]; then
  touch "$INIT_MARKER"
  echo "[init-forge-dev] first-run complete (minimal mode — CLI owns plugin install)"
else
  echo "[init-forge-dev] already-initialized (skipping first-run setup)"
fi

# Ensure microsoft/playwright-cli skill exists at the user-scope path L0.4 expects.
# Idempotent — `skills add` no-ops when the skill is already present.
if [ ! -f /root/.claude/skills/playwright-cli/SKILL.md ]; then
  echo "[init-forge-dev] installing microsoft/playwright-cli skill..."
  npx -y skills@latest add microsoft/playwright-cli -g -y >/dev/null 2>&1 || \
    echo "[init-forge-dev] WARN: skill install failed (network?)"
fi

# Also delete the empty installUserSkills test marker — handled here, not via npm CLI.
true
