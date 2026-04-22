---
name: hooks-list
description: "[yka-code] Show which yka-code hooks are currently enabled vs disabled (state file + YKA_HOOKS_BYPASS env var)."
allowed-tools: Bash
disable-model-invocation: true
---

# /hooks-list

Run:

```bash
if command -v yka-code-setup >/dev/null 2>&1; then
  yka-code-setup hooks list
else
  echo "yka-code-setup not on PATH. Install it globally: cd <yka-code repo> && bun link"
  exit 1
fi
```

Show the output verbatim. No further action.
