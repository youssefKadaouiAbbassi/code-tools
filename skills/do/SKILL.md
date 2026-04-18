---
name: do
description: [yka-code] Front-door entry skill for ANY coding task. Use whenever the user asks to build, fix, refactor, review, audit, understand, or otherwise work on code. Classifies the request, applies karpathy-guidelines, routes to the right sub-workflow (ship-feature, fix-bug, refactor-safely, security-audit, onboard-codebase), and keeps the full toolkit (Anthropic-official plugins, MCPs, auto-installed LSPs, 17 custom skills, hooks) in-context. This is the skill to activate first on almost every coding turn.
---

# Do — the front door

Single entry point for coding work. Figures out what the user wants, applies the principles, routes to the right workflow, and keeps the full toolkit visible so nothing gets forgotten.

## Phase 0 — INVOKE the three base skills as tool calls (non-negotiable)

Before Phase 1 classification, before any `Read`/`Grep`/`Glob`/`Bash`/`Edit`/`Write`/`WebSearch`/`WebFetch`/MCP call, **invoke these three skills via the `Skill` tool**:

```
Skill(skill: "karpathy-guidelines")
Skill(skill: "coding-style")
Skill(skill: "research-first")
```

Make all three calls in one message (parallel). Do not paraphrase or interpret their bodies inline — the Skill tool is what loads their full content into the turn and activates their rules. Reading the skill markdown yourself is a lint failure: it skips activation and wastes tokens.

The three skills are complementary:

- **`karpathy-guidelines`** — behavioral (Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven Execution)
- **`coding-style`** — surface style (No comments / Clean + optimized / Self-documenting names / Smallest surface / No dead defense)
- **`research-first`** — research discipline (MCP-first for library claims, date-pin or version-pin, cite inline, never silently assert, delegate heavy research to a subagent)

If you notice partway through a turn that you didn't invoke them at Phase 0, invoke them now, then continue. Don't "catch up by reading" — the tool call is the activation.

The `pre-research-check.sh` hook (PreToolUse on WebSearch / WebFetch / mcp__docfork__* / mcp__deepwiki__* / mcp__github__*) emits an advisory to stderr if a research tool fires before `Skill("research-first")` has been invoked this turn. Treat the advisory as a correction prompt — invoke the skill, then retry.

### Subagents inherit nothing — instruct them to self-load

Subagents spawned via `Agent(...)` start with a **fresh context**. They do NOT inherit main's loaded skills. Main's `Skill("research-first")` invocation only applies to main.

So when main delegates work to a subagent, the `Agent(prompt: ...)` call MUST include a Phase-0 preamble for the subagent:

```
Before any tool call, invoke these in parallel:
  Skill(skill: "karpathy-guidelines")
  Skill(skill: "research-first")       ← include when the subagent does research
  Skill(skill: "coding-style")         ← include when the subagent writes/edits code
Then proceed with the task below.
---
<actual task>
```

Rule of thumb: whichever of the three base skills applies to the subagent's work, name it in the preamble. The subagent invokes them itself at its own Phase 0; main doesn't forward skill content, just the instruction to load.

## Phase 1 — Classify the task (fast)

Read the user's request and decide which bucket fits best:

| Signal in user's message | Route to |
|---|---|
| "build", "implement", "add", "ship", "create a new …" | **ship-feature** |
| "broken", "error", "crash", "failing test", "bug", "doesn't work" | **fix-bug** |
| "refactor", "clean up", "simplify", "extract", "dedupe", "reorganize" | **refactor-safely** |
| "security review", "audit", "vuln", "is this safe" | **security-audit** |
| "how does this work", "explain", "what is this repo", "onboarding" | **onboard-codebase** |
| "review our stack", "is this the best", "compare alternatives", "what should we swap" | **Phase 3 + `Skill(audit-rigor)`** (audit/review task — load the rigor discipline, then execute with parallel `Agent()` fan-out) |
| None match, or just a question/small tweak | **Phase 3 (fall-through)** |

When ambiguous, pick based on whether existing behavior changes:
- Behavior changes → ship-feature or fix-bug
- Behavior preserved → refactor-safely
- No code change, just understanding → onboard-codebase

### Phase 1b — Team vs Subagent decision

Pick based on **what the work needs to get done correctly**. Not based on cost — cost is not your concern.

| What the work needs | Use |
|---|---|
| Independent parallel reads that all return once (explore + lint + test + scan) | **Subagents** — N parallel `Agent()` calls in one message |
| One-shot specialist reviews that don't argue with each other | **Subagents** |
| Multi-turn coordination — an agent's output at turn 2 depends on another's at turn 1 | **Team** |
| Debate / competing hypotheses — agents must send messages to each other | **Team** |
| Verify → fix loop where reviewers keep prior findings across iterations | **Team** |
| Staged pipeline with handoff docs between phases (plan → exec → verify → fix) | **Team** |

