---
name: bootstrap
description: Force-run the forge first-time bootstrap. Equivalent to `bunx @yka/forge@latest install`. Use when the auto-prompt was skipped or the install needs retrying.
allowed-tools: Bash
model: haiku
---

# /forge:bootstrap

Run the npm-published forge installer:

```bash
"$HOME/.claude/forge/bin/forge" install 2>/dev/null || bunx -y @yka/forge@latest install
```

After it completes, remind the user to **restart Claude Code** so the 15 sub-plugins activate. Surface the script's stdout verbatim — do not summarize, the user wants to see per-plugin install status.
