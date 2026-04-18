# The yka-code

> 40 components. 7 MCP servers. 12 principles. Installer package version from `package.json`. All free except Claude Max $200/mo.
> Validated by 10 independent architects, 9 unbiased researchers, 5 adversarial reviewers, 4 functionality verifiers, and verified from primary sources.

---

## Installation

### Quick Start

```bash
bunx @youssefKadaouiAbbassi/yka-code-setup
```

### Non-Interactive (CI / scripting)

```bash
bunx @youssefKadaouiAbbassi/yka-code-setup --non-interactive
```

### Dry Run (preview changes)

```bash
bunx @youssefKadaouiAbbassi/yka-code-setup --dry-run
```

### Install a Specific Tier

```bash
bunx @youssefKadaouiAbbassi/yka-code-setup --tier core    # core only
bunx @youssefKadaouiAbbassi/yka-code-setup --tier recommended   # core + recommended
bunx @youssefKadaouiAbbassi/yka-code-setup --tier all           # everything
```

### Fresh Machine (no Bun installed)

```bash
curl -fsSL https://raw.githubusercontent.com/youssefKadaouiAbbassi/yka-code/master/bootstrap.sh | bash
```

### Development

```bash
git clone https://github.com/youssefKadaouiAbbassi/yka-code.git
cd yka-code
bun install
bun run dev                    # run the installer locally
bun test                       # run tests
bun run build                  # compile to standalone binary
```

---

## Architecture

```
                              YOU
                               |
                    +----------+----------+
                    |    CLAUDE MAX $200   |
                    +----------+----------+
                               |
                 +-------------+-------------+
                 |   CLAUDE CODE 2.1.104     |
                 |                           |
                 |  Fast Mode  Advisor Tool  |
                 |  Computer Use  Channels   |
                 |  defer  Monitor  Teams    |
                 |  --bare  Adaptive Think   |
                 |  Security Scanner  /cost  |
                 +--+------+------+------+--+
                    |      |      |      |
          +---------+  +---+---+  +--+---+--------+
          |            |       |     |             |
    +-----+-----+ +---+---+ +-+----+-+ +----------+
    | ENFORCEMENT| |  MCP  | |SANDBOX | |  CLI/LIB |
    |            | |SERVERS| |        | |  TOOLS   |
    | Hooks (6)  | |  (7)  | |Native  | |          |
    | Snyk MCP   | |       | |+contuse| |ast-grep  |
    +------------+ +-------+ +--------+ |Playwright|
                                        |Crawl4AI  |
                                        |claude-mem|
                                        |gh CLI    |
                                        +----------+
```

---

## Components

