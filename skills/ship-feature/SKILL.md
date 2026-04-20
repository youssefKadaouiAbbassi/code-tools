---
name: ship-feature
description: [yka-code] End-to-end feature workflow for this system. Use when the user asks to build, implement, add, or ship a new feature. Chains feature-dev (plan → implement) → pr-review-toolkit (multi-agent review) → commit-commands (commit+push+PR). Do NOT use for simple edits, bug fixes, or refactors — this is for net-new feature work.
---

# Ship Feature Workflow

Orchestrates the user's installed plugins end-to-end for complete feature development.

## Principles (applied throughout)

Load and apply the `karpathy-guidelines` skill alongside this workflow. Short version:

1. **Think Before Coding** — surface assumptions and tradeoffs explicitly; don't silently pick one interpretation.
2. **Simplicity First** — prefer minimal code; no speculative abstractions, no just-in-case configs.
3. **Surgical Changes** — only touch what the task requires; preserve existing style/imports/whitespace.
4. **Goal-Driven Execution** — define the verifiable success criterion up front and loop until it passes.


## When to activate

- User asks: "build feature X", "implement Y", "add Z", "ship the thing that does W"
- Request is net-new functionality (not a fix, not a cleanup, not a tweak)
- There's enough scope that a plan → implement → review → commit cycle makes sense (>1 file or >30 min of work)

## Tool dispatch — when to reach for each MCP / skill / agent

Consult this before every phase. If a condition matches, add the tool to the relevant phase.

| Condition | Tool | Why |
|---|---|---|
| Feature touches a library I'm not 100% fluent in | `docfork` MCP (needs `DOCFORK_API_KEY`) | Current library API; beats stale training data |
| Similar features exist in public OSS repos | `deepwiki` MCP | Free Q&A against public GitHub repos |
| Feature changes a DB schema or query | `psql` / `mongosh` / project ORM CLI | Schema changes, JOIN correctness, index tuning — via local client, not MCP |
| Feature integrates with Slack / Linear / Notion / Asana / Stripe / ~500 other SaaS | `composio` MCP (needs `COMPOSIO_API_KEY`) | One MCP for all of them |
| Feature is a UI component / page | `frontend-design` skill + `playground` skill | Design-quality frontends; prototype in single-file HTML first |
| Feature needs E2E / browser tests or form-flow verification | `playwright-cli` skill | Pure CLI browser automation (40+ commands, snapshots, sessions); no MCP token cost |
| Feature imports or converts a design from Google Stitch | `stitch` MCP | Pulls Stitch designs into the codebase |
| Feature touches cross-repo GitHub (issues, PRs, actions) | `github` MCP (needs `GITHUB_PAT`) OR `gh` CLI (cheaper for single repo) | Use `gh` in-repo; MCP for cross-repo |
| Feature involves running unverified 3rd-party code | `container-use` CLI | Sandboxed per-agent branches + Docker isolation |
| Feature is large (>5 files, >2h estimated) | `/claude-mem:make-plan` + `/claude-mem:do` + `TeamCreate` | Explicit phased plan, captured in memory; persistent review team |
| Feature is small (<30min, <3 files) | Skip the big guns; use `feature-dev` directly | Over-orchestration wastes tokens |
| Past session touched related code | `/claude-mem:mem-search` (always) + `/claude-mem:smart-explore` for structural search | Free; check before implementing |

## Workflow — invoke the user's installed plugins in this exact order

### Phase 0 — Plan-iterate (native Claude Code plan mode)

Before touching `feature-dev` or any implementation, enter **Claude Code's native plan mode** via `EnterPlanMode` (or `Shift+Tab` if user-driven). In plan mode:

