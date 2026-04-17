---
plugin: code-tools
name: research-first
description: Enforce research-before-asserting on any library, framework, API, SDK, or external-system claim. Use ALWAYS before stating version-specific behavior, API shape, flag, config option, or "how does X work" for any third-party code — every time, no exceptions. Triggers on any mention of library/framework names (React, Vue, Next, Bun, Axum, Django, FastAPI, Polars, Prisma, etc.), version numbers, import/require statements being added, API method names that aren't clearly internal, changelogs, breaking changes, migration questions, or upstream-repo references. Forbids version-specific assertions without either (a) a preceding `docfork:search_docs` / `deepwiki:ask_question` / `github` MCP call whose result is cited inline, or (b) an explicit "current as of <ISO date>, training-cutoff unverified" disclaimer. Pins queries to a date/version when the user specifies one; defaults to today (ISO date from `$(date -I)`) when they don't.
---

# Research-first

Training cutoff ≠ current state. Library APIs rename, flags change default, features deprecate, packages get taken over. Every version-specific claim you make without fresh evidence is a gamble.

This skill makes the research step mandatory, not optional.

## Trigger list

Activate and **research before speaking** when the task or your own reasoning involves any of:

- **Library or framework name** — React, Vue, Svelte, Solid, Next.js, Nuxt, Remix, Astro, Bun, Deno, Node, Express, Fastify, NestJS, Prisma, Drizzle, Mongoose, Zod, Valibot, tRPC, TanStack, Tailwind, Django, Flask, FastAPI, Pydantic, Pandas, Polars, NumPy, PyTorch, TensorFlow, Transformers, LangChain, LangGraph, SQLAlchemy, Alembic, Pytest, Poetry, uv, Tokio, Axum, Actix, Rocket, Serde, Clap, Diesel, SQLx, Reqwest, Hyper, Gin, Echo, Chi, GORM, Cobra, Viper, Spring, Ktor, Gradle, Maven, React Native, Flutter, Expo, Electron, Tauri, Stripe, Clerk, Supabase, Firebase, Vercel, Cloudflare — or any other third-party package
- **Version number** — "React 19", "Next.js 15.2", "Bun 1.2.0", "CUDA 12", "Python 3.13"
- **Import/require/use statement** being added or analyzed
- **API method or flag** that may not exist, may have been renamed, may have changed signature
- **Migration / breaking change / deprecation** questions
- **Upstream repo state** — "is there a PR for X?", "did they fix Y?", "what's on main?"
- **External SaaS integration** — Slack, Linear, Gmail, Notion, GitHub, Stripe, etc.

## The research flow

### Step 1 — Pin the date/version

Before querying anything:

- **If the user specified a date** ("as of 2025-06-01", "on v18.3", "before React 19") → pin the MCP query to that reference. Use `github` MCP `ref=<tag-or-sha>` for repo state; use `docfork:search_docs` with a version-qualified query like `react@18.3 useEffect semantics`; use `deepwiki` against a specific revision if the repo supports it.
- **If the user didn't specify** → research is "today". Get the date via `date -I` (Bash tool) ONCE at the start of research. Stamp all claims with that ISO date.

Never straddle — either pin to the user's reference or to today, not a fuzzy middle.

### Step 2 — Call the right MCP

| Question shape | MCP |
|---|---|
| "How do I use X library's Y feature?" | `mcp__docfork__search_docs` → `fetch_doc` on top result |
| "What does X do?" / "Does X still exist?" / "Did they change X?" | `mcp__deepwiki__ask_question` on the library's public repo |
| "What's on main?" / "Which tag has fix Y?" / "What's the latest release?" | `mcp__github__*` — `get_file_contents`, `list_releases`, `list_commits` with `ref` pinning |
| Cross-repo PR/issue state | `mcp__github__search_issues`, `search_pull_requests` |
| Historical memory ("did we hit this before?") | `mcp__plugin_claude-mem_mcp-search__smart_search` |

If the first MCP miss, escalate (`docfork` → `deepwiki` → `github`). Don't fall back to guessing.

### Step 3 — Cite inline

Every version-specific claim must be followed by a citation:

```
React 19 removed `useEffect`'s silent-cleanup-on-dep-change — `fetch_doc` https://react.dev/reference/react/useEffect (accessed 2026-04-17)

`bun test` accepts `--bail=<n>` since v1.1.9 — deepwiki ask_question oven-sh/bun "when was --bail introduced"
```

Forbidden: asserting "React 19 does X" with no citation and no date disclaimer.

Allowed fallback when MCPs truly can't resolve something:

```
*Unverified (training-cutoff, no MCP coverage):* React Compiler stable status as of 2026-04-17 — I'd need to check the react.dev changelog or an upstream release note.
```

## Date-pinning grammar

Always resolve and state the date. When you say "as of `<date>`", that's a **promise** your claim reflects that date's state.

- User pins a date → use it. "As of 2025-03-01 …"
- User pins a version → use it. "On Next.js v14.2 …" (don't say "as of date X" if user asked about a version).
- User pins nothing → use today's ISO date from `date -I`. "Current as of 2026-04-17 …"

If the user's date or version lies in the future or past beyond what the MCP can reach, say so explicitly:
- "Deepwiki indexes the default branch — no state-at-2024-01-01 query; closest proxy is commits before 2024-01-01 on main."

## Hard rules

1. **No version-specific claim without a citation or a "today" disclaimer.** Both are acceptable; silent assertions are not.
2. **Pin the date or version.** Don't leave the reference fuzzy.
3. **MCP first, guess never.** If you don't know, research. Don't synthesize behavior from library-name vibes.
4. **Cite inline, not at the end.** One claim per citation, visible next to the assertion.
5. **If research fails** (MCP errors, no hits), say so and mark the claim unverified. Never pretend you researched.

## What this skill avoids

- Re-researching for the same claim in a turn (cache the result, cite it each time).
- Researching for trivially common idioms (`console.log`, `list.sort()` in Python stdlib, `Vec::new` in Rust stdlib) — stdlib/core language features are OK to state without citation.
- Over-qualifying every sentence — a task description, opinion, or design recommendation doesn't need a citation; only version-specific library behavior does.

## Chains with

- **`coding-style`** + **`karpathy-guidelines`** — all three load at `/do` Phase 0
- **`docfork`**, **`deepwiki`**, **`github`**, **`claude-mem`** MCPs — the research toolset
- **Stop hook `stop-research-check.sh`** — post-hoc audit; if it fires the warning, correct in the next turn

## References

- `references/mcp-selection.md` — decision tree for which MCP to call
- `references/date-pinning.md` — full examples of pinning to user date/version vs today
- `references/citation-format.md` — accepted citation formats
