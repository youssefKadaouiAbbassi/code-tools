---
name: hooks-disable
description: "[yka-code] Disable a yka-code hook persistently (state file). Use \"all\" for kill-switch. Usage: /hooks-disable pre-pr-gate"
allowed-tools: Bash
argument-hint: <hook-name> | all
disable-model-invocation: true
---

# /hooks-disable

Disable the named hook by appending it to `~/.claude/yka-hooks-disabled`. Persists until re-enabled.

**Hook name:** `$ARGUMENTS`

If `$ARGUMENTS` is empty, tell the user to provide a hook name (e.g. `pre-pr-gate`) or `all`, then stop.

Otherwise run:

```bash
if command -v yka-code-setup >/dev/null 2>&1; then
  yka-code-setup hooks disable $ARGUMENTS
else
  echo "yka-code-setup not on PATH. Install it globally: cd <yka-code repo> && bun link"
  exit 1
fi
```

Show the output verbatim. No further action.

## One-shot alternative (when the user wants bypass for a single command, no persistent state)

Suggest: `YKA_HOOKS_BYPASS=<name> <their-command>` — hook exits 0 for that invocation only.
