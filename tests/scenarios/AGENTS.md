<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# tests/scenarios/

## Purpose

Scenario-based tests that exercise **full installer workflows end-to-end against a mocked HOME**, without touching the developer's real `~/.claude/` and without shelling out to package managers, Docker, or `claude`. Each spec composes several `src/` modules (e.g. `primordial.ts` + `backup.ts` + `utils.ts`) and asserts the *observable outcome* of a user-facing flow — running the CLI with a flag, or invoking the primordial tier and verifying the resulting filesystem state.

Scenarios are the middle ground between `tests/unit/` (pure, single-module) and `tests/e2e/` (containerized, gated). They run on every `bun test` invocation with no env-var gating and no external dependencies.

## Parent

See `../AGENTS.md` for the full `tests/` contract (unit, integration, e2e, behavioral, scenarios, ci, fixtures).

## Quick Reference

| Script | What it runs |
|--------|--------------|
| `bun test tests/scenarios` | This directory only — both scenario specs |
| `bun test tests/scenarios/cli-flows.test.ts` | CLI surface scenarios (spawns `bin/setup.ts`) |
| `bun test tests/scenarios/primordial.test.ts` | Primordial-tier flow against a temp HOME |
| `bun test --test-name-pattern "idempotent"` | Single `test(...)` across the directory |

`bun test` (no path) runs these as part of the full suite. There is no dedicated `test:scenarios` script in `package.json`.

## Key Files

| File | Flow Under Test | What It Covers |
|------|-----------------|----------------|
| `cli-flows.test.ts` | `bin/setup.ts` CLI surface | Spawns `bun run bin/setup.ts` via `Bun.spawnSync` and asserts: `--help` lists `--non-interactive` / `--dry-run` / `--tier` and version `0.1.0`; `--non-interactive --dry-run` emits `[dry-run]` and exits 0; `--tier primordial --dry-run` and `--tier all --dry-run` each exit 0 with matching log text; `status` exits 0; `restore` exits 0 (or 1 with a "no backups" message). 7 tests, 14 assertions, ~1.5s. |
| `primordial.test.ts` | `src/primordial.ts` full install | Drives `installPrimordial()` against a `mkdtemp` temp HOME with `installBinary` and `getConfigsDir` mocked via `mock.module("../../src/utils.js", ...)`. Asserts: dry-run writes nothing; real run produces `~/.claude/settings.json` with >= 40 deny rules; `CLAUDE.md` < 100 lines; all 6 hook scripts exist and are executable (`mode & 0o111 > 0`); shell rc gains the `# code-tools-managed` marker; `tasks/lessons.md` is never overwritten on a second run; backup is created when a pre-existing `settings.json` is present; two runs produce no duplicate deny rules; at least 12 `InstallResult` entries returned. 9 tests. |

## For AI Agents

### Where New Scenario Tests Go

1. **New CLI flag or subcommand on `bin/setup.ts`?** Add a `test(...)` to `cli-flows.test.ts`. Reuse the `runCli(...args)` helper (lines 5-17) — do not re-spawn from scratch.
2. **New component installer (`src/components/<category>/*`)?** Create `tests/scenarios/<category>.test.ts`. Follow the `primordial.test.ts` template: `mock.module("../../src/utils.js", ...)` to stub `installBinary`, `mkdtemp` a temp HOME in `beforeEach`, call the installer, assert filesystem state, clean the temp dir in `afterEach`. Per the root `AGENTS.md` and the `tests/unit/` contract, component installers belong **here**, not in `tests/unit/`.
3. **New tier or orchestration entry point (e.g. a new value of `--tier`)?** Add a dry-run case to `cli-flows.test.ts` AND a full-run case to the matching `tests/scenarios/<tier>.test.ts`.
4. **Needs Docker, real package managers, or multi-OS coverage?** Belongs in `tests/e2e/` instead.
5. **Needs live `claude` CLI?** Belongs in `tests/behavioral/` (gated by `RUN_BEHAVIORAL_TESTS=true`).

### Hard Rules

