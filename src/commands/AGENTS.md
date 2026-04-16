<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# src/commands/

## Purpose

CLI subcommand implementations wired into `bin/setup.ts` via [citty](https://github.com/unjs/citty). Each file in this directory exports a `citty`-compatible command definition that the top-level CLI dispatches to based on the invoked subcommand name (`setup`, `status`, `restore`). These are the **entry-point handlers** — they own user-facing flow (prompts, spinners, summaries) and delegate the actual install/verify/restore work to sibling modules in `src/`.

Parent contract: see `../AGENTS.md` for repo-wide rules (stack lock, idempotency, backup policy, writer-vs-reviewer separation). Those rules apply here unchanged.

## Key Files

| File | Status | Description |
|------|--------|-------------|
| `setup.ts` | Implemented | Interactive installer. Runs environment detection (`../detect.js`), installs primordial (`../primordial.js`), prompts for tier/category selection via `@clack/prompts`, installs selected categories (`../components/index.js`), runs verification (`../verify.js`), prints a summary and a post-install API-key checklist for MCP servers. Supports `--non-interactive`, `--tier <primordial\|recommended\|all>`, and `--dry-run` flags. |
| `status.ts` | Stub | Prints `"Status: not yet implemented"`. Intended to display installed vs missing components. Real logic lives in `../status.ts` (`showStatus()` / `formatStatusTable()`) and must be wired in. |
| `restore.ts` | Stub | Prints `"Restore: not yet implemented"`. Intended to restore configs from `~/.claude-backup/{timestamp}/`. Real logic lives in `../restore.ts` (`runRestore()`, `listAvailableBackups()`, `confirmRestore()`) and must be wired in. |

## Command Surface

Dispatched from `bin/setup.ts`:

```ts
subCommands: {
  setup:   () => import("../src/commands/setup.js").then((m) => m.default),
  status:  () => import("../src/commands/status.js").then((m) => m.default),
  restore: () => import("../src/commands/restore.js").then((m) => m.default),
}
```

The default command (no subcommand) re-invokes `setup` with the same `rawArgs`, so `bunx @youssefKadaouiAbbassi/code-tools-setup` and `... setup` are equivalent.

### setup.ts flags

| Flag | Type | Description |
|------|------|-------------|
| `--non-interactive` | boolean | Skip prompts, install every category with defaults. |
| `--tier <name>` | string | One of `primordial`, `recommended`, `all`. |
| `--dry-run` | boolean | Report planned changes without touching the filesystem. |

Mutually-exclusive priority: `--non-interactive` beats `--tier` beats interactive mode.

### Interactive flow (runInteractive)

1. `clack.intro` banner.
2. Spinner: `detectEnvironment()` -> `clack.note` showing OS, shell, package manager, Claude Code / Docker / Bun versions.
3. `clack.note` explaining the primordial layer.
4. Spinner: `installPrimordial(env, dryRun)`.
5. `clack.select` tier: `Everything` / `Let me pick` / `Nothing`.
6. If `pick`: one `clack.confirm` per recommended category (default yes) and per optional category (default no).
7. Per selected category: spinner + `installCategory(cat, env, dryRun)`, accumulating `InstallResult[]`.
8. Spinner: `verifyAll(env, allResults)`.
9. `clack.note` summary (installed / skipped / failed counts + per-failure details + verification totals).
10. If categories requiring keys were selected (`browser-web`, `github`, `workflow`, `database`), `clack.note` with the env-var checklist from `MCP_ENV_VARS`.
11. `clack.outro`.

Cancellation: every `clack.isCancel(...)` check routes through `handleCancel()` -> `clack.cancel()` + `process.exit(0)`.

## AI Agent Instructions

### Adding a new subcommand

1. Create `src/commands/<name>.ts` that exports `default defineCommand({ meta, args, run })` from `citty`.
2. Register it in `bin/setup.ts` under `subCommands` using the dynamic-import pattern (`() => import(...).then(m => m.default)`).
3. Put non-trivial logic in a sibling `src/<name>.ts` module; keep the command file thin (arg parsing, flow, presentation only).
4. Import types from `../types.js` — do not re-declare `InstallResult`, `DetectedEnvironment`, `VerificationResult`, etc.
5. Use `.js` extensions in imports even though sources are `.ts` (ESNext module resolution — required by `tsconfig.json`).

### Wiring the stubs

`status.ts` and `restore.ts` are placeholders. When implementing:

- **status.ts** — Import `showStatus` from `../status.js` (or build a `formatStatusTable`-based flow). Call `detectEnvironment()` first so `env.existingTools` is populated, then pass `ALL_CATEGORIES` from `../components/index.js`.
- **restore.ts** — Import `runRestore(backupPath?: string)` from `../restore.js`. Accept an optional positional arg (`args._[0]`) to allow `bunx ... restore <timestamp>`. Interactive selection is already handled inside `runRestore`.

Both real implementations already use `@clack/prompts` (`intro`, `outro`, `select`, `confirm`, `cancel`, `isCancel`) and return cleanly on cancellation. Do not duplicate that logic — just call them.

### Presentation rules

- Use `@clack/prompts` for all interactive UI: `intro`, `outro`, `spinner`, `note`, `select`, `confirm`, `cancel`. Do not mix with raw `readline` or `prompts`.
- Use `picocolors` (`pc.green`, `pc.red`, `pc.yellow`, `pc.dim`, `pc.bold`, `pc.cyan`) for color — no `chalk`, no `ansi-colors`.
- Use `log` from `../utils.js` (`log.info` / `log.error` / `log.success`) for non-interactive paths.
- Every `isCancel` branch must call `clack.cancel(...)` and exit or return — never fall through silently.

### Hard rules

1. Command files **do not** touch the filesystem directly. Delegate to `../primordial.js`, `../components/index.js`, `../backup.js`, `../restore.js`, `../verify.js`.
2. Honor `--dry-run` — pass it through to every installer call.
3. Keep citty metadata (`meta.name`, `meta.description`) in sync with the flags advertised in `bin/setup.ts` and `README.md`.
4. Never self-approve documentation or implementation changes here; authoring is one pass, review is a separate pass via `code-reviewer` or `verifier` (see parent `AGENTS.md` Writer vs Reviewer section).

## Dependencies

### Direct imports (setup.ts)

| Module | Role |
|--------|------|
| `citty` | `defineCommand` — command definition + arg parsing. |
| `@clack/prompts` | `intro`, `outro`, `spinner`, `select`, `confirm`, `note`, `cancel`, `isCancel`. |
| `picocolors` (`pc`) | Terminal colors. |
| `../detect.js` | `detectEnvironment()` -> `DetectedEnvironment`. |
| `../primordial.js` | `installPrimordial(env, dryRun)` -> `InstallResult[]`. |
| `../verify.js` | `verifyAll(env, results)` -> `VerificationReport`. |
| `../components/index.js` | `RECOMMENDED_CATEGORIES`, `OPTIONAL_CATEGORIES`, `ALL_CATEGORIES`, `installCategory()`. |
| `../utils.js` | `log` (non-interactive output). |
| `../types.js` | `DetectedEnvironment`, `InstallResult`, `ComponentCategory`. |

### Direct imports (status.ts, restore.ts — current stubs)

| Module | Role |
|--------|------|
| `citty` | `defineCommand`. |

### Expected imports once wired

| Module | Used by |
|--------|---------|
| `../status.js` | `status.ts` — `showStatus()`, `formatStatusTable()`. |
| `../restore.js` | `restore.ts` — `runRestore()`, `listAvailableBackups()`, `confirmRestore()`. |
| `../detect.js` | `status.ts` — needs `DetectedEnvironment.existingTools`. |
| `../components/index.js` | `status.ts` — `ALL_CATEGORIES` to enumerate components. |

### External runtime requirements

- **Bun** `>= 1.2` — module resolution (`.js` extension pointing at `.ts` source) and dynamic `import()` in `bin/setup.ts`.
- All other requirements are inherited from parent `AGENTS.md` (Claude Code, jq, platform package manager).

<!-- MANUAL: -->
