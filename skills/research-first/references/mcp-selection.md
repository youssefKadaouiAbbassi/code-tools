# Which MCP to call

## `mcp__docfork__search_docs` / `fetch_doc`

**Best for:** documented library API, SDK methods, configuration options, migration guides, canonical usage patterns.

**Flow:**
1. `search_docs(query, libraryName)` — returns ranked titles + URLs + summaries
2. Pick the highest-ranked result that matches
3. `fetch_doc(url)` — returns full markdown

**Good queries:**
- `"server components cache invalidation"` + `libraryName: "next.js"`
- `"Prisma schema enum migration"` + `libraryName: "prisma"`
- `"clap v4 derive subcommand"` + `libraryName: "clap"`

**When it misses:** escalate to deepwiki (below). docfork indexes curated docs; lesser-known or very new libraries may be sparse.

## `mcp__deepwiki__ask_question`

**Best for:** open-source repo Q&A, "has anyone hit this?", upstream semantics questions, repo history.

**Flow:**
- `ask_question(repoName, question)` — returns an AI-synthesized answer from the repo's code + issues + discussions

**Good queries:**
- `repoName: "oven-sh/bun"`, `question: "when did --bail flag land?"`
- `repoName: "anthropics/claude-code"`, `question: "does PreCompact hook support JSON decision output?"`
- `repoName: "pytorch/pytorch"`, `question: "autograd behavior with torch.compile"`

**When it misses:** fall through to `github` MCP for direct file/commit inspection.

## `mcp__github__*`

**Best for:** exact repo state at a ref, release notes, issue/PR content, cross-repo discovery, pinned-version research.

**Key tools:**
- `get_file_contents(owner, repo, path, ref?)` — file at tag/branch/sha
- `list_releases(owner, repo)` — release notes by version
- `list_commits(owner, repo, sha?, path?)` — commit log
- `search_issues(q)`, `search_pull_requests(q)` — cross-repo discovery
- `list_tags(owner, repo)` — all version tags

**Use this when:**
- User pinned a version or date and you need state as of that reference
- You need the actual source, not a summary (docfork/deepwiki are AI-layered)
- The question is release-note-flavored ("what shipped in v3.2?")

## `mcp__plugin_claude-mem_mcp-search__smart_search`

**Best for:** "did we solve this before?", team/project history, prior pain points.

Always check this first when the user says *"last time"*, *"we had an issue with"*, *"how did we fix"*, or references prior sessions. Zero cost, direct recall.

## Escalation order

1. Project memory (claude-mem) — have we already answered this?
2. docfork — is it documented?
3. deepwiki — can the repo AI answer?
4. github — can we inspect exact state?

If all four miss, state: *"Unverified — no MCP coverage for this. Proceeding with training-cutoff knowledge; flag for manual check."*
