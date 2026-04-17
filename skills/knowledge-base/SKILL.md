---
plugin: code-tools
name: knowledge-base
description: Karpathy's LLM-maintained knowledge-base workflow. Use when the user wants to research a topic, build a queryable wiki, compile notes into structured knowledge, or asks "compile what we know about X", "research Y deeply", "turn these sources into a knowledge base". Structures knowledge in raw/ → wiki/ → output/ directories. Fills the research-first gap the 5 core sub-skills don't cover.
---

# Knowledge Base — Karpathy's LLM-maintained wiki workflow

Adapted from Andrej Karpathy's April 3, 2026 "LLM Knowledge Bases" post. Core insight: *"A large fraction of my recent token throughput is going less into manipulating code, and more into manipulating knowledge."* The LLM maintains the wiki, the human rarely edits it directly.

## When to activate

- User wants to research a topic deeply (beyond a quick `deepwiki` lookup)
- User has sources to compile (articles, PDFs, GitHub repos) into a queryable wiki
- User asks about prior research: "what do we know about X" / "compile notes on Y"
- User is starting a Tier C task where `research.md` needs real sources with verification
- User wants a reusable knowledge substrate for recurring questions on a domain

**Skip for:** trivial lookups (use `docfork` or `deepwiki` directly), single-file summarizations, or anything that doesn't warrant persistent structure.

## The three-directory structure

This skill operates on a vault directory (default: `~/knowledge/<topic>/` or user-specified). Inside it:

```
<vault>/
├── raw/       Source documents as-is — web articles, PDFs, markdown downloads, code dumps
├── wiki/      LLM-compiled structured markdown with backlinks — the queryable layer
└── output/    Query results, slide decks, visualizations, reports
```

**Invariant:** the human edits `raw/` (adds sources). The LLM edits `wiki/`. Both edit `output/` (user requests a specific format; LLM produces it).

## Tool dispatch

| Purpose | Tool |
|---|---|
| Display/browse the vault visually | Obsidian (`obsidian` command, AppImage installed) |
| Programmatic read/write to the vault | `claude-obsidian` CLI |
| Web article ingestion into `raw/` | Obsidian Web Clipper browser extension (user installs manually) OR `crwl` (crawl4ai CLI) for headless scraping |
| Library/API docs into `raw/` | `docfork` MCP (needs `DOCFORK_API_KEY`) — pull current docs, save markdown to `raw/` |
| Similar OSS projects' documentation | `deepwiki` MCP |
| Cross-session institutional memory | `/claude-mem:mem-search` + `/claude-mem:knowledge-agent` (builds focused brains from CC observations) |
| Structured plan generation from the wiki | `/claude-mem:make-plan` — hand it the wiki, get a phased execution plan |
| Final report / slide output | Markdown (default), Marp for slides, Matplotlib via `python3` subprocess for charts |

## Workflow

### Phase 1 — Scope the knowledge base

Ask the user (if unclear):
- What's the topic? (narrow is better — "rate limiting algorithms" beats "backend architecture")
- Where should the vault live? (default `~/knowledge/<slug>/`)
- What's the END artifact they want? (queryable reference / specific report / slide deck / code plan)

Create the directory tree if it doesn't exist.

### Phase 2 — Ingest into `raw/`

Options (pick based on source type):

- **Web articles:** user uses Obsidian Web Clipper → clip to `raw/`. OR you use `crwl` (crawl4ai) to scrape to markdown: `crwl crawl <url> -o markdown -O raw/<slug>.md`
- **Library docs:** invoke `docfork` MCP with the library name, save the returned markdown into `raw/docs-<lib>.md`
- **Code snippets/repos:** clone into `raw/code/` OR use `rendergit` (karpathy/rendergit, 2.2k★) if user has it installed to render a repo into a single HTML/MD for LLM ingestion
- **Existing memory:** query `/claude-mem:knowledge-agent` for prior observations on this topic; save results into `raw/prior-sessions.md`

Each file in `raw/` gets a frontmatter header:
```yaml
---
source: <URL or description>
retrieved: <YYYY-MM-DD>
format: web | pdf | docs | code | memory
---
```

### Phase 3 — LLM-compile into `wiki/`

For each new item in `raw/`, produce OR update a matching wiki article. Rules Karpathy's post implies:

