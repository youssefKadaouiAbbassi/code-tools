---
name: update
description: Force a forge update check or toggle the per-session autoupdate prompt. Wraps `bunx forge update`.
allowed-tools: Bash
model: haiku
---

# /forge:update

`$ARGUMENTS` is one of `enable`, `disable`, `status`, or empty (force update now).

```bash
"$HOME/.claude/forge/bin/forge" update $ARGUMENTS 2>/dev/null || bunx -y @yka/forge@latest update $ARGUMENTS
```

Surface stdout verbatim. No summarization. If updates were applied, remind the user to `/reload-plugins` or restart Claude Code.