1. **Temp-dir only for filesystem writes.** Every spec that writes files must use `mkdtemp(join(tmpdir(), "code-tools-..."))` and `rm(tmpDir, { recursive: true, force: true })` in `afterEach`. Copy the pattern from `primordial.test.ts` lines 78-88.
2. **`backup.ts` leaks to real `~/.claude-backup/` — track and clean.** `src/backup.ts` captures `BACKUP_BASE = join(Bun.env.HOME, ".claude-backup")` at module-load, so any scenario that triggers `createBackup` lands artifacts in the real home. Push each created backup path onto a `createdBackupDirs: string[]` array and `rm` it in `afterEach` — see `primordial.test.ts` lines 60-61, 85-87, 205-208.
3. **Mock `installBinary`, never let real package managers run.** Use `mock.module("../../src/utils.js", ...)` and re-export every real util alongside the override (mock replaces the whole module). See `primordial.test.ts` lines 9-54 for the canonical pattern — imports happen before `mock.module`, then `await import(...)` reloads the module-under-test after the mock is in place.
4. **Override `getConfigsDir` to the real repo configs.** Tests can run from arbitrary cwds; pin the configs path with `getConfigsDir: () => REAL_CONFIGS_DIR` (see `primordial.test.ts` line 45) so template lookup is deterministic.
5. **`runCli` uses `Bun.spawnSync` with piped stdout/stderr.** For CLI scenarios, always concatenate `stdout + stderr` before asserting — Clack and `picocolors` output routes through both streams depending on terminal detection. See `cli-flows.test.ts` lines 5-17.
6. **Never call the installer without `--dry-run` or a mocked HOME.** The only sanctioned non-dry-run paths are (a) `primordial.test.ts`-style `installPrimordial(env, false)` with a temp-HOME `DetectedEnvironment`, or (b) future component scenarios mirroring that setup. Real runs against the developer's `$HOME` are a critical regression.
7. **Assert hook executability, not just presence.** When deploying hooks, check `fileStat.mode & 0o111 > 0` — a non-executable hook is a silent Claude Code regression. See `primordial.test.ts` lines 147-150.
8. **Idempotency is mandatory.** Every installer flow must have a "run twice, final state is the same" assertion (e.g. `primordial.test.ts` lines 211-223: no duplicate deny rules after two runs).
9. **`tasks/lessons.md` is never overwritten.** Preserve the second-run preservation test when editing `primordial.test.ts` (lines 161-185). This mirrors the installer's own hard rule.
10. **Import from `.js` paths.** ESNext modules use `.js` specifiers even though sources are `.ts` (e.g. `from "../../src/primordial.js"`).

### Mocking Pattern (Reference)

```ts
// 1. Import real utils BEFORE mock.module so we can re-export them
import { commandExists, readJson, writeJson, /* ...all exports... */ } from "../../src/utils.js";

// 2. Replace the module — mock.module wipes all non-listed exports
mock.module("../../src/utils.js", () => ({
  commandExists, readJson, writeJson, /* ...all exports... */
  getConfigsDir: () => REAL_CONFIGS_DIR,
  installBinary: async (pkg) => ({
    component: pkg.displayName ?? pkg.name,
    status: "already-installed",
    message: "mocked",
    verifyPassed: true,
  }),
}));

// 3. Import the module-under-test AFTER the mock is installed
const { installPrimordial } = await import("../../src/primordial.js");
```

### Writer vs Reviewer

Per the root `AGENTS.md`: author new scenarios here, then hand the approval pass to `code-reviewer` or `verifier` in a separate lane. Do not self-approve coverage claims in the same context that wrote them.

## Dependencies

### Runtime (devDependencies)

| Package | Role |
|---------|------|
| `bun:test` | Built-in Bun test runner — `describe`, `test`, `expect`, `beforeEach`, `afterEach`, `mock` |
| `node:fs/promises` | `mkdtemp`, `rm`, `writeFile`, `stat` for temp-dir fixtures and hook mode checks |
| `node:path` | `join` for composing temp HOME paths |
| `node:os` | `tmpdir()` for the OS temp root |
| `Bun.spawnSync` | CLI-subprocess driver in `cli-flows.test.ts` (built-in, no import) |
| `Bun.file` | Filesystem existence/read assertions (built-in) |

### Test-Time Externals

**None.** Scenarios deliberately have no external dependencies. They do not require `jq`, `bats`, `docker`, `claude`, or any package manager — those belong in `tests/integration/`, `tests/ci/`, `tests/e2e/`, or `tests/behavioral/`.

### Env Vars Consumed

| Var | Effect |
|-----|--------|
| `HOME` | Passed through to the spawned CLI in `cli-flows.test.ts` (line 10). Scenarios do not write to it; `backup.ts` reads it at module-load via `Bun.env.HOME`. |

<!-- MANUAL: -->