1. **Backlinks explicitly.** If article A mentions concept B, link `[[B]]` — Obsidian resolves. Claude should add these actively, not wait to be asked.
2. **Categorization.** Group articles by theme (tag in frontmatter or subdirectory).
3. **VERIFIED / UNVERIFIED / CONTESTED labels** on each substantive claim — inherit from the `researcher` discipline: cite primary sources, flag contradictions between sources rather than picking silently.
4. **Short over long.** Wiki articles should be 100-400 words each, not essays. More articles + backlinks > fewer-but-huge articles.
5. **Tool versions when applicable.** Supply-chain drift is real. If the article covers a library, note the version at retrieval time.

Use `claude-obsidian` CLI to write — it handles vault semantics (frontmatter, Obsidian-specific link resolution). Invoke pattern:
```
claude-obsidian write <vault> wiki/<article-slug>.md --content "<markdown>"
```

### Phase 4 — Query the wiki

This is the payoff. Once critical mass exists (Karpathy: ~100 articles, 400k words on his topic), you can run multi-step questions:

- "Compare how X and Y solve problem Z" → LLM reads the relevant wiki articles, synthesizes
- "What's the consensus on A vs B?" → LLM follows backlinks, summarizes
- "Produce a design doc for feature F using our knowledge" → LLM pulls relevant articles, drafts

Always cite specific wiki articles (`[[article-name]]`) in the answer so the user can verify.

### Phase 5 — Multi-format output (`output/`)

Render query results as:
- **Markdown report** (default): `output/<query-slug>.md`
- **Slide deck**: `output/<query-slug>.md` with Marp frontmatter (`marp: true`) — Obsidian previews it; Marp CLI renders to HTML/PDF
- **Visualization**: write a small Python script using Matplotlib → invoke via `Bash`, save figure into `output/`

Always store the query text at the top of the output file so the artifact is self-documenting.

### Phase 6 — Health check (monthly, or on demand)

Karpathy: *"Run LLM linting to find inconsistencies, discover missing data, surface connections between concepts."*

Triggers:
- User asks to audit the KB
- Wiki has grown past ~50 articles (complexity rises)
- Explicit monthly cadence if the KB is long-lived

Checks:
- **Dead links** — wiki articles referencing `[[X]]` where X doesn't exist
- **Orphans** — wiki articles with no incoming backlinks
- **Stale claims** — VERIFIED claims older than 6 months (library API drift)
- **Gaps** — frequent query topics that the wiki doesn't cover
- **Contradictions** — two articles making mutually exclusive claims

Report in `output/health-check-<date>.md`, then propose targeted edits (user approves).

## Hard rules

- **LLM writes the wiki, human edits raw/.** Don't let the user ask you to edit wiki articles by hand — they should ask you to update the raw source + recompile.
- **Every wiki article has backlinks.** Articles in isolation aren't a knowledge base; they're notes.
- **Verify before claiming.** Primary sources only. No blog paraphrase chains.
- **Short articles + dense backlinks > long articles.** Navigability beats completeness.
- **Version and date.** Every wiki article has `last_verified: YYYY-MM-DD`.
- **Delete rules that the wiki already demonstrates.** If an article's existence teaches the rule, don't write the rule down again.

## Interaction with other skills

- **ship-feature Tier C** → call `knowledge-base` to produce research → use the wiki as input to `/claude-mem:make-plan`
- **onboard-codebase** → on first session in a new repo, `knowledge-base` can ingest README + CLAUDE.md + key source files as a persistent reference
- **fix-bug** → if the bug involves a library's API, `knowledge-base` can pull `docfork` docs into `raw/` so the fix references current behavior

## Example invocations

**"Research rate limiting algorithms for our login endpoint"**
→ Phase 1: create `~/knowledge/rate-limiting/`
→ Phase 2: use `docfork` for node-rate-limiter-flexible, `deepwiki` for how OSS projects solve it, `crwl` for IETF RFC 6585 and the Stripe engineering blog
→ Phase 3: wiki articles: `[[token-bucket]]`, `[[sliding-window]]`, `[[leaky-bucket]]`, `[[redis-vs-memory]]`, cross-linked
→ Phase 4: query "for /api/login, which algorithm?" → LLM answers with references
→ Phase 5: `output/rate-limiting-recommendation.md` passed to ship-feature

**"Compile what we know about OAuth in this project"**
→ Phase 2: pull from `/claude-mem:knowledge-agent` (prior sessions), code files touching auth, our `CLAUDE.md` auth section
→ Phase 3: articles: `[[oauth-flow]]`, `[[our-token-storage]]`, `[[known-gotchas]]`
→ Phase 4: on-demand queries from now on: "how did we handle refresh last time?" → answered from wiki
