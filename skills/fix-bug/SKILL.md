---
name: fix-bug
description: [yka-code] Systematic bug-fix workflow. Use when the user reports a bug, error, crash, failing test, unexpected behavior, or says something is "broken". Leverages claude-mem (past solutions), Explore agent (codebase), silent-failure-hunter (for fallback-hiding bugs), and existing tests. Not for new features or refactors.
---

# Fix Bug Workflow

A bug is a behavior that violates an expectation. The workflow is: reproduce → understand → hypothesize → fix → prove.

## Principles (applied throughout)

Load and apply the `karpathy-guidelines` skill alongside this workflow. Short version:

1. **Think Before Coding** — surface assumptions and tradeoffs explicitly; don't silently pick one interpretation.
2. **Simplicity First** — prefer minimal code; no speculative abstractions, no just-in-case configs.
3. **Surgical Changes** — only touch what the task requires; preserve existing style/imports/whitespace.
4. **Goal-Driven Execution** — define the verifiable success criterion up front and loop until it passes.


## When to activate

- User reports: "X is broken", "Y crashes", "Z returns wrong result", "test Foo is failing", "this doesn't work"
- User pastes an error trace or failing test output
- User asks for a fix (not a feature, not a cleanup)

## Tool dispatch — when to reach for each MCP / skill / agent

| Condition | Tool | Why |
|---|---|---|
| Always, first thing | `/claude-mem:mem-search` | Cheap; might already be solved |
| Bug is in unfamiliar library code | `docfork` MCP (needs `DOCFORK_API_KEY`) | Library's current API/behavior |
| "Has anyone in OSS hit this bug?" | `deepwiki` MCP | Free Q&A over public repos |
| Bug spans multiple files; need cheap structural search | `/claude-mem:smart-explore` | AST-based; cheaper than Read + grep |
| Bug involves SQL / DB query / schema | `psql` / `mongosh` / project ORM CLI | Run EXPLAIN ANALYZE on the failing query directly |
| Bug involves an external SaaS integration | `composio` MCP (needs `COMPOSIO_API_KEY`) | Covers 500+ services |
| Need to test the fix in isolation | `container-use` CLI | Sandboxed branches per agent |
| Bug is a UI/form-flow regression that needs browser repro | `playwright-cli` skill | CLI-driven browser automation — capture snapshots + console logs per step |
| Past similar fixes in related repos | `github` MCP (needs `GITHUB_PAT`) | Cross-repo PR/issue search |
| Error trace is massive + long context | Consider `context-mode` MCP | Context compression for long sessions |

## Workflow

### Phase 0 — Did this bug bypass team-do?

Before Phase 1 fires: does the fix touch >2 files, involve plan + fix + review as distinct steps, or need a verify-fix iteration loop? If ANY yes → stop `fix-bug`, route back to `/do` which will pick **team-do**. `fix-bug` is for single-file, bounded bug fixes.

Only continue if the fix is genuinely local.

### Phase 1 — Check memory first (cheap)
**Before touching any code**, run `/claude-mem:mem-search` with the error signature / symptom. If we've solved this or a cousin before, the answer may already be in memory. This is free — always check.

### Phase 2 — Reproduce
- If there's a failing test, run it. That IS the repro.
- If there's an error trace, note the file:line. Read enough context around it (20 lines before, 20 after) to understand the state at the error point.
- If there's neither test nor trace, ask the user for exact repro steps. Do NOT start fixing without a repro.

### Phase 3 — Understand the code path
- Spawn `Explore` agent to trace the call graph from entry point to the failure point
- Use `serena` MCP for type-accurate cross-references (where is this function called? what types flow in?)
- Use `ast-grep` to find similar patterns elsewhere that might have the same bug

### Phase 4 — Form a hypothesis
Write down (in a comment or scratch buffer) your best guess for WHY the bug happens. Not what code to change — the root cause. Examples:
- "The DB connection pool is exhausted because this code doesn't release on error paths"
- "The middleware mutates `req.user` after the handler reads it"
- "The cache TTL is smaller than the upstream timeout, causing a race"

If you can't articulate a root cause in one sentence, go back to Phase 3.

