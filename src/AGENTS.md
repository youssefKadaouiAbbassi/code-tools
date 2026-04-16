<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# src/

## Purpose

Core TypeScript source for the `@youssefKadaouiAbbassi/code-tools-setup` installer. This directory contains the runtime logic that detects the environment, backs up existing config, deploys the Primordial tier, installs Recommended / Optional components, and verifies the result. It is consumed by `bin/setup.ts` via the `src/commands/` adapters.

Parent spec: [`../AGENTS.md`](../AGENTS.md) — stack decisions, tier model, and hard rules apply here.

## Key Files

| File | Role |
|------|------|
| `types.ts` | Single source of truth for type definitions: `DetectedEnvironment`, `InstallPackage`, `InstallResult`, `Component`, `ComponentCategory`, `MCPServerConfig`, `ConfigDeployment`, `BackupManifest`, `VerificationResult`, `VerificationReport`, plus the `OS`, `Shell`, `PackageManager`, `LinuxDistro`, `Tier`, `InstallStatus` unions. No runtime code. |
| `utils.ts` | Shared helpers — `commandExists`, `getCommandVersion`, JSON I/O (`readJson`/`writeJson`/`mergeJsonFile`), file ops (`copyFile`/`copyDir`/`ensureDir`/`fileExists`), `getConfigsDir`, the `mergeSettings` strategy-aware `deepmerge-ts` customizer, `appendToShellRc` (guarded by the `# code-tools-managed` marker), `installBinary` (OS-adaptive package-manager dispatch), and the `log` picocolors logger. |
| `detect.ts` | Environment detection — `detectOS`, `detectShell`, `detectPackageManager`, `detectLinuxDistro`, `detectExistingTools`, `detectClaudeCode`, `detectDocker`, and the composite `detectEnvironment()` that returns a fully populated `DetectedEnvironment`. |
| `backup.ts` | Timestamped backup subsystem writing to `~/.claude-backup/{YYYYMMDD-HHMMSS}/`. Exports `createBackup`, `backupIfExists`, `listBackups`, `getLatestBackup`, `restoreFromBackup`. Each backup dir has a `manifest.json` listing original/backup paths. |
| `primordial.ts` | The always-on Tier 0 installer. Backs up the target paths, then deploys `settings.json` (merged), `CLAUDE.md` + `AGENTS.md`/`GEMINI.md` symlinks, hook scripts (`chmod 700`), `jq`, `tmux` + `.tmux.conf`, `starship` + `starship.toml` + shell-rc eval, `statusline.sh`, `mise` + shell-rc eval, `just`, four `git worktree` aliases, telemetry env vars, and `tasks/lessons.md` (never overwritten). Rolls back via `restoreFromBackup` on failure. |
| `verify.ts` | Post-install verification. `verifyComponent` runs a component's `verifyCommand`, `verifyMCPServers` checks the expected names exist in `settings.json`, `verifyHooks` stats each hook file for the executable bit, `verifySettings` asserts `permissions.deny` has 30+ entries, and `verifyAll` composes a `VerificationReport`. |
| `status.ts` | Formatted status output — `formatStatusTable` renders a padded colored table of `VerificationResult`s, `showStatus` prints per-category installed/missing indicators using `env.existingTools`. |
| `restore.ts` | Interactive restore flow built on `@clack/prompts` — `listAvailableBackups`, `confirmRestore`, `runRestore(backupPath?)` which either takes a direct timestamp or lets the user pick from the `select` prompt. |

## Subdirectories

| Directory | Contents |
|-----------|----------|
| `commands/` | `citty` command adapters wired into `bin/setup.ts`: `setup.ts` (interactive + `--non-interactive` + `--dry-run` flows), `status.ts`, `restore.ts`. These are the only things `bin/` imports; they call into the modules above. |
| `components/` | 14 category installer modules (`browser-web`, `code-intel`, `database`, `design`, `github`, `knowledge`, `memory-context`, `ml-research`, `notifications`, `observability`, `orchestration`, `security`, `workflow`, `workstation`) plus the `index.ts` barrel that exports `RECOMMENDED_CATEGORIES`, `OPTIONAL_CATEGORIES`, `ALL_CATEGORIES`, and `installCategory`. See [`components/AGENTS.md`](components/AGENTS.md) for the per-module contract. |

## Module Graph

```
bin/setup.ts
  └─ src/commands/{setup,status,restore}.ts
        ├─ src/detect.ts          ──┐
        ├─ src/primordial.ts ─┐     │
        │    ├─ src/backup.ts ┴─┐   │
        │    └─ src/utils.ts ───┼───┤
        ├─ src/components/*  ───┤   │
        ├─ src/verify.ts    ────┤   │
        ├─ src/status.ts    ────┤   │
        └─ src/restore.ts   ────┘   │
                                    │
                    src/types.ts ←──┘   (imported by all modules via import type)
```

Every module imports types with `import type { ... } from "./types.js"`. The `.js` extension (not `.ts`) is required because `tsconfig.json` uses ESNext modules with Node-style resolution targeted by Bun's bundler.

## For AI Agents

### TypeScript / Bun Patterns Used Here

