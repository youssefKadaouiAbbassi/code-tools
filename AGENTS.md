<!-- Generated: 2026-04-14 | Updated: 2026-04-14 -->

# code-tools

## Purpose

Interactive CLI installer for the **Ultimate Claude Code System v12** — a 40-component Claude Code development environment. This repository is the **installer/setup tool**, not the installed system itself. It scaffolds a complete workstation (hooks, MCP servers, agents, sandbox, observability) onto any supported machine.

- **Package:** `@youssefKadaouiAbbassi/code-tools-setup`
- **Runtime:** Bun (>= 1.2) with TypeScript
- **UI:** `@clack/prompts` interactive TUI with `picocolors`
- **Target system:** 40 components, 7 MCP servers, 12 principles (see `README.md`)

## Quick Start

```bash
# Normal interactive install (requires Bun)
bunx @youssefKadaouiAbbassi/code-tools-setup

# Non-interactive (CI)
bunx @youssefKadaouiAbbassi/code-tools-setup --non-interactive

# Preview only
bunx @youssefKadaouiAbbassi/code-tools-setup --dry-run

# Fresh machine (installs Bun, Claude Code, jq, then runs installer)
curl -fsSL https://raw.githubusercontent.com/youssefKadaouiAbbassi/code-tools/master/bootstrap.sh | bash
```

### Local Development

```bash
bun install
bun run dev        # run the installer from source
bun test           # full test suite (unit + integration + e2e)
bun run build      # compile standalone binary -> dist/code-tools-setup
bun run build:npm  # build npm-publishable bundle
```

## Architecture

Three install tiers gate every component:

| Tier | Prompt | Default | What it contains |
|------|--------|---------|------------------|
| **Primordial** | none (silent) | always installs | `settings.json`, `CLAUDE.md` + symlinks, 6 hook scripts, `tmux.conf`, `starship.toml`, `statusline.sh`, `mise`, `just`, git aliases, telemetry env vars, `tasks/lessons.md` |
| **Recommended** | yes/no | **yes** | Code Intelligence (Serena + ast-grep), Browser+Web (Playwright + Crawl4AI + Docfork + DeepWiki), Memory+Context (claude-mem + context-mode + claude-hud), cc-plugins (Anthropic official marketplace), skills-registry (skills.sh seed bundle), Security (Snyk + container-use), GitHub stack, Workstation extras |
| **Optional** | yes/no | **no** | Observability (ccflare), Orchestration (Multica), Design (Stitch + awesome-design-md), Knowledge (Obsidian + claude-obsidian), Workflow (n8n + Composio) |

Primordial files are **backed up then overridden** at `~/.claude-backup/{timestamp}/`. Component installs must be **idempotent** (check before acting), MCP entries must be **deep-merged** into existing JSON, and shell rc edits use the `# code-tools-managed` marker to prevent duplication.

## Key Files

| File | Description |
|------|-------------|
| `README.md` | v12 system architecture: components, MCP servers, principles, MCP config, validation trail |
| `package.json` | Bun package (`@youssefKadaouiAbbassi/code-tools-setup` v0.1.0), scripts, engines, publish config |
| `tsconfig.json` | TypeScript config (ES2022, ESNext modules, strict, `bun-types`) |
| `bootstrap.sh` | Fresh-machine entrypoint — installs Bun + Claude Code + jq, then `bunx` the installer |
| `bun.lock` | Bun lockfile — commit with dependency changes |
| `.gitignore` | Standard Bun/Node ignores |

## Subdirectories

Each subdirectory has its own `AGENTS.md` (or should) with the detailed contract for that area. This root file is the entry point.

