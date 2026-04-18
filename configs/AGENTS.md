<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# configs/

## Purpose

Source-of-truth **configuration templates** deployed by the installer (`src/core.ts`) onto a target machine. Every file here is copied or merged into the user's `~/.claude/` (global scope) or the target project's `.claude/` (project scope), or into shell/terminal config paths (`~/.tmux.conf`, `~/.config/starship.toml`).

This directory is **the core tier** — files here install silently with no prompt (see root `AGENTS.md` tier table). They are backed up then overridden at `~/.claude-backup/{timestamp}/`.

## Key Files

| File | Target | Description |
|------|--------|-------------|
| `tmux.conf` | `~/.tmux.conf` | Tmux config (C-a prefix, vi mode, mouse on, Tokyo Night palette, Alt-arrow pane nav) |
| `starship.toml` | `~/.config/starship.toml` | Minimal prompt — dir, git, runtime versions (node/bun/python/rust/go), disables cloud/k8s modules |

## Subdirectories

| Dir | Target | Purpose |
|-----|--------|---------|
| `home-claude/` | `~/.claude/` | User-scope Claude Code config — global defaults for all projects |
| `project-claude/` | `<project>/.claude/` | Project-scope Claude Code config — per-repo overrides and project hooks |
| `hooks/` | `~/.claude/hooks/` | User-scope hook scripts (PreToolUse, PostToolUse, PreCompact, PostCompact, StopFailure, PermissionDenied, FileChanged, CwdChanged, Elicitation, SessionStart, SessionEnd, Stop) referenced by `home-claude/settings.json` |
| `plugins/yka-code-health/` | manual `claude plugin install <path>` | Reference implementation of the Claude Code `monitors` manifest key (v2.1.105+). One monitor — `core-install-health` — that notifies when hooks drift, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is unset, or the Serena MCP registration is missing. Not auto-installed; opt-in. |

### `home-claude/` — used when installer runs with `--global` (default)

Deployed to `~/.claude/`.

