<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# src/components

## Purpose

Installers for the 10 **category components** of the yka-code. Each module is a self-contained `ComponentCategory` that exports (a) a category metadata object and (b) an `install(env, dryRun)` function. The `index.ts` barrel exposes two tier buckets — `RECOMMENDED_CATEGORIES` (8) and `OPTIONAL_CATEGORIES` (2) — plus the dynamic `installCategory()` dispatcher used by `src/commands/`.

Every category installer is expected to be **idempotent**, register MCP servers via `registerMcp()` (which verifies the registration landed), and respect `dryRun`.

## Key Files

| File | Tier | Components | What it installs |
|------|------|------------|------------------|
| `index.ts` | — | barrel | Re-exports categories, `ALL_CATEGORIES`, `getComponentById()`, `getCategoryById()`, `installCategory()` dispatcher |
| `code-intel.ts` | recommended | Serena (6), ast-grep (7) | `uv tool install serena-agent` (installs `uv` first if missing) + brew/cargo `ast-grep`; registers `serena` stdio MCP |
| `browser-web.ts` | recommended | Playwright (8), Crawl4AI (9), Docfork (10), DeepWiki (11) | `npm i -g @playwright/cli`, `pip install 'crawl4ai>=0.8.6'`, registers `docfork` stdio MCP (needs `DOCFORK_API_KEY`) and `deepwiki` HTTP MCP |
| `memory-context.ts` | recommended | claude-mem (12), context-mode (13), claude-hud (14) | `npx claude-mem install` + registers MCP **bound to `127.0.0.1`**; registers `context-mode` stdio MCP; installs `claude-hud` plugin + wires statusline |
| `cc-plugins.ts` | recommended | Anthropic official plugins | Adds `anthropics/claude-plugins-official` marketplace; installs feature-dev, code-review, pr-review-toolkit, code-simplifier, commit-commands, claude-code-setup, claude-md-management, frontend-design, playground, skill-creator, **session-report** (behavioral observability — HTML report from local JSONL transcripts); then installs real LSP binaries for detected runtimes |
| `skills-registry.ts` | recommended | skills.sh seed bundle | `npx skills add` for find-skills, caveman, karpathy-guidelines, playwright-cli |
| `security.ts` | recommended | Snyk MCP (5), container-use (15) | `npm i -g snyk@latest` + `snyk mcp configure --tool=claude-cli`; brew/curl install Dagger's `container-use` |
| `github.ts` | recommended | gh (16), github-mcp (17), claude-code-action (18), claude-code-review (19) | brew/apt/pacman/dnf `gh`; registers `github` HTTP MCP (needs `GITHUB_PAT`); others are guidance-only (GH Actions / native CC feature gated on `claude >= 2.1.104`) |
| `workstation.ts` | recommended | Ghostty (36), tmux (37), chezmoi (39), age (41) | brew/pacman/curl Ghostty; **verifies tmux only** (installed by core); brew/curl chezmoi; brew/binary-download `age` |
| `workflow.ts` | optional | Composio (35) | Auto-bootstraps Composio MCP server via HTTP POST to backend.composio.dev (needs `COMPOSIO_API_KEY`), then registers HTTP MCP |

## Module Contract

Every category file exports exactly two symbols:

```ts
export const <name>Category: ComponentCategory;           // metadata + components[]
export async function install(
  env: DetectedEnvironment,
  dryRun: boolean,
): Promise<InstallResult[]>;                              // one entry per component attempted
```

`ComponentCategory`, `Component`, `DetectedEnvironment`, and `InstallResult` are defined in `../types.ts`. The dispatcher in `index.ts` dynamically `import()`s each module by category id so unused categories are not loaded.

### Per-component install flow

Every component install in this directory follows the same pattern. Deviating breaks idempotency guarantees.

1. **Probe first** — `commandExists(bin)` or an `import` check (for Python packages) or env-var presence (for core-managed components).
2. **Short-circuit** — if already installed, push `status: "already-installed"`, `verifyPassed: true`, return.
3. **Dry-run branch** — log the command that would run, push `status: "skipped"`, `verifyPassed: false`, return.
4. **Install branch** — run via `Bun.$` (`await $`sh -c "..."`.quiet()`), then re-probe and set `verifyPassed` from the probe.
5. **MCP registration** — if the component has `mcpConfig`, call `registerMcp(name, spec)` from `utils.ts`. It runs `claude mcp add` and then `claude mcp list` to verify the server landed before returning `true`.
6. **Errors** — wrap each component in `try/catch`; on failure push `status: "failed"`, `verifyPassed: false`, with `err.message`.

## For AI Agents

### Working In This Directory

