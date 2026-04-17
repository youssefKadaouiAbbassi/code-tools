<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# tests/

## Purpose

Test suite for the `@youssefKadaouiAbbassi/yka-code-setup` installer. Tests focus on two things only: (1) the CLI code itself and (2) correct installation behavior. No AI-judge / live-model behavioral tests, no container orchestration.

Five test types from fast/pure to end-to-end against a temp `$HOME`.

## Quick Reference

| Script | What it runs |
|--------|--------------|
| `bun test` | Full TypeScript suite |
| `bun run test:unit` | `tests/unit/` only — pure, fast, `mkdtemp` isolation |
| `bun run test:integration` | `tests/integration/` — spawns the CLI, validates configs/hooks |
| `bun run test:scenarios` | `tests/scenarios/` — install flows end-to-end against temp homes |
| `bun run test:ci` | `bats tests/ci/verify.bats` — post-install verification in CI environments |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `unit/` | Pure unit tests for `src/utils.ts`, `src/detect.ts`, `src/backup.ts`, `src/verify.ts`, `src/install-journal.ts`, `src/install-mode.ts`, `src/add-on-top.ts`, plus `primordial-scope` and `grep-guardrails`. All filesystem work in `mkdtemp` temp dirs. |
| `integration/` | Spawns the real CLI (`bin/setup.ts`) via `Bun.$`, validates shipped configs (`config-validation.test.ts`), pipes fixtures through hook scripts (`hooks.test.ts`, gated on `jq`). |
| `scenarios/` | Full install flows: `primordial.test.ts` mocks `installBinary` and drives the whole `installPrimordial` pipeline against a temp home; `cli-flows.test.ts` walks CLI argument matrices. |
| `ci/` | Bats post-install assertions driven by `bun run test:ci`. Requires `bats` on PATH. |
| `fixtures/` | Hand-authored inputs: `hook-stdin-*.json` payloads piped into hook scripts; `settings-existing.json` for merge tests. |

## For AI Agents

### Where New Tests Go

1. **New pure function in `src/`?** Add to the matching file under `tests/unit/`.
2. **New component installer (`src/components/*`)?** Add a scenario under `tests/scenarios/` that drives the component against a `mkdtemp` home and verifies idempotency.
3. **New CLI flag or subcommand?** Extend `tests/integration/cli.test.ts` with a `Bun.$` spawn against `bin/setup.ts`.
4. **New hook script?** Add fixtures under `tests/fixtures/hook-stdin-*.json`, a piped spec in `tests/integration/hooks.test.ts`, and an executable/permission check in `tests/ci/verify.bats`.
5. **New `verify()` branch in `src/verify.ts`?** Cover it in `tests/unit/verify.test.ts` and reflect the post-install guarantee in `tests/ci/verify.bats`.

### Hard Rules

1. **Never touch the real `~/.claude/`.** Use `mkdtemp(join(tmpdir(), "yka-code-..."))` and override `env.homeDir` / `env.claudeDir` on a `DetectedEnvironment` stub. See `tests/scenarios/primordial.test.ts` for the `mockEnv` pattern.
2. **No real package-manager calls.** `tests/scenarios/primordial.test.ts` uses `mock.module("../../src/utils.js", ...)` to replace `installBinary` with an `already-installed` stub. Never let `apt`/`brew`/`curl|sh` run from a test.
3. **Idempotency is tested, not assumed.** Any installer spec must run the install twice and assert no duplicate shell-rc blocks, no duplicate `permissions.deny` entries, and preserved user-authored content.
4. **Gate external-tool tests with `describe.skipIf`.** Hook specs that shell out to `jq`: `describe.skipIf(!Bun.which("jq"))`.
5. **Clean up in `afterEach`.** `rm(tmpDir, { recursive: true, force: true })`. Scenario specs that create real backups must use the `YKA_CODE_BACKUP_BASE` or `YKA_CODE_JOURNAL_PATH` env overrides to avoid polluting `~/.claude-backup/` or `~/.config/yka-code/`.
6. **Use `Bun.$` (not raw `exec`/`spawn`)** for shelling out wherever possible; `Bun.spawn`/`Bun.spawnSync` are acceptable when you need exit codes or stdin piping.
7. **Never commit broken fixtures.** `tests/fixtures/*.json` must be valid JSON that real hooks can parse.

### Running a Focused Subset

```bash
bun test tests/unit/utils.test.ts                # one file
bun test --test-name-pattern "mergeJsonFile"     # one describe
bun run test:unit && bun run test:integration    # fast dev loop
bun run test:ci                                  # CI post-install bats
```

## Dependencies

### devDependencies

| Package | Role |
|---------|------|
| `bun:test` | Built-in Bun test runner (`describe`, `test`, `expect`, `beforeEach`, `afterEach`, `mock.module`, `describe.skipIf`) |
| `@types/bun` | Types for `Bun.$`, `Bun.file`, `Bun.spawn`, `Bun.spawnSync`, `Bun.which` |

### External (must be on PATH)

| Tool | Required by | Install |
|------|-------------|---------|
| `jq` | `tests/integration/hooks.test.ts`, `tests/ci/verify.bats` | `bootstrap.sh` installs; brew/apt/pacman/dnf |
| `bats` | `tests/ci/verify.bats` (`bun run test:ci`) | System package manager (CI image) |
| `shellcheck` | `bun run lint:hooks` | System package manager |

### Env Vars

| Variable | Effect |
|----------|--------|
| `YKA_CODE_BACKUP_BASE` | Override backup root for tests to avoid polluting `~/.claude-backup/` |
| `YKA_CODE_JOURNAL_PATH` | Override journal path for tests to avoid polluting `~/.config/yka-code/` |

<!-- MANUAL: -->