| File | Contents |
|------|----------|
| `CLAUDE.md` | Global advisory rules — research-first workflow, tool guidance, self-improvement loop via `tasks/lessons.md`. Symlinked to `AGENTS.md` + `GEMINI.md` on install for cross-tool portability |
| `AGENTS.md` | Symlink to `CLAUDE.md` in the repo (mirrors deploy state) |
| `settings.json` | Global permissions deny-list + `effortLevel: medium`. Claude Code env features (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`, telemetry) are set via shell rc env vars, not settings.json. Does not set `model` — the user's existing default is preserved |

### `project-claude/` — used when installer runs with `--local`

Deployed to `$PWD/.claude/`. Layers ON TOP of the user's `~/.claude/` at runtime (Claude Code merges both scopes). Only project-specific overlays live here.

| File | Contents |
|------|----------|
| `CLAUDE.md` | Thin template with sections for project stack, conventions, runtime requirements. Users fill these in per-project |
| `settings.json` | Subset of deny rules — the critical few that apply at project scope. Inherits the rest from user scope |
| `hooks/` | Project-scope hooks (see below) |

Local installs skip: skills, agents, commands, shell rc edits, global binary installs (tmux/starship/mise/just), git aliases, telemetry env vars, category installers, and `reapplyHardenedSettings`. Run `--global` once to set up the user baseline; `--local` layers per-project.

### `hooks/` (user-scope)

Shell scripts wired into user-scope `settings.json` by `installCore` under `--global`. Each hook reads Claude Code hook JSON from stdin. PreToolUse hooks use the current `hookSpecificOutput.permissionDecision` schema to block; advisory hooks emit only to stderr.

| Hook | Event | Role | Blocking? |
|------|-------|------|-----------|
| `pre-destructive-blocker.sh` | PreToolUse(Bash) | Blocks regex patterns settings deny can't express — `DROP/TRUNCATE TABLE`, unbounded `DELETE FROM`, `chmod -R 777`, `chown -R`, `mkfs`, `dd if=`, writes to `/dev/sd*`/`/dev/hd*`/`/dev/nvme*`, `git clean -f`-variants, `git checkout -- .`, `eval()`, base64-pipe-sh, fork bombs | **Yes** |
| `pre-secrets-guard.sh` | PreToolUse(any) | Blocks tool input containing AWS/GitHub/Stripe/Anthropic/OpenAI (legacy + `sk-proj-` + `sk-svcacct-`)/OpenRouter/Groq/xAI/Google/Slack/npm keys, PEM/OpenSSH/EC keys, JWTs, Bash-level `.env` access, DB URLs with embedded passwords. Read-tool `.env` access is blocked by settings.json deny | **Yes** |
| `pre-pr-gate.sh` | PreToolUse(Bash) | Matches `gh pr create` and `git push`. Blocks push-to-default-branch; advises on >500-line diffs and no-recent-test-runs | **Yes** (on default-branch push) |
| `post-lint-gate.sh` | PostToolUse(Write\|Edit\|MultiEdit) | Auto-runs biome (if `biome.json` present) or eslint, plus ruff/clippy/go-vet/shellcheck per extension. Scoped to files under the current git root; prints advisory to stderr | No (advisory) |
| `session-start.sh` | SessionStart | Banner with date, repo, branch, today's session count, `tasks/lessons.md` head, clickable claude-mem observer URL. Silently runs `npx autoskills -y` in the background when a git project has no `.claude/skills/` dir. Emits via `{"systemMessage": …}` so CC renders a visible panel | No |
| `session-end.sh` | SessionEnd | Appends session metadata to `~/.claude/session-logs/{date}.log`. Purges logs older than 30 days | No |
| `stop-summary.sh` | Stop | Scans files modified in the last 5 minutes for `console.log`, `debugger`, `TODO`/`FIXME`, `pdb.set_trace`, `binding.pry`, `print()` | No (advisory) |

### Observability story

We deliberately ship no dedicated observability category. The behavioral surface is covered by layered existing tooling:

- **Claude Code native**: `/cost` (API-user session cost), `/stats` (Max/Pro usage patterns).
- **`session-report` plugin** (installed via `cc-plugins.ts` from `anthropics/claude-plugins-official`): Skill-activated; parses `~/.claude/projects/**/*.jsonl` and generates a self-contained HTML report of tokens, cache efficiency, subagents, skills, top prompts. Zero services.
- **`claude-hud`** (installed via `memory-context.ts`): statusline reads `rate_limits` + `cost.total_cost_usd` from CC stdin; always-on limit bar.
- **`claude-mem`** (installed via `memory-context.ts`): hybrid SQLite + Chroma store of every tool call; searchable via MCP; web viewer at `localhost:37777`; `claude-mem:timeline-report` skill for narrative history.
- **OTEL export** (core sets `CLAUDE_CODE_ENABLE_TELEMETRY=1` + `OTEL_EXPORTER_OTLP_ENDPOINT`-ready): user wires up `anthropics/claude-code-monitoring-guide`'s docker-compose + Grafana dashboards (25052 / 24993 on grafana.com) when they want persistent multi-session analytics.
- **Multi-account OAuth rotation**: genuinely unsolved by any Anthropic-sanctioned tool. Community options (`tombii/better-ccflare`, `CaddyGlow/ccproxy-api`) exist but are single-maintainer — we do not install them; users opt in via `npm install -g <pkg>` after evaluating trust themselves.

### `project-claude/hooks/` (project-scope, deployed under `--local`)

| Hook | Event | Role |
|------|-------|------|
| `post-edit-lint.sh` | PostToolUse(Write\|Edit\|MultiEdit) | Project-scoped lint — restricts to files under git root, runs `npx eslint`, `npx tsc --noEmit`, `ruff`, `mypy`, `cargo clippy`, `golangci-lint`, `shellcheck`. Advisory (stderr only) |
| `post-bash-test.sh` | PostToolUse(Bash) | After a build command (`npm run build`, `cargo build`, `go build`, `tsc`, `just build`, `mvn package`, `gradle build`, etc.), auto-runs the project test suite (`just test` → `bun/npm/yarn test` → `cargo test` → `go test` → `make test`). Advisory (stderr only) |

## For AI Agents

### Working In `configs/`

- **These are templates, not live config.** Do not edit them expecting your own Claude Code to change — edits here ship to users on their next `bunx @youssefKadaouiAbbassi/yka-code-setup` run.
- **Hook scripts must stay shellcheck-clean.** CI runs `bun run lint:hooks` against `configs/hooks/*.sh` and `configs/project-claude/hooks/*.sh` (see root `AGENTS.md` > Testing Requirements).
- **Hooks must exit quickly.** Every hook runs on every matching tool call — slow hooks degrade UX. Keep startup < 100ms; use `command -v` checks, avoid unbounded `find`.
- **Hook contract differs by event.** PreToolUse uses `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}` to block (the deprecated top-level `{"decision":"block"}` fails CC's validator). PostToolUse / Stop / SessionStart are advisory — emit to **stderr** only; do not emit `{"decision":"allow"}` (obsolete schema, noise). Never exit non-zero on the allow path.
- **`.env` access is blocked by layered defense**: `settings.json` denies `Read(.env*)` for Claude's Read tool; `pre-secrets-guard.sh` blocks Bash-level access (grep/tail/less/etc.). Do not add code that reads `.env` through Claude tools — reference env vars at runtime instead.
- **Permissions deny layering:** `home-claude/settings.json` carries literal denies (settings-layer is cheaper, hits before hooks fire). `pre-destructive-blocker.sh` carries only what settings-glob can't express (regex, case-insensitive SQL, fork bombs). Do not re-duplicate a rule in both layers — settings denies fire first and make the hook rule dead code. `project-claude/settings.json` is a minimal overlay for `--local` installs.
- **JSON files are deep-merged by the installer**, never replaced. `mergeSettings` (in `src/utils.ts`) handles `permissions.deny` as an array union and `mcpServers` as per-key replace.

### Hard Rules

1. **Never hardcode secrets.** Per-category installers (e.g., `src/components/github.ts`, `src/components/workflow.ts`) register MCP servers via `registerMcp()` with env-var-expanded headers/args. The installer does not substitute `${…}` inside templates; Claude Code resolves them at load time.
2. **Hook scripts start with `#!/usr/bin/env bash` + `set -euo pipefail`** (except `session-start.sh` and `stop-summary.sh`, which intentionally use `set -u` + `trap ERR` to survive SIGPIPE from `grep|head`). Fail-secure blocking hooks (pre-secrets-guard, pre-destructive-blocker) deny if `jq` is missing; fail-open advisory hooks exit cleanly.
3. **No interactive prompts in hooks.** They run non-interactively — `read` from stdin yields the hook JSON, nothing else.
4. **Backward-compatible template changes.** Adding a new permission deny is safe; removing one can re-expose users who relied on it — document in a release note.
5. **Writer vs Reviewer** (root Principle 7): changes here should be reviewed by `code-reviewer` in a separate pass, not self-approved.

## Dependencies

### Runtime

Hooks require these binaries on the target machine — installed by `bootstrap.sh` or the component installers:

| Tool | Used by | Required? |
|------|---------|-----------|
| `bash` >= 4 | all hooks | **Yes** (hard dep) |
| `jq` | all hooks (stdin JSON parsing) | **Yes** (hard dep — `bootstrap.sh` installs) |
| `git` | `session-start.sh`, `session-end.sh`, `post-edit-lint.sh`, `statusline.sh` | **Yes** |
| `find`, `grep`, `realpath`, `wc`, `head`, `dirname`, `mktemp` | various | **Yes** (coreutils) |
| `shellcheck` | `post-lint-gate.sh`, `post-edit-lint.sh` | Optional — skipped if missing |
| `eslint`, `tsc`, `npx` | `post-lint-gate.sh`, `post-edit-lint.sh` | Optional |
| `ruff`, `mypy` | lint hooks | Optional |
| `cargo`, `clippy` | lint hooks | Optional |
| `go`, `golangci-lint`, `go vet` | lint hooks | Optional |
| `bun`, `npm`, `yarn` | `post-bash-test.sh` | Optional (auto-detected) |
| `just`, `mise` | `post-bash-test.sh` | Optional (auto-detected) |
| `python3` | `session-start.sh` (JSON escape for systemMessage) | **Yes** |

### Consumed By

- **`src/core.ts`** — copies the scope-appropriate template tree (`home-claude/` for `--global`, `project-claude/` for `--local`). Branching lives in `isLocalScope(env)` / `templateDir(env)`.
- **`src/verify.ts`** — post-install verification checks presence and permissions of deployed files
- **`src/backup.ts`** — backs up any existing target files before overwrite
- Template path resolution uses `getConfigsDir()` which returns `join(import.meta.dir, "..", "configs")`.

### External References

- Claude Code hook protocol: PreToolUse schema uses `hookSpecificOutput.permissionDecision`
- Starship config schema — https://starship.rs/config/
- Tmux options — tmux(1) man page

<!-- MANUAL: -->