| Directory | Purpose |
|-----------|---------|
| `bin/` | CLI entry point (`setup.ts`) — wires `citty` commands and dispatches to `src/commands/` |
| `src/` | Installer source — `types.ts`, `utils.ts`, `detect.ts`, `backup.ts`, `primordial.ts`, `verify.ts`, `status.ts`, `restore.ts`, plus `commands/` and `components/` subtrees |
| `src/components/` | 13 category installers (code-intel, browser-web, memory-context, cc-plugins, skills-registry, security, github, workstation, observability, orchestration, design, knowledge, workflow) exported through `index.ts` barrel |
| `configs/` | Templates deployed by `primordial.ts` — `home-claude/`, `project-claude/`, `hooks/`, plus `tmux.conf`, `starship.toml`, `statusline.sh` |
| `agents/` | /do orchestrator subagents (do-classifier, do-clarifier, do-recorder) deployed to `~/.claude/agents/` |
| `skills/` | Orchestration skills (do, team-do, ship-feature, fix-bug, refactor-safely, security-audit, onboard-codebase, tdd-first, doc-hygiene, ci-hygiene, knowledge-base, release-cut, setup, loop-patterns, worktree-task) deployed to `~/.claude/skills/` |
| `commands/` | User-level slash commands (/do) deployed to `~/.claude/commands/` |
| `tests/` | `unit/`, `integration/`, `e2e/`, `behavioral/`, `scenarios/`, `ci/` (bats), `fixtures/` — uses `bun test`, `@gmrchk/cli-testing-library`, and `testcontainers` |
| `tasks/` | `lessons.md` — corrections log the installer itself respects (repo's own dogfooding) |
| `.claude-plugin/` | `plugin.json` — Claude Code plugin manifest exposing the installer as a plugin |
| `.github/workflows/` | CI/CD — test matrix, publish pipeline |
| `.omc/` | OMC workspace — `specs/` (deep-interview spec), `plans/`, `sessions/`, `state/`, `project-memory.json`. **Note:** research corpus and `ultimate-configs/` were cleaned from the repo; source-of-truth templates now live in `configs/` |

## For AI Agents

### Working In This Repository

- **Stack is locked:** Bun + TypeScript + `@clack/prompts` + `picocolors` + `citty` + `deepmerge-ts`. Do not reintroduce `simple-git`, `fs-extra`, `which`, or `yaml` — those were superseded by Bun built-ins (`Bun.$`, `Bun.file`, `Bun.which`) and the current deps.
- **Use `Bun.$` for shell operations** in TypeScript, not raw `exec`/`spawn`.
- **Use dedicated tools** (Glob, Grep, Read) over Bash `find`/`grep`/`cat`.
- **Run `lsp_diagnostics` after every edit** — catch type errors before claiming done.
- **Parallelize independent file reads** (Glob to map, Grep to search, Read to load).

### Hard Rules For Installer Code

1. **Idempotency is mandatory.** Every `install()` must check `verify()` first and return `{ skipped: true }` if already installed.
2. **Never overwrite without backup.** Primordial files must call `backup.ts` before writing. `tasks/lessons.md` is **never** overwritten once it exists.
3. **Deep-merge JSON, never replace.** Use `deepmerge-ts` for `settings.json`, `.mcp.json`, `.gitconfig` modifications.
4. **Shell rc edits are guarded.** Wrap additions with `# code-tools-managed` markers and check for them before appending.
5. **OS-adaptive installs.** Every binary install must handle brew / apt / pacman / dnf (plus `curl|sh` fallbacks) via the `installBinary(pkg, env)` helper in `src/utils.ts`.
6. **Supply-chain pins.** Crawl4AI pinned to `>=0.8.6` (v0.8.5 was compromised). claude-mem must bind to `127.0.0.1` (port 37777 is unauthenticated by default).
7. **Config file resolution.** Use `new URL("../configs", import.meta.url).pathname` so templates resolve whether the installer runs from source, bunx cache, or compiled binary.

### Testing Requirements

- `bun test` must pass (runs unit + integration + e2e by default).
- `bun run test:ci` runs the bats verification suite (`tests/ci/verify.bats`) — used in CI.
- `bun run lint:hooks` runs `shellcheck` against `configs/hooks/*.sh` and `configs/project-claude/hooks/*.sh`. Hook scripts must be shellcheck-clean.
- Integration/e2e tests use `testcontainers` to install into a clean container — never against the developer's real `~/.claude/`.
- `src/verify.ts` performs post-install verification — every new component must add a verify branch.

### Writer vs Reviewer

Consistent with Principle 1 (verification > generation) and Principle 7 (writer != reviewer): do not self-approve in the same context. Author changes here, then hand the approval pass to `code-reviewer` or `verifier` in a separate lane.

## Dependencies

### Runtime

| Package | Version | Role |
|---------|---------|------|
| `@clack/prompts` | `^0.10` | Interactive TUI (spinners, selects, confirms, notes) |
| `picocolors` | `^1.1` | Terminal colors (tiny, no deps) |
| `citty` | `^0.2` | CLI argument parser for `bin/setup.ts` |
| `deepmerge-ts` | `^7.0` | JSON merging for `settings.json` / `.mcp.json` patches |

### Dev

| Package | Role |
|---------|------|
| `@types/bun` | Bun type definitions |
| `typescript` `^5.8` | Type checking (compilation is via `bun build`) |
| `@gmrchk/cli-testing-library` | Interactive CLI e2e testing |
| `testcontainers` `^10.0` | Containerized install tests |

### External Runtime Requirements

- **Bun** `>= 1.2` — primary runtime (`bootstrap.sh` installs if missing)
- **Claude Code** — the system being configured (`bootstrap.sh` installs if missing)
- **jq** — required by hook scripts (`bootstrap.sh` installs if missing)
- Platform package manager: **brew** (macOS), **apt** / **pacman** / **dnf** (Linux)

<!-- MANUAL: -->