### Phase 5 — Hunt for silent failures around the fix site
Before editing, spawn `pr-review-toolkit:silent-failure-hunter` on the file(s) you'll touch. Bugs often cluster — the one reported is rarely the only one. This catches catch-blocks that swallow errors, fallbacks that mask real failures, etc.

### Phase 5.5 — Plan-iterate before non-trivial fixes (native plan mode)

If the fix touches >1 file OR changes a public API OR crosses a module boundary, enter Claude Code's native plan mode (`EnterPlanMode` / `Shift+Tab`) with the hypothesis from Phase 4. Present the proposed fix shape — file list, approach, test strategy — to the user. Iterate until approved, then exit plan mode. Skip plan-iterate for single-file, local fixes.

### Phase 6 — Fix + test

**Before writing the regression test, invoke `Skill(skill: "test-driven-development")`.** Not "consider" — call. The upstream skill owns the RED → GREEN → REFACTOR cycle; the regression test must be written red-first (failing against the current, buggy code) before any fix lands.

- Apply the MINIMUM change that addresses the root cause. Resist scope creep (Karpathy: surgical changes).
- Write a regression test that fails before the fix and passes after. If a test already exists (and was failing), make sure it passes.
- Run the full test suite — bugs often have cascading fixes; don't break adjacent things.

### Phase 6.5 — Verification before completion

**Before claiming the fix is done, invoke `Skill(skill: "verification-before-completion")`.** Non-negotiable. The regression-test red → green cycle and full test suite exit code must both be verified fresh. No "Done!" without this.

### Phase 7 — Review + commit
- `/code-review:code-review` on the diff — a second pass in case something sneaked by
- `/commit-commands:commit` with a message like `fix(scope): root cause, not symptom`

## Hard rules

- **No fix without a repro.** Asking "is this fixed?" without a way to check is useless.
- **Fix the cause, not the symptom.** Wrapping a try/catch around a NullPointerException is not a fix.
- **Regression test mandatory.** If the bug escaped, it's because nothing was testing the invariant. Add that test.
- **Check memory first.** Repeated bugs are a 10-second `/claude-mem:mem-search` away from being "fixed in the past".

## Example invocation

User: "The login endpoint returns 500 when the user's email has a + sign in it."

1. `/claude-mem:mem-search "login email + sign"` → no prior knowledge
2. Repro: craft a curl with `test+tag@example.com`, see the 500. Grep logs for the error — `InvalidEmail: expected RFC-5321 compliant`.
3. `Explore` → trace from `/api/login` → through `validateEmail()` → into `lib/email.ts:42` (a regex that doesn't allow `+`)
4. `serena` find-references → 3 other callers of `validateEmail()`; they're all signup/recovery — same bug affects all of them.
5. Hypothesis: "The regex in lib/email.ts:42 is too strict — `+` is valid per RFC 5321 but `/^[a-zA-Z0-9.@]+$/` rejects it."
6. `pr-review-toolkit:silent-failure-hunter` on lib/email.ts → flags a `try { ... } catch { return false; }` that hides parse errors. Note for follow-up.
7. Fix: replace the regex with a real email parser (or tighten the pattern to include `+`, `-`, `_`). Write test `"test+tag@example.com"` → passes.
8. Run full suite → 42 pass (up from 41 — the new regression test).
9. `/code-review:code-review` → clean.
10. `/commit-commands:commit` → `fix(email): allow RFC-5321 local-part chars (+, -, _)`.

## Chains to (synergy)

- **`brainstorming`** (UPSTREAM) — only if the user's bug report is fuzzy ("something's wrong, can't quite say what"). Normally skip.
- **`test-driven-development`** — See Phase 6 — invoked there as an explicit tool call, not an optional chain.
- **`verification-before-completion`** — See Phase 6.5 — invoked there as an explicit tool call, not an optional chain.
- **`refactor-safely`** — if the fix reveals tangled surrounding code, queue a separate refactor pass (don't fold it in).
- **`doc-hygiene`** — if the fix invalidates a doc claim, update docs in the same PR.
- **`security-audit`** — if the bug is a security issue (CVE, auth bypass, injection), escalate before committing.

## What this skill avoids

- Slapping try/catch over the error without understanding why
- Fixing only the reported symptom when the bug affects multiple callers
- Adding the fix without the regression test
- Opportunistically refactoring the surrounding code (save that for refactor-safely)