### Kernel

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 1 | **Claude Code 2.1.104** | [docs](https://code.claude.com/docs/en/overview) | The operating system. Fast Mode (2.5x speed), Advisor Tool (Haiku+Opus in one call, 85% cheaper), Computer Use (opens native apps, clicks UI), Channels (Telegram/Discord push into sessions), defer (headless pause for approval, 0.4% FP), Monitor (streams background events), Agent Teams (parallel agents), native Security Scanner (found 500+ real vulns), native /cost (per-model breakdown), native WebSearch, Session Memory, Adaptive Thinking. |
| 2 | **CLAUDE.md** | [best practices](https://code.claude.com/docs/en/best-practices) | Rules Claude reads every session. <100 lines. Symlinked to AGENTS.md + GEMINI.md for cross-tool portability ([fcakyon pattern](https://github.com/fcakyon/claude-codex-settings)). Hooks enforce critical rules; CLAUDE.md is advisory. |
| 3 | **settings.json** | [schema](https://code.claude.com/docs/en/settings) | 40+ destructive patterns in `permissions.deny`. Pinned `model`, `effortLevel`, telemetry, Agent Teams. The first gate — runs before hooks, before CLAUDE.md, before anything. |

### Enforcement

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 4 | **Unified Hooks** (6 scripts) | [hooks guide](https://code.claude.com/docs/en/hooks) | `pre-destructive-blocker.sh` (rm -rf, terraform destroy, DROP DATABASE, 40+ patterns), `pre-secrets-guard.sh` (AWS keys, GitHub tokens, Stripe keys, 15+ patterns), `post-lint-gate.sh` (auto-detect stack, run right linter), `session-start.sh` (inject date, branch, lessons.md), `session-end.sh` (log session metadata), `stop-summary.sh` (scan for leftover debug code). Hooks run 100%. CLAUDE.md runs ~80%. |
| 5 | **Security Scanning** | [Snyk MCP](https://github.com/snyk/studio-mcp) | Claude Code's native Security Scanner reasons about code quality (found 500+ vulns in OSS). Snyk MCP adds deterministic SAST + SCA dependency scanning + license compliance. Two layers: Claude reasons, Snyk looks up the CVE database. |

### Code Intelligence

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 6 | **Serena v1.1.0** | [GitHub](https://github.com/oraios/serena) / [plugin](https://claude.com/plugins/serena) | LSP-based semantic code intelligence across 40+ languages. Type resolution, cross-module references, inferred types. Benchmark: 45min all-tests-pass vs native LSP's 1hr with 9 failures ([ManoMano test](https://github.com/oraios/serena#benchmarks)). |
| 7 | **ast-grep** (CLI/skill) | [GitHub](https://github.com/ast-grep/ast-grep) | Structural code search on the AST. "Find all async functions without error handling" across 20+ languages. Used via CLI (`sg`) not MCP — [MCP wrapper is experimental](https://github.com/ast-grep/ast-grep-mcp). Same power, no flaky process. |

```
Code Intelligence Triad (zero overlap):

  Serena         ast-grep
  SEMANTIC       STRUCTURAL
  "What IS       "Find ALL
   this?"         that MATCH"
     |               |
     +-------+-------+
             |
     Claude understands
     WHAT code does AND
     can find SIMILAR code
```

### Browser + Web

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 8 | **Playwright CLI** | [GitHub](https://github.com/microsoft/playwright-cli) | Browser automation via accessibility-tree snapshots saved as compact YAML. 4x fewer tokens than MCP (27K vs 114K). Microsoft [recommends CLI over MCP](https://github.com/microsoft/playwright-mcp#playwright-cli) for coding agents with shell access. |
| 9 | **Crawl4AI** | [GitHub](https://github.com/unclecode/crawl4ai) | Turns websites into clean LLM-ready markdown. Self-hosted, Apache-2.0, unlimited. Used as Python library (no official MCP). Pin v0.8.6+ ([supply chain issue](https://github.com/unclecode/crawl4ai/releases/tag/v0.8.6) in v0.8.5). |

### Documentation

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 10 | **Docfork** | [GitHub](https://github.com/docfork/docfork) / [docs](https://docs.docfork.com) | Library docs for 10K+ libraries. 1 API call per lookup (2x faster than Context7). [Cabinets](https://docs.docfork.com/cabinets) lock your agent to your specific stack — prevents context poisoning. Auth free tier: 1K requests/mo. [Rate limits](https://docs.docfork.com/rate-limits). |
| 11 | **DeepWiki** | [GitHub](https://github.com/AsyncFuncAI/deepwiki-open) | Ask questions about any public GitHub repo. Free, no auth, remote MCP at `mcp.deepwiki.com/mcp`. [Validated by Karpathy](https://x.com/karpathy/status/2039805659525644595). |

### Memory + Context

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 12 | **claude-mem** | [GitHub](https://github.com/thedotmack/claude-mem) | Auto-captures everything Claude does, compresses via AI, stores in SQLite + Chroma, injects relevant context into future sessions. 3-layer search gives 10x token savings. v6.5.0, 46.1K stars. 1-2 min startup ([#923](https://github.com/thedotmack/claude-mem/issues/923)), then zero overhead. **Bind to 127.0.0.1** (port 37777 unauthenticated by default). |
| 13 | **context-mode** | [GitHub](https://github.com/mksglu/context-mode) | ~98% context reduction via SQLite + FTS5 + BM25 selective retrieval (315KB -> 5.4KB). Sessions last 6x longer (30min -> 3hrs). 66K+ users. |

```
Memory + Context Stack:

  CLAUDE.md          tasks/lessons.md       claude-mem            context-mode
  (project rules)    (corrections log)      (session memory)      (output compression)
       |                   |                      |                      |
       +------- STARTUP ------+                   |                      |
       |                      |                   |                      |
  Claude reads rules    Claude reads           claude-mem injects    Tool outputs
  and corrections       past mistakes          relevant past work    compressed 98%
       |                      |                   |                      |
       +----------+-----------+-------------------+----------------------+
                  |
         Claude starts every session with:
         rules + corrections + past context + compressed outputs
         = dramatically better quality than blank slate
```

### Sandbox

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 14 | **Native PID-ns + seccomp** | [docs](https://code.claude.com/docs/en/sandboxing) | On by default on Linux since v2.1.98. Process isolation — Claude's processes can't see other processes. Zero overhead. |
| 15 | **container-use** | [GitHub](https://github.com/dagger/container-use) | Docker-level isolation. Per-agent git branches + containers. Powered by Dagger engine. Register via `cu stdio`. |

### GitHub

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 16 | **gh CLI** | [GitHub](https://github.com/cli/cli) | GitHub operations with zero context overhead. PRs, issues, searches. Simon Willison [migrated away from GitHub MCP](https://simonwillison.net/2025/Oct/16/claude-skills/) because MCP burns tens of thousands of tokens loading tool definitions. |
| 17 | **github-mcp-server** | [GitHub](https://github.com/github/github-mcp-server) | 93 MCP tools for complex batch GitHub operations. Remote HTTP — no local process. For when `gh` CLI isn't enough. |
| 18 | **claude-code-action@v1** | [GitHub](https://github.com/anthropics/claude-code-action) | Claude reviews PRs, triages issues, generates tests in GitHub Actions. Uses `--bare` (30% faster CI). **Must use separate API key** — subscription prohibited for CI since [April 4 enforcement](https://docs.anthropic.com/en/docs/about-claude/models). |

### Code Review

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 19 | **Claude Code Review** | [docs](https://code.claude.com/docs/en/code-review) | Built-in multi-agent PR review. Free with Max. Launched March 9, 2026. The FIRST review layer (same-model). |
| 20 | **CodeRabbit** | [website](https://coderabbit.ai) | Cross-vendor review. Highest F1 (51.2%). Multi-model pipeline (Nemotron + o3 + GPT-5.2-Codex + Claude). 40 static analyzers. Free for private + public repos. The SECOND review layer (different-model). |

```
Review Pipeline:

  Claude writes code
        |
  Lint hook (#4) -----> instant syntax + style errors (same turn)
        |
  CC Action (#18) ----> automated CI review (GitHub Actions)
        |
  CC Review (#19) ----> same-model review (plan adherence, conventions)
        |
  CodeRabbit (#20) ---> cross-model review (bugs Claude can't see about itself)
        |
  Human merge decision
```

### Notifications

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 21 | **Channels** | [docs](https://code.claude.com/docs/en/channels) | `--channels plugin:telegram` — message Claude FROM your phone. Bidirectional. Official Anthropic (research preview, v2.1.80+). |
| 22 | **claude-ntfy-hook** | [GitHub](https://github.com/nickknissen/claude-ntfy-hook) | Phone notifications with interactive Allow/Deny buttons for `defer` approval. Smart filtering (reads permission rules). Context-aware (shows the actual question). Uses [ntfy.sh](https://github.com/binwiederhier/ntfy) (self-hosted push). |

```
Headless Approval Loop:

  Claude runs autonomously
        |
  Hits something risky
        |
  Kernel "defer" pauses session
        |
  claude-ntfy-hook sends phone notification
  with context + [Allow] [Deny] buttons
        |
  You tap Allow on your phone
        |
  Session resumes from exact point
        |
  (or you message via Channels to steer)
```

### Observability

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 23 | **Native /cost + telemetry** | [monitoring docs](https://code.claude.com/docs/en/monitoring-usage) | `CLAUDE_CODE_ENABLE_TELEMETRY=1`. Per-model + cache-hit cost breakdown. OpenTelemetry for every tool call. Zero infrastructure. |
| 24 | **ccflare** | search GitHub | API proxy + monitoring TUI. Token spend, cost per session, per-tool breakdown, error rates, trends over time. |

### Orchestration

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 25 | **Agent Teams** | [docs](https://code.claude.com/docs/en/agent-teams) | Native experimental. ≤5 parallel agents on shared task list. Direct peer messaging. File-locked task claims. Enable: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. |

```
Parallel Execution:

  Agent Teams (#25) spawns parallel agents
        |
  Each agent gets its own git worktree
        |
  Each worktree runs in container-use (#15)
```

### Autonomy

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 27 | **autoresearch** | [GitHub](https://github.com/karpathy/autoresearch) | Karpathy's autonomous ML research. One GPU, one file (`train.py`), one metric. 700 experiments in 2 days, 11% speedup. [Shopify CEO](https://x.com/tolokonnikov/status/1929180958663696388): 53% faster Liquid rendering, 61% fewer memory allocations from 93 automated commits. 71.3K stars, MIT. |

### Workflow

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 28 | **n8n** | [GitHub](https://github.com/n8n-io/n8n) | Visual workflow automation. 525+ nodes. MCP integration (Claude gets live read/write to n8n). [Tested on 55-node production pipeline](https://docs.n8n.io/advanced-ai/accessing-n8n-mcp-server/). "When GitHub issue labeled 'bug' -> trigger Claude -> investigate -> create PR -> notify Slack." 184K stars. |

### Database

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 29 | **PostgreSQL MCP Pro** | [GitHub](https://github.com/crystaldba/postgres-mcp-pro) | Natural language -> SQL queries, schema inspection, index tuning, health analysis. Hybrid classical algorithms + LLM. 2.5K stars, MIT, 8 tools. |

### Design

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 30 | **Google Stitch** | [website](https://stitch.withgoogle.com) / [skills](https://github.com/google-labs-code/stitch-skills) | AI generates UI designs from text. Exports DESIGN.md (agent-readable design system). MCP server + 7 open-standard skills. Free (350 gen/month). |
| 31 | **awesome-design-md** | [GitHub](https://github.com/VoltAgent/awesome-design-md) | 66 pre-built DESIGN.md files matching real brands (Stripe, Vercel, Linear, Notion, Figma, Apple, Spotify...). Drop in project, Claude builds matching UI. 47.2K stars. |

```
Design Pipeline:

  Google Stitch generates design -> exports DESIGN.md
          OR
  awesome-design-md provides brand template
          |
  Claude reads DESIGN.md -> builds matching UI
          |
  Playwright CLI takes screenshot -> Claude verifies visually
          |
  If wrong -> Claude fixes -> re-verify -> loop until match
```

### Knowledge

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 32 | **Obsidian + claude-obsidian** | [claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) / [Karpathy gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | Karpathy's LLM Wiki pattern. Raw docs in, structured wiki out. Summary pages, entity pages, cross-references, contradiction flags. Compounds over time. Scales to 6 agents + 50 sub-agents per user report. |

### Build

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 33 | **mise** | [GitHub](https://github.com/jdx/mise) | Replaces nvm + pyenv + asdf + direnv + make in one Rust binary. `.mise.toml` checked into repo = Claude's environment matches yours. 26.6K stars. |
| 34 | **just** | [GitHub](https://github.com/casey/just) | Command runner with human-readable `justfile`. Claude can read the justfile to understand available commands. `just test`, `just build`, `just lint`. 32.8K stars. |

### Integrations

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 35 | **Composio MCP** | [GitHub](https://github.com/composiohq/composio) / [website](https://composio.dev) | ONE endpoint connecting to 500+ apps — Slack, Notion, Google Workspace, Stripe, Shopify, Salesforce. SOC2 compliant. 20K free tool calls/month. Replaces 11 individual vertical MCPs. |

### Workstation

| # | Tool | Links | What it does |
|:--:|------|:-----:|-------------|
| 36 | **Ghostty** | [GitHub](https://github.com/ghostty-org/ghostty) / [website](https://ghostty.org) | GPU-accelerated terminal (OpenGL on Linux, Metal on macOS). Claude Code docs treat it as first-class. 50.6K stars. |
| 37 | **tmux** | [GitHub](https://github.com/tmux/tmux) | Terminal multiplexer. Run 3-5 Claude sessions side by side. Detach, go to lunch, reattach. Agent Teams uses `teammateMode: tmux` natively. |
| 38 | **Git worktrees** | [git docs](https://git-scm.com/docs/git-worktree) | Each agent gets its own branch + directory. No file conflicts between parallel agents. `claude --worktree feature-auth`. |
| 39 | **chezmoi + age** | [chezmoi](https://github.com/twpayne/chezmoi) / [age](https://github.com/FiloSottile/age) | Dotfiles version-controlled with encrypted secrets. Your entire `~/.claude/` portable across machines. Fresh machine -> full system in 15 minutes. |
| 40 | **tasks/lessons.md** | — | Every time Claude makes a mistake, add it here. Claude reads it next session. Never repeats. The self-improvement primitive. |

---

## Synergies

### The Compounding Loop (the system gets smarter over time)

```
Day 1:   Claude starts with CLAUDE.md rules only
Day 7:   claude-mem has a week of captured decisions
Day 14:  lessons.md has 20 corrections Claude never repeats
Day 30:  skills directory has grown with reusable workflows
Day 60:  knowledge-base/ has structured notes from raw docs

Day 1 Claude vs Day 60 Claude = dramatically different quality
```

### The 5-Layer Enforcement Stack

```
Request enters
    |
[1] settings.json deny  --> blocks simple patterns (rm -rf, git push --force)
    |
[2] PreToolUse hooks    --> blocks complex patterns (cat .env | base64)
    |
[3] Snyk MCP            --> catches known vulnerable dependencies
    |
[4] Native PID-ns       --> process can't see outside its namespace
    |
[5] container-use       --> filesystem + network isolation per agent
    |
Safe execution

MCPSHIELD paper: single-layer covers <=34%. Five layers: >90%.
```

### The Full Flow

```
YOU at Ghostty + tmux (3-5 panes)
  |
  +-- Pane 1: Claude Code (main)
  |   |-- Reads CLAUDE.md + lessons.md
  |   |-- claude-mem injects past context
  |   |-- context-mode compresses outputs (6x sessions)
  |   |-- 7 MCP servers ready (Serena, Docfork, github, context-mode, Composio, Postgres, Snyk)
  |   |-- CLI tools ready (ast-grep, Playwright, Crawl4AI, gh)
  |   +-- Native: Fast Mode, Advisor, Computer Use, defer, Monitor
  |
  +-- Pane 2-4: Parallel agents (Agent Teams)
  |   |-- Each in its own git worktree
  |   |-- Each in its own container
  |   +-- Completed work -> skills compound in the repo
  |
  +-- Phone: ntfy Allow/Deny + Telegram Channels
  |   |-- defer pauses -> notification -> you approve
  |   +-- You message Claude from Telegram -> Claude reacts
  |
  +-- GitHub: automated pipeline
  |   |-- claude-code-action reviews PRs
  |   |-- Claude Code Review (same-model)
  |   |-- CodeRabbit (cross-model)
  |   +-- Snyk checks dependencies
  |
  +-- Background: compounding
      |-- claude-mem captures every session
      |-- lessons.md accumulates corrections
      |-- knowledge-base/ compounds from raw docs
      +-- Monthly metabolic audit sheds dead weight
```

---

## Principles

| # | Principle | Why |
|:--:|-----------|-----|
| 1 | **Verification > generation** | Writer and reviewer must be different models. CodeRabbit (different AI) reviews Claude's code. |
| 2 | **Hooks enforce 100%, CLAUDE.md advises 80%** | For life-or-death rules, only hooks work. CLAUDE.md is followed ~80% of the time. |
| 3 | **Front-load architecture** | First artifact = `research.md`, never code. Plan before build. |
| 4 | **Skill accumulation has diminishing returns** | Measure per-skill outcomes. Delete non-earners. Refinement > library size. |
| 5 | **Native primitives replace plugins** | When Anthropic ships a feature, re-evaluate the plugin it replaces. Monthly. |
| 6 | **Sandbox non-optional** | Native + container-use layered. No exceptions. |
| 7 | **Writer != reviewer at model-diversity level** | Claude reviewing Claude shares blind spots. Different model catches different bugs. |
| 8 | **3-5 parallel agents, start with one fewer** | Comprehension Debt + Ambient Anxiety Tax are real (Osmani, April 2026). |
| 9 | **Subscription = interactive, API key = CI** | Enforced April 4, 2026. CI with Max subscription will get 401'd. |
| 10 | **Pin defaults** | `model` and `effortLevel` drift silently. v2.1.94 flipped effort from medium to high overnight. |
| 11 | **CLAUDE.md under 100 lines** | If Claude does it correctly without the rule, delete the rule. |
| 12 | **Monthly metabolic audit** | Shed tools that don't earn their keep. The system should get SMALLER over time, not bigger. |

---

## Build Order

```bash
# Phase 0: Workstation
brew install --cask ghostty
brew install tmux chezmoi age

# Phase 1: Kernel
curl -fsSL https://claude.ai/install.sh | bash
# Copy settings.json, CLAUDE.md, hooks from .omc/research/ultimate-configs/
ln -sfn CLAUDE.md AGENTS.md && ln -sfn CLAUDE.md GEMINI.md

# Phase 2: Build tools
curl https://mise.run | sh
brew install just

# Phase 3: Enforcement
# Copy 6 hook scripts from ultimate-configs/home-claude/hooks/
# Native sandbox is on by default (Linux)
brew install container-use

# Phase 4: MCP servers
uv tool install -p 3.13 serena-agent@latest --prerelease=allow
claude mcp add docfork -- npx -y docfork --api-key $DOCFORK_KEY
claude mcp add-json github '{"type":"http","url":"https://api.githubcopilot.com/mcp","headers":{"Authorization":"Bearer '$GITHUB_PAT'"}}'
claude mcp add context-mode -- npx -y context-mode
npx -y snyk@latest mcp configure --tool=claude-cli
# + Composio, PostgreSQL MCP Pro

# Phase 5: CLI + library tools
brew install ast-grep gh
npm install -g @playwright/cli@latest
pip install 'crawl4ai>=0.8.6'
npx claude-mem install

# Phase 6-10: GitHub, review, notifications, orchestration, extended
# See FINAL_SYSTEM_v12.md for full details
```

---

## MCP Configuration

```jsonc
// .mcp.json (project scope)
{
  "mcpServers": {
    "serena":       { "type": "stdio", "command": "serena-agent", "args": ["start-mcp-server", "--project", "."] },
    "docfork":      { "type": "stdio", "command": "npx", "args": ["-y", "docfork", "--api-key", "${DOCFORK_API_KEY}"] },
    "github":       { "type": "http", "url": "https://api.githubcopilot.com/mcp", "headers": {"Authorization": "Bearer ${GITHUB_PAT}"} },
    "context-mode": { "type": "stdio", "command": "npx", "args": ["-y", "context-mode"] },
    "composio":     { "type": "http", "url": "https://mcp.composio.dev", "headers": {"x-api-key": "${COMPOSIO_API_KEY}"} },
    "postgres-pro": { "type": "stdio", "command": "npx", "args": ["-y", "@crystaldba/postgres-mcp-pro", "--connection-string", "${DATABASE_URL}"] },
    "snyk":         { "type": "stdio", "command": "npx", "args": ["-y", "snyk", "mcp"] }
  }
}
```

---

## Validation Trail

This system was built through 12 iterations with:

- **10 independent architect teammates** (all Opus, identical mandate, isolated outputs)
- **9 unbiased category researchers** (pure web search, no pre-biased files)
- **5 adversarial reviewers** (red team, alternatives scout, cost audit, security audit, practitioner reality check)
- **3 clean-slate independent agents** (zero context from the session)
- **deep-research ultradeep audit** (8-phase structured pipeline)
- **4 primary-source verifiers** (actual GitHub READMEs, not blog posts)
- **4 functionality verifiers** (real user experiences from HN, Reddit, reviews)
- **claude-mem overhead** verified as startup-only ([GitHub issue #923](https://github.com/thedotmack/claude-mem/issues/923))

Full research at [`.omc/research/`](.omc/research/) — 120+ files, 30K+ lines of research data.

---

## License

This system architecture is open. Every component is free or self-hosted (except Claude Max $200/mo). Use it, fork it, improve it.
