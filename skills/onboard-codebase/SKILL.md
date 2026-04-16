---
name: onboard-codebase
description: Rapidly orient in an unfamiliar codebase. Use when the user opens a new repo for the first time, asks "how does this work", wants an architecture overview, or is about to make changes in a codebase they don't know. Chains Explore agent, serena symbol analysis, claude-mem history, and claude-md-management audit.
---

# Onboard Codebase Workflow

Drop into an unfamiliar codebase and build a working mental model fast. Output a compact summary the user can use.

## Principles (applied throughout)

Load and apply the `karpathy-guidelines` skill alongside this workflow. Short version:

1. **Think Before Coding** — surface assumptions and tradeoffs explicitly; don't silently pick one interpretation.
2. **Simplicity First** — prefer minimal code; no speculative abstractions, no just-in-case configs.
3. **Surgical Changes** — only touch what the task requires; preserve existing style/imports/whitespace.
4. **Goal-Driven Execution** — define the verifiable success criterion up front and loop until it passes.


## When to activate

- User: "what does this repo do?", "how is this code organized?", "explain the architecture"
- User just cd'd into a new repo and is about to make changes
- User asks for an "onboarding doc" or "tour"

## Tool dispatch — when to reach for each MCP / skill / agent

| Condition | Tool | Why |
|---|---|---|
| Always — map the tree in parallel | `Explore` agent + `serena` symbol map + `/claude-mem:mem-search` + `/claude-mem:smart-explore` — **ONE message, 4 parallel Task calls** | 4× speedup vs sequential |
| Multi-generation codebase; want narrative history | `/claude-mem:timeline-report` | Generates project history from memory observations |
| Build a focused Q&A brain over prior work on this repo | `/claude-mem:knowledge-agent` | Compiles observations into a searchable knowledge base |
| Stack uses a library you're not fluent in | `docfork` MCP (needs `DOCFORK_API_KEY`) | Current library API + patterns |
| Similar public OSS repos exist | `deepwiki` MCP | Free Q&A — how do comparable projects solve this? |
| Repo has a CLAUDE.md that may be stale or missing | `claude-md-management:claude-md-improver` skill (auto-activates) | Audit quality before trusting the docs |
| Repo uses GitHub workflows, issues, PRs as design docs | `github` MCP OR `gh` CLI | Read recent discussion + ADRs |
| Code touches DB schemas | `psql -c '\d+ <table>'` / `mongosh` / migration files | Read data model from live DB or migration history, not just code |

## Workflow

### Phase 1 — Top-level inventory
Check the repo's own signals:
- `README.md`, `CLAUDE.md`, `AGENTS.md` — the author's intent
- `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` — language + deps
- `.github/workflows/` — CI tells you what the tests/lints care about
- `justfile` / `Makefile` / `scripts/` — the build/dev vocabulary

Don't paraphrase these back — absorb them.

### Phase 2 — Structural map
Spawn `Explore` agent with a direct prompt: "Map the source tree. Identify entry points, the main layers (e.g., router → service → db), and any unusual patterns. Report under 300 words." The agent's parallelism is the point here.

### Phase 3 — Semantic cross-references
Use `serena` MCP symbol lookup for the 3-5 most-imported modules. Where are they used? What's the dependency direction?

### Phase 4 — Institutional memory
- `/claude-mem:mem-search "<repo-name>"` — did we touch this repo before? Any pitfalls logged?
- `/claude-mem:mem-search "architecture"` — general patterns the user's team prefers
- `git log --oneline -30` — recent changes tell you where the churn is

### Phase 5 — Audit the author's intent docs
Spawn `claude-md-management`'s skill (`claude-md-improver`) to audit `CLAUDE.md`. Don't auto-apply fixes — just surface what's stale or missing. The user will decide.

### Phase 6 — Produce the summary
Write a 1-page brief:
- **What it is** (one sentence)
- **Stack** (language, major deps, runtime)
- **Entry points** (files where control begins)
- **Architecture** (the main layers, direction of dependencies)
- **Conventions** (naming, error handling, testing — inferred from samples, not assumed)
- **Hot zones** (files with highest recent churn)
- **Gotchas** (from memory + README + CLAUDE.md)
- **Where to start for task X** — only if the user told you the task; otherwise skip

## Hard rules

- **Read before summarizing.** Don't invent architecture from file names.
- **Match the user's level.** If they say "I've written Go for 10 years, new to React", frame the React parts in Go analogues (channels → hooks, goroutines → async, etc.).
- **Under 1 page.** If you can't compress to 1 page, you don't understand yet.
- **Call out uncertainty.** "I think X is the router but I didn't trace every dispatch" is better than a false certainty.

## What this skill avoids

- Generic platitudes about "this is a modern TypeScript codebase"
- Reading every file (waste of tokens) — use Explore's parallelism instead
- Rewriting the README — the user already has that
