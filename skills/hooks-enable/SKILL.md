---
name: hooks-enable
description: "[yka-code] Re-enable a yka-code hook. Use \"all\" to clear every disable. Usage: /hooks-enable pre-pr-gate"
allowed-tools: Bash
argument-hint: <hook-name> | all
disable-model-invocation: true
---

# /hooks-enable

Re-enable the named hook by removing it from `~/.claude/yka-hooks-disabled`.

**Hook name:** `$ARGUMENTS`

If `$ARGUMENTS` is empty, tell the user to provide a hook name (e.g. `pre-pr-gate`) or `all` to clear every disable, then stop.

Otherwise run:

```bash
if command -v yka-code-setup >/dev/null 2>&1; then
  yka-code-setup hooks enable $ARGUMENTS
else
  echo "yka-code-setup not on PATH. Install it globally: cd <yka-code repo> && bun link"
  exit 1
fi
```

Show the output verbatim. No further action.