1. **Shell execution is always `Bun.$`**, never `child_process.exec`/`spawn`. See `utils.ts:installBinary` and `primordial.ts` for the pattern: `await $\`sh -c ${cmd}\`.quiet()`. Quote interpolated arguments naturally — `Bun.$` escapes them.
2. **File I/O is `Bun.file` / `Bun.write`**, not `fs.readFileSync`. `copyFile(src, dest)` uses `Bun.write(dest, Bun.file(src))` for zero-copy.
3. **Binary lookup is `Bun.which(name)`**, not `which` npm package. Wrap in a regex guard (`/^[a-zA-Z0-9_.\-]+$/`) to refuse suspicious input — see `utils.ts:commandExists`.
4. **Imports use `.js` suffix** (`./types.js`, not `./types`). Do not drop the suffix.
5. **Every `install*` / `deploy*` function returns `InstallResult`** — never throw to the caller for expected failures; return `{ status: "failed", verifyPassed: false, message }` instead. Only `primordial.ts`'s outer `try/catch` throws (after restoring the backup).
6. **Every installer checks idempotency first.** `installBinary` returns `status: "already-installed"` if `commandExists(pkg.name)`. New component installers must do the same — read `components/*.ts` for the template.
7. **`dryRun` is a required parameter** on every installer. In dry-run mode, log the action with `log.info("[dry-run] Would ...")` and return `status: "skipped"` with `verifyPassed: false`.
8. **Logging goes through `log.{info,warn,error,success,debug}`** from `utils.ts`. `debug` is gated on `process.env.VERBOSE`. Do not `console.log` directly.
9. **JSON edits go through `mergeJsonFile(targetPath, patch)`** (strategy-aware deep merge). Do not `JSON.parse` + `Object.assign` — it breaks `permissions.deny` array union and `mcpServers` per-key replace.
10. **Shell rc edits go through `appendToShellRc(env, lines, sectionName)`**. The helper wraps lines with `# code-tools-managed start:<section>` / `end:<section>` markers and replaces existing blocks in place — safe to re-run.
11. **Config templates resolve via `getConfigsDir()`** which returns `join(import.meta.dir, "..", "configs")`. This works from source, bunx cache, and the compiled standalone binary.

### Hard Rules (From Parent AGENTS.md, Enforced Here)

- **Backup before overwrite.** `primordial.ts` calls `createBackup(paths)` before the first deploy and `restoreFromBackup(backup)` in the `catch`. Any new primordial step must add its target path to the `backupPaths` array on line ~375.
- **`tasks/lessons.md` is append-only.** `createLessons()` returns `already-installed` without touching an existing file. Do not change this.
- **Verify every component.** Any new `Component` in `components/*.ts` must set a working `verifyCommand` — `verify.ts:verifyComponent` invokes it via `sh -c`. Add an MCP name to `MCP_SERVER_NAMES` in `verify.ts` when registering a new MCP server.
- **Hook scripts get `chmod 700`**, not `+x`. See `primordial.ts:deployHooks`. `verify.ts:verifyHooks` checks the executable bit across `0o111`.
- **Writer / Reviewer separation.** Author changes in this directory in one pass; hand verification and approval to `code-reviewer` / `verifier` in a separate lane. Do not self-approve.

### Adding a New Primordial Step

1. Write a `private async function deployX(env, dryRun): Promise<InstallResult>` in `primordial.ts`.
2. Append the target path(s) to the `backupPaths` array in `installPrimordial`.
3. Call your function from the sequential `results.push(...)` block inside `try`.
4. If it writes JSON, route through `mergeJsonFile`. If it writes shell rc, route through `appendToShellRc`.
5. Add a verification branch in `verify.ts` (e.g., extend `verifyHooks`, `verifyMCPServers`, or write a new `verifyX`).
6. Run `bun test` and `bun run lint:hooks` locally before handing off.

### Adding a New Component (Recommended / Optional)

Work inside `components/`. See [`components/AGENTS.md`](components/AGENTS.md) for the full checklist. `src/` itself should rarely need new top-level files — prefer composing existing helpers from `utils.ts`.

## Dependencies

### Used In This Directory

| Package | Where | Why |
|---------|-------|-----|
| `@clack/prompts` | `restore.ts`, `commands/setup.ts` | `intro`, `outro`, `cancel`, `select`, `confirm`, `isCancel`, `spinner`, `note` |
| `picocolors` | `utils.ts`, `status.ts`, `commands/setup.ts` | Terminal colors — `pc.cyan/green/red/yellow/gray/bold/dim` |
| `deepmerge-ts` | `utils.ts` | `deepmergeCustom` for strategy-aware `mergeSettings` |
| `citty` | `commands/*.ts` | `defineCommand` for CLI argument parsing |
| `bun` | everywhere | `$` template tag, `Bun.file`, `Bun.write`, `Bun.which`, `Bun.Glob`, `Bun.env` |
| `node:fs/promises` | `utils.ts`, `backup.ts`, `primordial.ts` | `mkdir`, `exists`, `cp`, `symlink`, `readdir`, `stat` (Bun has no native replacements for these) |
| `node:path` | multiple | `join`, `dirname` |

### Internal Module Imports

- `types.ts` is imported by every other file (type-only).
- `utils.ts` is imported by `primordial.ts`, `components/*.ts`, `commands/setup.ts`, `detect.ts`, `verify.ts`.
- `detect.ts` is imported by `commands/setup.ts` and `commands/status.ts`.
- `backup.ts` is imported by `primordial.ts` and `restore.ts`.
- `primordial.ts`, `verify.ts`, `status.ts`, `restore.ts` are imported only by `commands/*.ts`.

<!-- MANUAL: -->
