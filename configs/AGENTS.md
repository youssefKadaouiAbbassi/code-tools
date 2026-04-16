<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# configs/

## Purpose

Source-of-truth **configuration templates** deployed by the installer (`src/primordial.ts`) onto a target machine. Every file here is copied or merged into the user's `~/.claude/` (global scope) or the target project's `.claude/` (project scope), or into shell/terminal config paths (`~/.tmux.conf`, `~/.config/starship.toml`).

This directory is **the primordial tier** — files here install silently with no prompt (see root `AGENTS.md` tier table). They are backed up then overridden at `~/.claude-backup/{timestamp}/`.

## Key Files

| File | Target | Description |
|------|--------|-------------|
| `tmux.conf` | `~/.tmux.conf` | Tmux config (C-a prefix, vi mode, mouse on, Tokyo Night palette, Alt-arrow pane nav) |
| `starship.toml` | `~/.config/starship.toml` | Minimal prompt — dir, git, runtime versions (node/bun/python/rust/go), disables cloud/k8s modules |
| `statusline.sh` | `~/.config/code-tools/statusline.sh` | Shell function `code_tools_statusline` — sourced by shell rc; prints branch + bun/node version for tmux status |

## Subdirectories

| Dir | Target | Purpose |
|-----|--------|---------|
| `home-claude/` | `~/.claude/` | User-scope Claude Code config — global defaults for all projects |
| `project-claude/` | `<project>/.claude/` | Project-scope Claude Code config — per-repo overrides and project hooks |
| `hooks/` | `~/.claude/hooks/` | User-scope hook scripts (PreToolUse, PostToolUse, Notification, Stop) referenced by `home-claude/settings.json` |

### `home-claude/`

Deployed to the user's home Claude Code directory.

| File | Contents |
|------|----------|
| `CLAUDE.md` | Global advisory rules — research-first workflow, tool guidance, self-improvement loop via `tasks/lessons.md`. Symlinked to `AGENTS.md` + `GEMINI.md` on install for cross-tool portability |
| `settings.json` | Global permissions deny-list (destructive commands, force pushes, DROP/TRUNCATE, fork bombs, pipe-to-shell), `effortLevel: medium`, `experimentalAgentTeams: true`, telemetry on. Does not set `model` — the user's existing default is preserved |
| `hooks/` | Empty placeholder — actual user hooks live in `configs/hooks/` and are deployed alongside |

### `project-claude/`

Deployed into each initialized project's `.claude/` directory.

| File | Contents |
|------|----------|
| `CLAUDE.md` | Project advisory — TS strict, ESLint, Prettier, test co-location, small PRs, `just` + `mise`, `gh` for PRs, feature-folder layout |
| `settings.json` | Project-scoped permissions deny-list (subset of global), `effortLevel: medium`, `experimentalAgentTeams: true`. Does not set `model`. **Committed to the repo** |
| `settings.local.json` | Local-only overrides (`model`, `effortLevel`, `permissions.allow/deny`, `experimentalAgentTeams`). **Gitignored** — per-developer tuning. Ships as a documented template with `_overrides` keys |
| `mcp.json` | MCP server manifest — `serena`, `docfork`, `github` (http + PAT), `context-mode`, `composio` (http + key), `postgres-pro`, `snyk`. Uses `${ENV_VAR}` substitution |
| `hooks/` | Project-scope hook scripts (see below) |

### `hooks/` (user-scope)

Shell scripts wired into `home-claude/settings.json`. Every hook reads Claude Code hook JSON from stdin and writes an `{"decision":"allow|block","reason":"..."}` JSON object to stdout.

| Hook | Event | Role | Blocking? |
|------|-------|------|-----------|
| `pre-destructive-blocker.sh` | PreToolUse(Bash) | Blocks `rm -rf /`, force push, `terraform destroy`, `DROP`/`TRUNCATE`, `kill -9`, shutdown, curl-pipe-to-shell, fork bombs, etc. | **Yes** |
| `pre-secrets-guard.sh` | PreToolUse(any) | Blocks tool input containing AWS/GitHub/Stripe/Anthropic/OpenAI/Slack/npm keys, PEM keys, JWTs, `.env` access, DB URLs with embedded passwords | **Yes** |
| `post-lint-gate.sh` | PostToolUse(Write\|Edit\|MultiEdit) | Auto-runs eslint/ruff/clippy/go-vet/shellcheck on the edited file; prints advisory to stderr | No (advisory) |
| `session-start.sh` | SessionStart (Notification) | Prints date, repo, branch, and first 10 lines of `tasks/lessons.md` | No |
| `session-end.sh` | SessionEnd (Notification) | Appends session metadata to `~/.claude/session-logs/{date}.log` | No |
| `stop-summary.sh` | Stop | Scans files modified in the last 5 minutes for `console.log`, `debugger`, `TODO`/`FIXME`, `pdb.set_trace`, `binding.pry`, `print()` | No (advisory) |