- **Read `../types.ts` and `../utils.ts` first.** `commandExists`, `installBinary`, `mergeJsonFile`, `appendToShellRc`, and `log` are the only helpers you should reach for. Do not reimplement them locally.
- **Use `Bun.$` for every shell call.** Wrap external commands as `await $\`sh -c "..."\`.quiet()`. Never `exec`/`spawn` from `child_process`.
- **Use `registerMcp()` for MCP servers.** Claude Code reads MCP registrations from `~/.claude.json` via the `claude mcp add`/`remove`/`list` CLI — **not** from `claude_desktop_config.json` (that's Claude Desktop, ignored by CC). `registerMcp` handles idempotent remove + add + verify.
- **Run `lsp_diagnostics` after every edit.** Every category is imported statically in `index.ts`; a type error in one breaks the whole installer build.
- **Register new categories in three places:** (1) new file here, (2) import + `RECOMMENDED_CATEGORIES`/`OPTIONAL_CATEGORIES` in `index.ts`, (3) new `case` in `installCategory()` switch.

### Hard Rules

1. **Idempotency is mandatory.** Re-running `install()` must be a no-op on already-installed components. Tests in `tests/integration/` re-run the installer twice.
2. **Never silently overwrite state.** MCP config is deep-merged. Shell RC edits go through `appendToShellRc(env, lines, marker)` with a `# yka-code-managed` marker to prevent duplicate appends.
3. **OS-adaptive.** Every binary package must declare `brew` / `apt` / `pacman` / `dnf` / `curl` / `manual` variants in its `packages[]` and let `installBinary()` pick. Do not hardcode a single package manager.
4. **Supply-chain pins are non-negotiable.** `crawl4ai` is pinned to `>=0.8.6` (v0.8.5 had a confirmed supply-chain compromise). `claude-mem` MCP **must** bind to `127.0.0.1` (port 37777 is unauthenticated by default). Both live here — do not relax either.
5. **Every component must return an `InstallResult`.** Even SaaS-only or GitHub-Actions-only entries (CodeRabbit, Google Stitch, Claude Code Action) push a `status: "skipped"` result with actionable guidance.
6. **Every new component must add a verify branch to `../verify.ts`.** Otherwise post-install verification silently passes for unverified code.
7. **Respect the tier.** `recommended` components set `defaultEnabled: true`, `optional` set `false`. The interactive installer reads this to pre-check checkboxes.

### Testing Requirements

- `bun test tests/unit/components/` — per-category unit tests (mock `Bun.$`, assert return shape).
- `bun test tests/integration/` — runs each `install()` against a clean `testcontainers` Ubuntu and macOS image, then re-runs to assert idempotency.
- `bun run lint:hooks` is **not** relevant here (it targets `configs/hooks/*.sh`).

### Writer vs Reviewer

Consistent with root `AGENTS.md`: author component changes here, then hand approval to `code-reviewer` or `verifier` in a separate pass. Do not self-approve in the same context.

## Dependencies

### Internal

| Import | Source | Role |
|--------|--------|------|
| `Component`, `ComponentCategory`, `DetectedEnvironment`, `InstallResult` | `../types.js` | Shared type contracts |
| `commandExists` | `../utils.js` | Binary probe via `Bun.which` |
| `installBinary` | `../utils.js` | OS-adaptive dispatcher for `brew`/`apt`/`pacman`/`dnf`/`curl` |
| `mergeJsonFile` | `../utils.js` | `deepmerge-ts`-backed JSON patch for MCP config |
| `appendToShellRc` | `../utils.js` | Guarded shell RC edits with `# yka-code-managed` markers |
| `log` | `../utils.js` | `picocolors`+`@clack/prompts`-aware logger |
| `$` | `bun` | Shell primitive for all external commands |

### External Install Targets

Tools and services invoked by these modules (not runtime deps of the installer itself):

| Target | Invoked by | Channel |
|--------|-----------|---------|
| `uv`, `serena-agent` | code-intel | `curl | sh` (uv bootstrap), `uv tool install` |
| `ast-grep` (`sg`) | code-intel | brew / cargo |
| `@playwright/cli`, `crawl4ai`, `docfork`, `deepwiki` | browser-web | npm global, pip, npx (MCP), HTTPS MCP |
| `claude-mem`, `context-mode` | memory-context | npx (install + MCP) |
| `snyk`, Dagger `container-use` (`cu`) | security | npx, brew tap / curl |
| `gh`, GitHub MCP | github | brew/apt/pacman/dnf, HTTPS MCP (`api.githubcopilot.com`) |
| Ghostty, chezmoi, `age` | workstation | brew / pacman / curl / apt / dnf |
| `claude-ntfy-hook` | notifications | npm global |
| `ccflare` | observability | npm global |
| `awesome-design-md` | design | `npx degit VoltAgent/awesome-design-md` |
| Obsidian, `claude-obsidian` | knowledge | brew cask, npm global |
| `n8n`, Composio MCP | workflow | npm global; HTTPS MCP at `backend.composio.dev/v3/mcp/<SERVER_ID>?user_id=<UID>` with `x-api-key` header. Auto-bootstraps server via `POST /api/v3/mcp/servers` if `COMPOSIO_MCP_SERVER_ID` unset. |
| `autoresearch` | ml-research | pip |

### Required Environment Variables

Set by the operator in their shell RC (some have core defaults):

| Var | Needed by | Notes |
|-----|-----------|-------|
| `DOCFORK_API_KEY` | Docfork MCP | User-supplied |
| `GITHUB_PAT` | GitHub MCP | Fine-grained PAT with repo/actions scopes |
| `COMPOSIO_API_KEY` | Composio MCP | User-supplied (from app.composio.dev, `ak_…` prefix) |
| `COMPOSIO_MCP_SERVER_ID` | Composio MCP | Auto-created on first install via bootstrap-server POST; persisted into secrets.env |
| `COMPOSIO_USER_ID` | Composio MCP | Defaults to `$USER` / basename of `$HOME` |
| `STITCH_API_KEY` | Google Stitch MCP | User-supplied; obtain via `npx @_davideast/stitch-mcp init` |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `CLAUDE_CODE_ENABLE_TELEMETRY` | observability | Set by core layer |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | orchestration | Set by core layer |

<!-- MANUAL: -->