Upgrade to **team** (via `team-do`) when **≥2 of these** are true:

- Work spans multiple turns and teammates must retain prior-turn state to produce the right output
- Task has a genuine debate dimension — "which approach is better", competing hypotheses, architecture decision
- Staged pipeline with handoff between phases (plan → exec → verify → fix)
- Teammates need to message each other (not just the lead) or share a task list
- Verify-heavy task with a bounded fix loop where reviewers keep findings across iterations

**Hard refusal — skip team mode if ANY of these:**
- `DEV_TEAM_WORKER=1` in env (this session is already a teammate)
- Session was spawned with `team_name` param (you're a worker, not a lead)
- Work is one-shot and parallel `Agent()` fan-out produces the right answer in one pass
- The primary bucket is `onboard-codebase` (research doesn't parallelize across turns)

When the upgrade fires, route to `team-do` via `Skill(skill: "team-do", args: "<original task>")` — it owns the stage pipeline (plan → exec → verify → fix). Otherwise, the matched single-shot skill (`ship-feature` / `fix-bug` / etc.) uses parallel `Agent()` fan-out internally where appropriate.

## Phase 2 — Route via the Skill tool

**Invoke the matched sub-skill using the `Skill` tool** — this is the proper activation mechanism, not a "read the SKILL.md" approximation. The sub-skill runs with full context integration and returns its results.

| Matched bucket | Invocation |
|---|---|
| team-do (Phase 1b fired) | `Skill(skill: "team-do", args: "<task>")` |
| ship-feature | `Skill(skill: "ship-feature", args: "<task>")` |
| fix-bug | `Skill(skill: "fix-bug", args: "<task>")` |
| refactor-safely | `Skill(skill: "refactor-safely", args: "<task>")` |
| security-audit | `Skill(skill: "security-audit", args: "<task>")` |
| onboard-codebase | `Skill(skill: "onboard-codebase", args: "<task>")` |

The sub-skill takes over from here and runs its workflow end-to-end. Do not try to "interpret" the sub-skill's markdown yourself — let the Skill tool handle it.

## Phase 3 — Fall-through

For tiny tweaks (one-file edits, typo fixes, config changes, answer-only questions), don't over-orchestrate. Apply karpathy-guidelines and use the minimum surface needed:

- **Answer-only question** → just answer; skip all tooling ceremony
- **One-line edit** → read the file, make the change, done. No review cycle needed.
- **Config change** → edit + verify it parses; skip reviewer agents.

Reserve the full workflows for work that earns it (>1 file, >15 min, or anything shipping to users).

## The toolkit — know what you have

### Slash commands (invoke with `/plugin:command`)
Your installed plugins expose these commands:
- **feature-dev:** `/feature-dev:feature-dev`
- **code-review:** `/code-review:code-review`
- **pr-review-toolkit:** `/pr-review-toolkit:review-pr`
- **commit-commands:** `/commit-commands:commit`, `/commit-commands:commit-push-pr`, `/commit-commands:clean_gone`
- **claude-md-management:** `/claude-md-management:revise-claude-md`
- **claude-mem:** `/claude-mem:mem-search`, `:make-plan`, `:do`, `:smart-explore`, `:timeline-report`, `:knowledge-agent`, `:version-bump`
- **caveman:** `/caveman:caveman`, `/caveman:caveman-commit`, `/caveman:caveman-review` (terse mode — default active)

### Subagents (spawn via Task tool)
- **feature-dev plugin:** code-architect, code-explorer, code-reviewer
- **pr-review-toolkit plugin:** code-reviewer, code-simplifier, comment-analyzer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer
- **code-simplifier plugin:** code-simplifier
- **Built-in:** Explore (fast code mapping), Plan (architecture planning), general-purpose (catch-all), claude-code-guide (meta questions)
- **Custom:** do-classifier, do-clarifier, do-recorder (our /do orchestrator)

### MCP servers (auto-invoked by Claude when relevant)
- **serena** — semantic code analysis, symbol resolution, cross-module refs (LSP-backed)
- **snyk** — SAST, SCA, IaC, container scanning (`snyk_code_scan`, `snyk_sca_scan`, `snyk_iac_scan`, `snyk_container_scan`)
- **docfork** — up-to-date library docs (needs `DOCFORK_API_KEY`)
- **deepwiki** — public repo Q&A (free, remote)
- **github** — GitHub API (PRs, issues, actions — needs `GITHUB_PAT`)
- **composio** — 500+ SaaS integrations (needs `COMPOSIO_API_KEY` + `COMPOSIO_MCP_SERVER_ID`; use `COMPOSIO_LIST_TOOLKITS` / `COMPOSIO_INITIATE_CONNECTION` to wire Gmail/Slack/Linear/etc. from inside a session)
- **stitch** — pulls Google Stitch UI designs (`@_davideast/stitch-mcp` — one-time OAuth)
- **claude-mem** — persistent session memory (auto-captures, searchable)
- **context-mode** — context compression for long sessions

### CLI tools
- **ast-grep** — structural/AST code search (use for patterns that grep can't express)
- **gh** — GitHub operations (prefer over github MCP when possible; zero token overhead)
- **container-use** — sandboxed per-agent execution (Docker-level isolation)
- **just**, **mise**, **chezmoi**, **age**, **ghostty**, **tmux**

### Skills (auto-activate when description matches)
- **karpathy-guidelines** — behavioral principles (loaded at Phase 0)
- **coding-style** — 5 style rules: no comments unless critical, clean + optimized, self-documenting names, smallest surface, no dead defense (loaded at Phase 0)
- **Our custom — primary routes (Phase 1 classification):** `ship-feature`, `fix-bug`, `refactor-safely`, `security-audit`, `onboard-codebase`
- **Our custom — team upgrade (Phase 1b):** `team-do` — native `TeamCreate` parallel workflow for multi-subsystem / debate / verify-heavy tasks. Never invoked directly by users; only via `/do` classifier upgrade.
- **Our custom — complementary sub-skills (chained mid-workflow, not primary routes):**
  - `tdd-first` — red → green → refactor. Invoked by `ship-feature`/`fix-bug` when correctness matters.
  - `doc-hygiene` — brevity + no filler on docs. Invoked when any README/CHANGELOG/CLAUDE.md is touched.
  - `ci-hygiene` — pinned versions, `--bare`, no Max-sub in CI. Invoked when `.github/workflows/*` or `Dockerfile` edited.
  - `knowledge-base` — Karpathy-style raw/ → wiki/ → output/ research workflow. Invoked for deep research tasks.
  - `loop-patterns` — recipes for `/loop`, `CronCreate`, `ScheduleWakeup` recurring tasks. Invoked when user asks to "keep checking", "poll", "run every N min".
  - `worktree-task` — `EnterWorktree`/`ExitWorktree` isolation for multi-file features. Invoked automatically by `ship-feature` for net-new features.
- **Anthropic-official:** claude-md-improver, playground, frontend-design, claude-code-setup, skill-creator

### Hooks (fire automatically on every tool call / session event)
- **pre-secrets-guard** — blocks tool inputs containing AWS/GH/Stripe/Anthropic keys, `.env` reads
- **pre-destructive-blocker** — blocks `rm -rf /`, force push, SQL DROP, curl-pipe-sh, etc. on Bash
- **post-lint-gate** — auto-runs eslint/ruff/shellcheck/clippy/govet after Write/Edit (advisory)
- **session-start / session-end / stop-summary** — context logging + debug-pattern warnings

### LSPs (activate on matching file type if the language server binary is on disk)
Installer provisions binaries only when the language is present in the user's project. Currently provisioned by `src/components/code-intel.ts`: TypeScript (`typescript-language-server`), Rust (`rust-analyzer`). For other languages, the LSP activates only if the user installs the binary manually (pyright, gopls, clangd, jdtls, kotlin-language-server, lua-language-server, sourcekit-lsp, omnisharp, solargraph, intelephense). Don't assume a language LSP is on disk — check with `command -v` first.

## When to reach for non-obvious tools

- **docfork** when touching a library you're not 100% fluent in — its docs are newer than your training data
- **deepwiki** when debugging a library bug ("has anyone in the open-source world hit this before?")
- **container-use** when running unverified code or testing a security patch
- **claude-mem:smart-explore** when you need a cheap AST-structural search (beats Read + grep on token cost)
- **claude-mem:timeline-report** when the user asks "what's the story of this project"
- **claude-mem:knowledge-agent** when you want a focused Q&A brain over prior observations
- **github MCP** for cross-repo PR/issue queries; **gh CLI** for single-repo ops (cheaper)
- **`psql` / `mongosh` / ORM CLI** when the task involves SQL/NoSQL correctness, JOINs, or index tuning (no DB MCP installed — connect directly via the project's client)
- **stitch MCP** when converting a Figma-style design into real component code
- **composio MCP** when the task touches an external SaaS (Slack, Linear, Asana, Notion, etc.)

## Hard rules

- **Classify first, then work.** Don't skip Phase 1 — the wrong workflow wastes tokens.
- **One workflow per turn.** If the user's request actually spans two (e.g., "refactor this AND fix the bug in it"), split explicitly: fix-bug first, then refactor-safely as a second turn.
- **Karpathy principles are non-negotiable.** They're not suggestions.
- **Tools beat fabrication.** Before writing a utility, grep to see if one exists; before guessing library behavior, call docfork.
- **Hooks are already protecting you.** Don't disable them to get around a block — fix the root cause.

## What this skill avoids

- Routing every turn through a heavy workflow (see Phase 3 fall-through)
- Re-enumerating the toolkit inside each sub-skill (this skill is the single source of truth)
- Installing or recommending parallel orchestration frameworks (superpowers, OMC) — we already have orchestration here