1. Produce the initial plan from the user's request (+ any `tasks/specs/*.md` from `brainstorming`).
2. Present to the user. They approve, or give feedback. If feedback — iterate within plan mode (no tools fire, it's read-only).
3. Loop until the user explicitly approves.
4. `ExitPlanMode` into acceptEdits or default mode.

This is Anthropic's own recommended workflow (Boris Cherny, 2026-01): *"I will use Plan mode, and go back and forth with Claude until I like its plan. From there, I switch into auto-accept edits mode and Claude can usually 1-shot it."* It composes with the built-in `Plan` subagent for architecture-heavy features.

Skip Phase 0 only when:
- The task already has an approved spec from `brainstorming` with enough detail that a plan is trivial
- The task is small (<30 min, <3 files) and Phase 3 fall-through applies

### Phase 1 — Plan + implement
Invoke `/feature-dev:feature-dev`. It chains internally:
- `code-explorer` agent (from feature-dev plugin) — reads the existing codebase
- `code-architect` agent — proposes the design
- `code-reviewer` agent — audits quality before handoff

**For large features (>5 files or >2h estimated):** prefer `/claude-mem:make-plan` first to produce a phased plan, then `/claude-mem:do` to execute phases via subagents. These capture the plan + outcomes in memory for future sessions.

**When the feature uses an unfamiliar library:** call the `docfork` MCP (requires `DOCFORK_API_KEY`, set in `~/.config/yka-code/secrets.env`) for up-to-date library docs before implementing. It's faster than reading source and more current than training data.

**When the feature is a UI component/page:** activate the `frontend-design` skill and optionally use the `playground` skill to prototype interactions in a single-file HTML explorer before wiring into the real app.

If `feature-dev` is not installed (user may have skipped), fall back to:
- Spawn `Explore` agent for codebase mapping
- Spawn `Plan` agent for architecture
- Then implement with Edit/Write

### Phase 2 — Multi-agent PR review
Invoke `/pr-review-toolkit:review-pr`. This spawns 6 specialized agents in parallel — each targeting a different class of bug that Claude-alone typically misses:

| Agent | Catches |
|---|---|
| `pr-review-toolkit:code-reviewer` | General quality, style, correctness |
| `pr-review-toolkit:code-simplifier` | Overcomplicated logic, redundant abstractions |
| `pr-review-toolkit:comment-analyzer` | Comments that lie, drift, or add zero value |
| `pr-review-toolkit:pr-test-analyzer` | Missing test cases, weak assertions, test coverage gaps |
| `pr-review-toolkit:silent-failure-hunter` | Swallowed catch blocks, fallbacks that mask real errors |
| `pr-review-toolkit:type-design-analyzer` | Weak types that permit invalid states |

Specifically watch for:
- **API work** → `comment-analyzer` + `type-design-analyzer` are highest signal
- **Error-path code** → `silent-failure-hunter` is highest signal
- **Logic-heavy code** → `pr-test-analyzer` + `code-reviewer`

If any reviewer flags HIGH-confidence issues, fix them and re-invoke **only that specific reviewer** to confirm (not all 6). Low-confidence findings → present to user, don't auto-fix.

### Phase 3 — Capture + commit
Before committing, invoke `/claude-md-management:revise-claude-md` if any interesting pattern emerged — capture it in CLAUDE.md so future sessions benefit.

Then invoke `/commit-commands:commit-push-pr` for commit + push + PR creation in one step.

### Phase 4 — Memory
`claude-mem` auto-captures the session; no action needed. The `claude-hud` statusline will show context/usage; watch for >80% usage and suggest a summarization break if exceeded.

## Hard rules

- **Do not skip review.** The pr-review-toolkit agents catch what Claude alone misses.
- **Do not commit with failed verification.** If `code-review` or a reviewer agent blocks, fix first.
- **Match codebase patterns** — the `code-explorer` agent reads existing conventions; use what it finds rather than imposing new patterns.
- **Keep edits surgical** (Karpathy principle) — smallest viable change per phase; no opportunistic refactoring while shipping a feature.

## Example invocation

User: "Build a rate limiter for the /api/login endpoint."

1. `/feature-dev:feature-dev` → explore (find existing middleware), architect (pick algorithm), implement (token bucket in middleware)
2. `/pr-review-toolkit:review-pr` → all 6 agents review the diff in parallel
3. Fix any high-confidence findings (e.g., silent-failure-hunter flags a fallback that hides DB errors)
4. `/claude-md-management:revise-claude-md` → note "rate limiting lives in middleware/ratelimit.ts with token bucket"
5. `/commit-commands:commit-push-pr`

## Chains to (synergy)

- **`brainstorming`** (UPSTREAM) — if the user's request is fuzzy, brainstorm into a short spec FIRST, then re-enter this skill with the spec.
- **`tdd-first`** — for any core-logic / correctness-critical path: red test before implementation.
- **`verification-before-completion`** — BEFORE claiming the feature is done. Non-optional. No "Done!" without fresh evidence.
- **`pre-review-checklist`** — after verification, before Phase 2 PR review (catches cheap issues).
- **`doc-hygiene`** — user-facing README / CHANGELOG / docs updates land under its rules.
- **`ci-hygiene`** — if CI configs are touched (new workflow, deploy step).
- **`security-audit`** — if the feature handles auth, crypto, uploads, secrets, or untrusted input.

## What this skill avoids

- Parallel frameworks (don't invoke compound-engineering's `/ce:work` or superpowers TDD loop — they'd duplicate this)
- Branching out to subagents mid-phase (each phase uses the plugin's own internal agents; don't spawn extras)
- Writing tests that weren't already required (if the feature needs tests, they land in phase 1 via feature-dev; phase 2's pr-test-analyzer only reviews what's there)
