---
name: forge-stub-warn
enabled: true
event: PostToolUse
matcher: Edit|Write
action: warn
conditions:
  - field: new_text
    operator: regex_match
    pattern: (throw\s+new\s+Error\s*\(\s*['"]\s*(TODO|not\s+implemented)|todo!\s*\(|unimplemented!\s*\(|raise\s+NotImplementedError)
---

⚠️ **Stub body detected!** Replace with real impl, or mark parcel `kind: stub` in `.forge/dag.json` + add a failing test. Stubs surviving PostToolUse fail mutation gate.
