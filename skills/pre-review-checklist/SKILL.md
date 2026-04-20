---
name: pre-review-checklist
description: [yka-code] Pre-submit self-review gate. Use BEFORE running `git commit`, before claiming a task is "done", or before invoking `pr-review-toolkit`. Catches the issues post-hoc multi-agent review would find — tests failing, types dirty, lint warnings, debug leftovers, comment rot, scope creep — but earlier, cheaper, and locally. Complements `pr-review-toolkit:review-pr` (reactive, multi-agent, after push) with proactive self-review before the diff leaves the workstation.
---

# Pre-review-checklist

Submitting a diff without running the checklist is why `pr-review-toolkit` keeps finding the same 5 issues on every PR. This skill fires before commit and catches them locally in 60 seconds, so the multi-agent review can focus on real signal.

## When to activate

- User says: "commit this", "is this ready", "I think we're done", "/commit", "push this"
- Before invoking `pr-review-toolkit:review-pr` (chain this FIRST)
- After `ship-feature` Phase 1 (implementation) — before Phase 2 (multi-agent review)
- Any turn where Claude is about to claim "task complete"

Skip for: uncommitted exploration, scratch work in `tasks/` / `notes/`, config-only changes that don't execute.

## The checklist

Run these in order. Stop at the first red and fix before continuing. Don't skip to the next check hoping the red clears itself.

### 1. Tests pass

```bash
bun test        # or: pytest / cargo test / go test ./... / npm test
```

If no test command is standard for the project, run whatever CI runs (check `.github/workflows/*.yml` or `justfile`). If the touched code has no tests and the change is non-trivial, escalate to `test-driven-development` (add one) or `evals-first` (if it's LLM-behavior code).

### 2. Types clean

```bash
bun run typecheck   # or: bunx tsc --noEmit / mypy / cargo check / go vet ./...
```

Type warnings are not acceptable. "It runs fine" is not a type check.

### 3. Lint clean

```bash
# project-specific — check package.json / pyproject.toml / justfile
bun run lint
```

Lint warnings in YOUR diff are blockers. Pre-existing warnings in unchanged files are the user's call.

### 4. No debug leftovers

```bash
rg -n 'console\.log|debugger|pdb\.set_trace|dbg!\(|fmt\.Println|print\(.*# debug' -- $(git diff --name-only HEAD)
```

Empty output = clean. Any hit = remove or justify.

### 5. No stale TODOs from this diff

```bash
rg -n 'TODO|FIXME|XXX|HACK' -- $(git diff --name-only HEAD)
```

If you added a TODO, either file an issue and commit with the issue link in the comment, or delete the TODO and do the work now. Dangling TODOs rot.

### 6. No orphaned imports / dead code your change created

Visual scan the diff. Removed a call site? Did you remove the import? Removed a function's last caller? Did you remove the function?

```bash
git diff --stat HEAD        # scope-check: do the file counts match what you meant to change?
```

### 7. Comments earn their place

Per `coding-style` rule 1: a comment exists only for hidden constraint / subtle invariant / bug workaround / non-obvious tradeoff. Re-read every new comment: if removing it wouldn't confuse a future reader, delete it.

### 8. Scope-check

Does every changed line trace to the user's request? If you "improved" adjacent code while you were in the file, split that into a separate commit or revert it. `karpathy-guidelines` Surgical Changes rule.

### 9. CLAUDE.md / README updated if public surface changed

If you added/renamed a CLI flag, a skill's name, a plugin routing, or an env var: the relevant CLAUDE.md / README / docs/ entry needs the same update in the same commit. Invoke `doc-hygiene` for the doc edits.

### 10. Hook + settings wiring consistent

If the diff touched:
- A new hook script → is it registered in `deployHooks()` (core.ts) AND in `HOOK_EVENT_KEYS` (utils.ts) if it's a new event?
- A new skill → is it in `skills/do/SKILL.md` routing table?
- A new CLI component → is it in `components/index.ts` category lists?
- A new env var → is it in `appendToShellRc()` via `core.ts`?

Leaving any of these unwired is the #1 class of "works on my machine" bug.

## The commit gate

Only commit when ALL checks pass. If any check fails, the diff isn't done.

If the project's CI runs more than this checklist (integration tests, security scans), note the extra signals this checklist DOESN'T cover — the user may want to escalate to `ship-feature` Phase 2 (`pr-review-toolkit`) or run CI locally before committing.

## Hard rules

1. **Never commit with a failing test.** Even if "it's unrelated." Flake or real bug — both need investigating before the commit goes out.
2. **Never commit with type errors.** The next person reads a red inbox as "broken build."
3. **Never commit with debug prints.** The hook `stop-summary` will call them out, but that's post-hoc noise.
4. **Never skip the checklist "because it's a small change."** The small changes are the ones where forgotten wires bite hardest.
5. **Never invoke `pr-review-toolkit:review-pr` without running this first.** You're wasting multi-agent reviewer tokens on issues the local checklist would catch in 60 seconds.

## Chains with

- **`ship-feature`** Phase 2 — this skill fires right before Phase 2's multi-agent review.
- **`fix-bug`** final phase — before committing the fix, run this.
- **`test-driven-development`** / **`evals-first`** — if check 1 (tests) fails and coverage is weak, escalate.
- **`doc-hygiene`** — if check 9 (docs) triggers, delegate the doc edits.
- **`coding-style`** — checks 4, 6, 7, 8 are enforcements of coding-style rules 1-5.
- **`pr-review-toolkit:review-pr`** — the post-push counterpart. Both run; this one first.

## What this skill avoids

- Reinventing `pr-review-toolkit` — that plugin owns the multi-agent deep review after push. This skill is the fast local gate.
- Opinions on commit message format — `caveman-commit` / `commit-commands:commit` own that.
- Deciding whether to open a PR — that's `commit-commands:commit-push-pr`.
