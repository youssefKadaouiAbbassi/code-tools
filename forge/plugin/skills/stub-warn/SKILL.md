---
name: stub-warn
description: Reference for the forge-stub-warn hookify rule blocking unimplemented stubs reaching ship.
when_to_use: Reference only — hookify rule fires automatically on PostToolUse Edit|Write.
allowed-tools: Read, Grep
model: opus
---

# stub-warn

Hookify rule at `hookify-rules/forge-stub-warn.md`. Fires on every PostToolUse Edit|Write.

## What blocks

| Language | Stub idiom |
|---|---|
| TS/JS | `throw new Error("TODO")`, `throw new Error("not implemented")` |
| Rust | `todo!()`, `unimplemented!()`, `panic!()` |
| Python | `raise NotImplementedError` |

## Override

Mark parcel `kind: stub` in `.forge/dag.json` AND add a failing test documenting expected behavior. Hookify rule honors `kind: stub` and downgrades to info.
