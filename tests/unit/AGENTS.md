<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# tests/unit/

## Purpose

Pure, fast unit tests for individual modules in `src/`. Every spec mounts a fresh `mkdtemp` temp directory in `beforeEach` and tears it down in `afterEach`, so these tests never touch the developer's real `~/.claude/` and never shell out to package managers, Docker, or `claude`. Run on every `bun test` invocation with no gating env vars.

Scope covered today: `src/utils.ts`, `src/detect.ts`, `src/backup.ts`, `src/verify.ts`. Runtime ~2.5s for the full directory (28 tests, 70 assertions).

## Quick Reference

| Script | What it runs |
|--------|--------------|
| `bun run test:unit` | This directory only — `tests/unit/*.test.ts` |
| `bun test tests/unit/utils.test.ts` | Single file (e.g. `utils.test.ts`) |
| `bun test --test-name-pattern "mergeJsonFile"` | Single `describe` across the directory |

## Key Files

| File | Module Under Test | What It Covers |
|------|-------------------|----------------|
| `utils.test.ts` | `src/utils.ts` | `commandExists`, `mergeJsonFile` (deny-rule array union, `mcpServers` per-key replace, scalar overwrite, creation when missing), `appendToShellRc` (idempotent block marker, update-in-place), `readJson`/`writeJson` roundtrip, `copyFile`, `getConfigsDir` |
| `detect.test.ts` | `src/detect.ts` | `detectOS` matches `process.platform`, `detectShell` returns valid `zsh`/`bash`/`fish` + rcPath, `detectPackageManager` finds `brew`/`apt`/`pacman`/`dnf`, `detectDocker` returns boolean, `detectExistingTools` map semantics, `detectEnvironment` full-shape assertion |
| `backup.test.ts` | `src/backup.ts` | `createBackup` manifest + on-disk `manifest.json`, skip-missing-files behaviour, `restoreFromBackup` content roundtrip, `listBackups` ascending sort, `getLatestBackup` selects most recent timestamp |
| `verify.test.ts` | `src/verify.ts` | `verifyAll` report shape + `passed+failed+skipped === totalChecked` identity, `verifyComponent` pass/fail on `verifyCommand` exit code, `displayName` propagation |

## For AI Agents

### Where New Unit Tests Go

1. **New exported function in an already-covered file in `src/` (e.g. `src/utils.ts`)?** Add a `describe` block to the matching `tests/unit/<module>.test.ts`. Do not create a new file.
2. **New top-level `src/*.ts` module?** Create `tests/unit/<module>.test.ts` that mirrors the existing pattern (imports from `../../src/<module>.js`, temp dir fixture, one `describe` per exported function).
3. **New component installer (`src/components/*`)?** Do **not** add it here — component installers belong in `tests/scenarios/`, which drives the full install flow against a mocked temp home. `tests/unit/` is reserved for pure modules in `src/` root.
4. **New `verify()` branch in `src/verify.ts`?** Extend `verify.test.ts`, then mirror the post-install guarantee in `tests/ci/verify.bats`.

### Hard Rules

1. **Temp-dir only.** Every spec that writes to disk must use `mkdtemp(join(tmpdir(), "code-tools-..."))` and `rm(tmpDir, { recursive: true, force: true })` in `afterEach`. Copy the `beforeEach`/`afterEach` block from `utils.test.ts`.
2. **`backup.ts` is the one exception.** `src/backup.ts` captures `BACKUP_BASE = join(Bun.env.HOME, ".claude-backup")` at module-load time, so `backup.test.ts` lands real backups in the real `~/.claude-backup/`. Push each created path onto `createdBackupDirs` and clean it in `afterEach` — see `backup.test.ts` lines 14-27 for the pattern.
3. **Mock `DetectedEnvironment` with a helper.** Use a local `makeEnv()` (see `utils.test.ts` line 27 and `verify.test.ts` line 18) that builds a minimal `DetectedEnvironment` pointing at `tmpDir`. Do not call `detectEnvironment()` from unit tests outside `detect.test.ts`.
4. **No network, no containers, no real package managers.** Those belong in `tests/integration/`, `tests/e2e/`, or `tests/scenarios/`. If a unit test needs `installBinary`, mock the module (example: `tests/scenarios/primordial.test.ts`).
5. **No `claude` CLI calls.** Behavioral prompts against live Claude live in `tests/behavioral/` and are gated by `RUN_BEHAVIORAL_TESTS=true`.
6. **Verify idempotency where the unit supports it.** `appendToShellRc` is called twice in one test to assert the `# code-tools-managed` marker appears exactly once — mirror that pattern for any new idempotent helper.
7. **Import from `.js` paths.** The project uses ESNext modules with `.js` extensions in import specifiers even though sources are `.ts` (see any existing test: `from "../../src/utils.js"`).

### Writer vs Reviewer

Consistent with the root `AGENTS.md`: author new unit tests here, then hand the approval pass to `code-reviewer` or `verifier` in a separate lane. Do not self-approve coverage claims in the same context that wrote them.

## Dependencies

### Runtime (devDependencies)

| Package | Role |
|---------|------|
| `bun:test` | Built-in Bun test runner — `describe`, `test`, `expect`, `beforeEach`, `afterEach` |
| `node:fs/promises` | `mkdtemp`, `rm`, `writeFile`, `readFile` for temp-dir fixtures |
| `node:path` | `join` for building temp paths |
| `node:os` | `tmpdir()` for the OS temp root |
| `@types/bun` | Types for `Bun.file`, `Bun.env`, and the runtime-level `Bun.$` used by modules under test |

### Test-Time Externals

Unit tests deliberately have **no external dependencies**. They do not require `jq`, `bats`, `docker`, `claude`, or any package manager. If a spec you are writing needs any of those, move it to the appropriate sibling directory (`tests/integration/`, `tests/ci/`, `tests/e2e/`, or `tests/behavioral/`).

### Mocking

This directory does not use `mock.module` today — all four existing specs are pure against real module code. When mocking becomes necessary (e.g. a function that shells out unconditionally), follow the `mock.module("../../src/utils.js", ...)` pattern used in `tests/scenarios/primordial.test.ts` rather than inventing a new approach.

<!-- MANUAL: -->
