---
name: refactor-safely
description: [yka-code] Safe refactoring workflow using this system's installed plugins. Use when the user asks to refactor, clean up, simplify, deduplicate, extract, or reorganize existing code WITHOUT changing behavior. Not for bug fixes (use fix-bug) or new features (use ship-feature).
---

# Refactor Safely Workflow

Refactor = change structure, preserve behavior. This workflow enforces that via the user's installed tooling.

## Principles (applied throughout)

Load and apply the `karpathy-guidelines` skill alongside this workflow. Short version:

1. **Think Before Coding** — surface assumptions and tradeoffs explicitly; don't silently pick one interpretation.
2. **Simplicity First** — prefer minimal code; no speculative abstractions, no just-in-case configs.
3. **Surgical Changes** — only touch what the task requires; preserve existing style/imports/whitespace.
4. **Goal-Driven Execution** — define the verifiable success criterion up front and loop until it passes.


## Phase 0 — Did this refactor bypass team-do?

Before anything else: does the refactor touch >2 files, involve rename across multiple modules, require a plan + refactor + review pipeline, or need verify-fix iteration? If ANY yes → stop `refactor-safely`, route back to `/do` which will pick **team-do**. `refactor-safely` is for local, single-module refactors.

Only continue if scope is genuinely local.

## When to activate

- User asks: "refactor X", "clean up Y", "simplify this", "extract this into …", "dedupe these"
- Request explicitly does not change observable behavior
- Existing tests must continue passing (if no tests, stop and ask — see Hard Rules)

## Tool dispatch — when to reach for each MCP / skill / agent

| Condition | Tool | Why |
|---|---|---|
| Always — map the code before changing it | `serena` (semantic refs) + `ast-grep` (structural) + `/claude-mem:smart-explore` (AST) — **launch as parallel Task calls in ONE message** | Read-only, independent, 3× speedup |
| Check prior refactors in this area | `/claude-mem:mem-search "<module name>"` | Learn from past attempts |
| Refactor touches external library calls | `docfork` MCP | Confirm current API shape before rewriting call sites — training cutoff may be stale |
| Refactor hypothesis rests on open-source behavior | `deepwiki` MCP | Public repo Q&A — verify lib semantics before restructuring around them |
| Refactor targets DB-layer code | `psql` / `mongosh` / project ORM's CLI | Run EXPLAIN / EXPLAIN ANALYZE directly; no MCP overhead |
| Need to run tests in isolation (parallel experiments) | `container-use` CLI | Per-branch sandboxed test runs |
| Refactor is complex (>5 files cross-cutting) | `/claude-mem:make-plan` + `TeamCreate` persistent team | Plan + keep reviewers in shared context |
| Refactor a public API / library boundary | `pr-review-toolkit:type-design-analyzer` + `pr-review-toolkit:comment-analyzer` | Type invariants + doc accuracy |

## Workflow

### Phase 1 — Establish the behavioral baseline
Before touching any code:
- Run existing tests and record the pass state
- If no tests exist for the code you'll touch, STOP. Tell the user: "No tests cover this code. Refactor-without-tests is a bug factory. Write a characterization test first (capture current behavior) or explicitly accept the risk." Wait for their call.

### Phase 2 — Map what's there
- Use `serena` MCP tools to find all references/types involved
- Use `ast-grep` for structural pattern searches across files
- Use `/claude-mem:mem-search` with the relevant topic — did we refactor this area before? What did we learn?

### Phase 3 — Apply the simplification agent
Spawn the `code-simplifier` subagent (from code-simplifier plugin). Give it the specific files/functions in scope. It is explicitly designed to refine code "while preserving functionality" — constrain it to the targeted region, not the whole file.

Karpathy principles apply: **surgical changes only**. Do not reformat unrelated code. Do not rename things that aren't in scope.

### Phase 4 — Review the diff
Invoke `/code-review:code-review` on the diff. For deeper review, also spawn:
- `pr-review-toolkit:code-simplifier` (duplicate of simplifier but reviewer-mode — catches over-simplification)
- `pr-review-toolkit:type-design-analyzer` — catches type-invariant breakage

### Phase 5 — Verify the baseline
Re-run the same tests from Phase 1. Pass state MUST match. If any test changed, either:
- The refactor introduced a behavior change (bug — revert and start over), OR
- The test was accidentally changed (revert the test and re-verify)

Only proceed if the baseline matches.

### Phase 6 — Commit
`/commit-commands:commit` with a message like `refactor(scope): what changed and why` — the "why" is the refactor's purpose (readability, perf, deduplication), NOT just the what.

## Hard rules

- **No refactor without tests.** Full stop.
- **Do not broaden scope.** Refactor only what was asked. Comment on other issues for a future pass.
- **Preserve imports, whitespace conventions, naming style** that exists in the file. Read before writing.
- **No "while we're at it" additions** — new features belong in ship-feature, bug fixes belong in fix-bug.

## Example invocation

User: "Clean up the auth middleware — it's gotten tangled."

1. Run test suite → 42 pass, 0 fail, 3 skip — baseline recorded
2. `serena` symbol-search for callers of middleware functions; `ast-grep` for similar patterns elsewhere
3. `/claude-mem:mem-search "auth middleware"` → find a past note about a tricky session-token edge case
4. Spawn `code-simplifier` agent on `src/middleware/auth.ts` only
5. `/code-review:code-review` + `pr-review-toolkit:type-design-analyzer` review the diff
6. Re-run tests → 42/0/3 matches baseline ✓
7. `/commit-commands:commit` → "refactor(auth): extract session-token helper, inline single-use guard"

## Chains to (synergy)

- **`test-driven-development`** — if no tests cover the target, write characterization tests FIRST (red → green captures current behavior), then refactor.
- **`fix-bug`** — if the refactor exposes a real bug (not just smell), stop refactoring and route there.
- **`ship-feature`** — if the refactor reveals missing feature scope, don't fold it in; queue as separate ship-feature work.
- **`doc-hygiene`** — if public API shape changes (rename, signature), doc updates land under its rules.

## What this skill avoids

- Changing behavior under the guise of a refactor
- Refactoring untested code without acknowledgment
- Fixing bugs "while you're there" — those are a different workflow (fix-bug)