### `project-claude/hooks/` (project-scope)

| Hook | Event | Role |
|------|-------|------|
| `post-edit-lint.sh` | PostToolUse(Write\|Edit\|MultiEdit) | Project-scoped lint — restricts to files under git root, runs `tsc --noEmit`, `eslint`, `ruff`, `mypy`, `cargo clippy`, `golangci-lint`, `shellcheck`. Advisory |
| `post-bash-test.sh` | PostToolUse(Bash) | After a build command (`npm run build`, `cargo build`, `go build`, `tsc`, `just build`, `mvn package`, `gradle build`, etc.), auto-runs the project test suite (`just test` → `bun/npm/yarn test` → `cargo test` → `go test` → `make test`). Advisory |

## For AI Agents

### Working In `configs/`

- **These are templates, not live config.** Do not edit them expecting your own Claude Code to change — edits here ship to users on their next `bunx @youssefKadaouiAbbassi/code-tools-setup` run.
- **Hook scripts must stay shellcheck-clean.** CI runs `bun run lint:hooks` against `configs/hooks/*.sh` and `configs/project-claude/hooks/*.sh` (see root `AGENTS.md` > Testing Requirements).
- **Hooks must exit quickly.** Every hook runs on every matching tool call — slow hooks degrade UX. Keep startup < 100ms; use `command -v` checks, avoid unbounded `find`.
- **Hook contract is strict.** Read JSON from stdin, write exactly one JSON object `{"decision":"allow"|"block","reason":"..."}` to stdout. Advisory messages go to **stderr**. Never exit non-zero on the allow path.
- **`.env` access is blocked by `pre-secrets-guard.sh`.** Do not add code that reads `.env` through Claude tools — reference env vars at runtime instead.
- **Permissions deny-list is duplicated** across `home-claude/settings.json` (broad) and `project-claude/settings.json` (subset) and enforced by `pre-destructive-blocker.sh`. Changes to one should be mirrored to the others where in scope.
- **JSON files are deep-merged by the installer**, never replaced. When adding a new MCP server to `project-claude/mcp.json`, include only the new entry — existing user entries are preserved (see root `AGENTS.md` rule 3).

### Hard Rules

1. **Never hardcode secrets.** `mcp.json` uses `${DOCFORK_API_KEY}`, `${GITHUB_PAT}`, `${COMPOSIO_API_KEY}`, `${COMPOSIO_MCP_SERVER_ID}` — keep this pattern. The installer does not substitute these; Claude Code does at load time.
2. **Hook scripts start with `#!/usr/bin/env bash` + `set -euo pipefail`.** No exceptions.
3. **No interactive prompts in hooks.** They run non-interactively — `read` from stdin yields the hook JSON, nothing else.
4. **Backward-compatible template changes.** Adding a new permission deny is safe; removing one can re-expose users who relied on it — document in a release note.
5. **`home-claude/hooks/` is intentionally empty.** Do not move user-scope hook scripts into it; `configs/hooks/` is the canonical location and the installer wires paths through `~/.claude/hooks/`.
6. **Writer vs Reviewer** (root Principle 7): changes here should be reviewed by `code-reviewer` in a separate pass, not self-approved.

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

### Consumed By

- **`src/primordial.ts`** — copies every file in this tree to the installation targets
- **`src/verify.ts`** — post-install verification checks presence and permissions of deployed files
- **`src/backup.ts`** — backs up any existing target files before overwrite
- Template path resolution uses `new URL("../configs", import.meta.url).pathname` (root `AGENTS.md` rule 7)

### External References

- Claude Code hook protocol — `home-claude/settings.json` `hooks` array points to these scripts
- Starship config schema — https://starship.rs/config/
- Tmux options — tmux(1) man page
- MCP server manifest — Claude Code `.mcp.json` format

<!-- MANUAL: -->
