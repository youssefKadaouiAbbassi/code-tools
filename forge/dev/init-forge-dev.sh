#!/usr/bin/env bash
# Minimal container init: ensures /root/.claude exists with right perms.
# Plugin install is the forge CLI's job — do NOT install plugins here.
set -euo pipefail
INIT_MARKER="/root/.claude/.forge-dev-initialized"
[ -f "$INIT_MARKER" ] && { echo "[init-forge-dev] skip (already initialized)"; exit 0; }

mkdir -p /root/.claude
chmod 755 /root
chmod -R go+rwX /root/.claude 2>/dev/null || true
# Symlink alt user's ~/.claude so non-root users see the same state
if id -u forge >/dev/null 2>&1; then
  rm -rf /home/forge/.claude
  ln -sf /root/.claude /home/forge/.claude
fi
touch "$INIT_MARKER"
echo "[init-forge-dev] done (minimal mode — CLI owns plugin install)"
