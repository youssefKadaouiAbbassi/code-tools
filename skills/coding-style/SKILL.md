---
plugin: code-tools
name: coding-style
description: Enforce minimalist, self-documenting, defensively-sane coding style. Use ALWAYS when writing, editing, or reviewing ANY code in ANY language — every function, every edit, every diff, no exceptions. Covers five rules: (1) no comments unless critical (WHY only, never WHAT, never history), (2) clean + optimized (no dead code, no speculative abstractions, no stale imports, delete over deprecate), (3) self-documenting names (full words, verbs for functions, nouns for data), (4) smallest surface (one function one concern, extract only on 3rd reuse, validate only at boundaries), (5) no dead defense (no try/catch for impossible cases, no fallbacks for inputs you control, let errors bubble to the right handler). Pair with karpathy-guidelines for behavioral principles (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution).
paths: "**/*.{ts,tsx,js,jsx,py,go,rs,kt,java,rb,swift,sh,bash,zsh,fish,sql,php,cs,clj,ex,elm,ml,hs,scala,dart,c,cpp,h,hpp,lua,vim,nix,toml,yaml,yml,json,md}"
---

# Coding style

Five rules. Every edit, every function, every diff. No exceptions.

These are *style* — how code should look. For *behavior* (think before coding, simplify, surgical scope, verifiable goals), pair with the `karpathy-guidelines` skill. Both load together at `/do` Phase 0.

## 1. No comments unless critical

Code readable by reading. Names carry the meaning. Comments only exist for the hidden things a reader can't infer.

**Write a comment ONLY when:**
- Hidden constraint a reader can't see (e.g., "must fit in one TCP segment")
- Subtle invariant (e.g., "list is sorted by insertion order, not value")
- Bug workaround with upstream reference (e.g., "reverses order per upstream/#1234")
- Non-obvious tradeoff that would surprise a maintainer

**Never comment:**
- WHAT the code does (names already say it)
- History or task refs ("added for user-auth", "fixes #123", "per PR review")
- Restated logic in natural language
- TODOs (file an issue if it matters, delete otherwise)

**The test:** if you remove the comment, will a future reader be confused by *behavior they couldn't predict from the code*? If no → delete the comment.

See `references/no-comments.md` for examples.

## 2. Clean + optimized

Code is smaller than it was. Every pass reduces surface.

- **No dead code** — unused functions, unused branches, unreachable paths: delete, don't leave for later
- **No speculative abstractions** — don't build generics for a hypothetical second caller; extract when the third caller appears
- **No stale imports** — if you removed a usage, remove the import in the same edit
- **Delete over deprecate** — removed functionality leaves the codebase, no `@deprecated` tombstones
- **Reuse before writing** — grep for existing helpers before writing new ones

**The test:** after your diff, does the codebase have *less* or *equal* surface area? More surface must be justified by a concrete requirement, not "future flexibility."

See `references/clean-optimized.md` for examples.

## 3. Self-documenting names

Names carry intent. Reading the name tells the reader what it does.

- **Verbs for functions:** `parseUserInput`, `persistSession`, `retryUntilStable` — not `handleInput`, `doPersist`, `tryIt`
- **Nouns for data:** `userEmail`, `retryDelay`, `activeConnections` — not `data`, `val`, `conn`
- **Full words over abbreviations:** `user` not `usr`, `connection` not `conn`, `configuration` not `cfg` (unless the abbreviation is itself the canonical term, e.g., `url`, `id`, `db`)
- **Plurals signal collections:** `user` is one; `users` is many
- **Boolean names are predicates:** `isActive`, `hasAccess`, `shouldRetry` — not `active`, `access`, `retry`

**The test:** show the function signature to someone unfamiliar with the codebase. Can they predict what it does from the name + types alone, without reading the body? If no → rename.

See `references/self-documenting-names.md` for examples.

## 4. Smallest surface

One function, one concern. Extract only when justified.

- **One concern per function** — if you're writing "and" in the name (`parseAndValidate`), split
- **Rule of 3 for extraction** — don't extract a helper until the third call site appears. Premature extraction creates shape before you know the right shape
- **Pure over stateful** — prefer functions that take input and return output over ones that mutate state
- **Validate at boundaries, trust inside** — input validation at system edges (HTTP handlers, CLI args, external APIs). Once validated, trust the value through internal code. No defensive re-validation on every internal call

**The test:** can you describe the function's purpose in one sentence without using "and" / "also" / "then"? If no → split.

See `references/smallest-surface.md` for examples.

## 5. No dead defense

Error handling exists to serve recovery. If there's no recovery, there's no handler.

- **No try/catch for impossible cases** — if a null is mathematically impossible given your type system and control flow, don't guard for it
- **No fallbacks for inputs you control** — if you construct the data, don't handle the "what if it's malformed" case. It's not going to be malformed; you built it
- **No silent catch** — a `catch (e) {}` or `except: pass` discards information. Let the error bubble or transform it; never swallow
- **Bubble errors to the right handler** — the caller that can actually recover is the one that catches. Internal functions just throw
- **Validate at the boundary, once** — one validation at the HTTP handler / CLI / API call. No repeat validation in every downstream function

**The test:** for every `try`/`catch` you write, name the recovery action in one sentence. If you can't ("we catch so it doesn't crash"), remove the handler and let the error bubble.

See `references/no-dead-defense.md` for examples.

## How this skill loads

`/do` Phase 0 invokes `Skill("coding-style")` and `Skill("karpathy-guidelines")` together on every coding task. The `paths:` frontmatter above scopes activation to code/config file types — this skill does not fire on non-code edits (docs, images, binaries).

## Customizing

Edit this file (or the `references/*.md`) to change defaults. Project-specific overrides: create `<project>/.claude/skills/coding-style/SKILL.md` with a different name (user scope wins on name collisions per CC skill-resolution rules — rename for project overrides, e.g. `coding-style-project`).

## Chains with

- **`karpathy-guidelines`** — behavioral principles (pair at /do Phase 0)
- **`refactor-safely`** — when applying these rules to existing code
- **`pr-review-toolkit:code-simplifier`** — catches rule violations in review
- **`pr-review-toolkit:comment-analyzer`** — enforces rule 1 on existing comments
