#!/usr/bin/env bash
# Defers to the install-time wrapper at ~/.claude/forge/bin/forge, which resolves to
# either local dist (--local install) or `bunx -y @yka/forge@latest` (npm install).
WRAPPER="$HOME/.claude/forge/bin/forge"
if [[ -x "$WRAPPER" ]]; then
  exec "$WRAPPER" doctor --quiet 2>/dev/null || exit 0
fi
exec bunx -y @yka/forge@latest doctor --quiet 2>/dev/null || exit 0
