<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# tests/

## Purpose

Comprehensive test suite for the `@youssefKadaouiAbbassi/code-tools-setup` installer. Organized into six test types that layer from fast/pure (unit) to slow/realistic (e2e containers), plus a behavioral suite that prompts a live `claude -p` against the installed system and a bats verification suite used in CI.

Running `bun test` executes the full TypeScript suite (unit + integration + e2e + scenarios + behavioral — long-running ones are `skipIf`-gated). `bun run test:ci` runs the bats post-install assertions.

## Quick Reference

| Script | What it runs |
|--------|--------------|
| `bun test` | Full TypeScript suite (long-running specs gate themselves on env vars) |
| `bun run test:unit` | `tests/unit/` only — pure, fast, no filesystem mutation beyond `mkdtemp` |
| `bun run test:integration` | `tests/integration/` — spawns the compiled CLI, validates configs/hooks |
| `bun run test:e2e` | `tests/e2e/` — testcontainers install tests (needs Docker + `RUN_E2E_TESTS=true`) |
| `bun run test:ci` | `bats tests/ci/verify.bats` — post-install verification in CI environments |
| `RUN_BEHAVIORAL_TESTS=true bun test tests/behavioral/system.test.ts` | Live Claude Code system tests (needs `claude` on PATH, uses Max subscription) |

## Key Files

| File | Description |
|------|-------------|
| `ci/verify.bats` | Post-install bats assertions: `jq`, `settings.json` (>= 40 deny rules), 6 executable hooks, `~/.tmux.conf`, `~/.config/starship.toml`, shell rc marker, backup manifest |
| `e2e/containers.test.ts` | Spawns ubuntu container from `containers/ubuntu.Dockerfile`, runs `bun run bin/setup.ts --non-interactive --tier primordial`, asserts settings/hooks present, and re-runs to prove idempotency |
| `behavioral/system.test.ts` | Sends prompts to `claude -p` with `--output-format json` / `stream-json`, asserts hook enforcement, tool selection, CLAUDE.md principle adherence (AI-evaluated), and MCP server awareness |
| `fixtures/` | Static JSON inputs reused across tests (`hook-stdin-*.json` feed into hook scripts via stdin; `settings-existing.json` seeds merge tests) |

## Subdirectories

Each subdirectory has its own `AGENTS.md` with the detailed contract for that test type.

| Directory | Purpose | Gated by |
|-----------|---------|----------|
| `unit/` | Pure unit tests for `src/utils.ts`, `src/detect.ts`, `src/backup.ts`, `src/verify.ts` — all filesystem work happens in `mkdtemp` temp dirs | always runs |
| `integration/` | Spawns the real CLI (`bin/setup.ts`) via `Bun.$`, validates shipped configs, and pipes fixtures through hook scripts — no container | `jq` must be available for hook specs |
| `e2e/` | Full installer runs inside Docker containers (`containers/ubuntu.Dockerfile`, `fedora.Dockerfile`, `arch.Dockerfile`) with scenario YAMLs in `scenarios/` | Docker running AND `RUN_E2E_TESTS=true` |
| `behavioral/` | Black-box checks against the installed Claude Code v12 system using `claude -p` — hook enforcement, tool selection, principle adherence (AI-evaluated via a second `claude --bare -p` judge) | `claude` on PATH AND `RUN_BEHAVIORAL_TESTS=true` |
| `ci/` | Bats (Bash Automated Testing System) post-install assertions driven by `bun run test:ci` | `bats` on PATH (CI) |
| `scenarios/` | End-to-end-ish scenario specs: `primordial.test.ts` mocks `installBinary`/`getConfigsDir` and exercises the full `installPrimordial` flow against a temp `$HOME`; `cli-flows.test.ts` walks CLI argument matrices | always runs |
| `fixtures/` | Hand-authored inputs: hook stdin JSON payloads (`hook-stdin-bash.json`, `hook-stdin-bash-destructive.json`, `hook-stdin-bash-secrets.json`, `hook-stdin-edit.json`), `settings-existing.json` for merge tests | N/A (data only) |

## For AI Agents

### Where New Tests Go

1. **New pure function in `src/`?** Add a `describe` block to the matching file under `tests/unit/` (e.g., `src/utils.ts` -> `tests/unit/utils.test.ts`). No new file unless the unit has no home.
2. **New component installer (`src/components/*`)?** Add a scenario under `tests/scenarios/` that drives the component against a `mkdtemp` home and verifies idempotency (run twice, assert no duplication).
3. **New CLI flag or subcommand?** Extend `tests/integration/cli.test.ts` with a `Bun.$` spawn against `bin/setup.ts`.
4. **New hook script?** Add fixtures under `tests/fixtures/hook-stdin-*.json`, a piped spec under `tests/integration/hooks.test.ts`, and an executable/permission check under `tests/ci/verify.bats`.
5. **New distro support?** Drop a `containers/<distro>.Dockerfile` and a `scenarios/<distro>-primordial.yaml`, then parametrize `tests/e2e/containers.test.ts`.
6. **New `verify()` branch in `src/verify.ts`?** Cover it in `tests/unit/verify.test.ts` and reflect the post-install guarantee in `tests/ci/verify.bats`.

### Hard Rules

1. **Never touch the real `~/.claude/`.** Use `mkdtemp(join(tmpdir(), "code-tools-..."))` and override `env.homeDir` / `env.claudeDir` on a `DetectedEnvironment` stub. See `tests/scenarios/primordial.test.ts` for the `mockEnv` pattern.
2. **No real package-manager calls.** `tests/scenarios/primordial.test.ts` uses `mock.module("../../src/utils.js", ...)` to replace `installBinary` with an `already-installed` stub. Copy that pattern — never let `apt`/`brew`/`curl|sh` run from a test.
3. **Idempotency is tested, not assumed.** Any installer spec must run the install twice and assert no duplicate shell-rc blocks, no duplicate `permissions.deny` entries, and preserved user-authored content (e.g., `tasks/lessons.md` must never be overwritten).
4. **Gate slow/external tests with `describe.skipIf`.**
   - Container suite: `describe.skipIf(!hasDocker || !runE2E)` (env var `RUN_E2E_TESTS=true`).
   - Behavioral suite: `describe.skipIf(!claudeAvailable || process.env.RUN_BEHAVIORAL_TESTS !== "true")`.
   - Hook specs that shell out to `jq`: `describe.skipIf(!jqAvailable)`.
5. **Behavioral tests use the Claude Max subscription, not an API key.** Invoke `claude -p "..." --output-format json` via `Bun.spawnSync`. Do not import `@anthropic-ai/sdk` or read `ANTHROPIC_API_KEY` from these tests.
6. **Clean up in `afterEach`.** `rm(tmpDir, { recursive: true, force: true })`. Scenario specs that create real backups in `~/.claude-backup/` must push the created paths onto a cleanup list (see `createdBackupDirs` in `primordial.test.ts`).
7. **Use `Bun.$` (not raw `exec`/`spawn`)** for shelling out wherever possible; `Bun.spawn`/`Bun.spawnSync` are acceptable when you need exit codes or stdin piping.
8. **Never commit broken fixtures.** `tests/fixtures/*.json` must be valid JSON that real hooks can parse; the integration suite pipes them through the hook scripts verbatim.

### Running a Focused Subset

```bash
# One file
bun test tests/unit/utils.test.ts

# One describe (pattern match)
bun test --test-name-pattern "mergeJsonFile"

# Unit + integration only (fast developer loop)
bun run test:unit && bun run test:integration

# Container e2e (requires Docker running)
RUN_E2E_TESTS=true bun run test:e2e

# Behavioral (requires claude CLI and Max subscription)
RUN_BEHAVIORAL_TESTS=true bun test tests/behavioral/system.test.ts

# CI post-install bats
bun run test:ci
```

### Writer vs Reviewer

Consistent with the root `AGENTS.md`: author new tests here, then hand the approval pass to `code-reviewer` or `verifier` in a separate lane. Do not self-approve test coverage claims in the same context that wrote them.

## Dependencies

### Runtime (devDependencies)

| Package | Role |
|---------|------|
| `bun:test` | Built-in Bun test runner (`describe`, `test`, `expect`, `beforeEach`, `afterEach`, `mock.module`, `describe.skipIf`) |
| `testcontainers` `^10.0` | Spawns Docker containers for `tests/e2e/containers.test.ts` via `GenericContainer.fromDockerfile()` |
| `@gmrchk/cli-testing-library` `^0.1.2` | Interactive CLI testing helper — available for prompt-driven flow tests |
| `@types/bun` | Types for `Bun.$`, `Bun.file`, `Bun.spawn`, `Bun.spawnSync`, `Bun.which` used across the suite |

### External (must be on PATH for full coverage)

| Tool | Required by | Install |
|------|-------------|---------|
| `docker` | `tests/e2e/containers.test.ts` | System package manager |
| `jq` | `tests/integration/hooks.test.ts`, `tests/behavioral/hooks.test.ts`, `tests/ci/verify.bats` | `bootstrap.sh` installs; brew/apt/pacman/dnf |
| `bats` | `tests/ci/verify.bats` (`bun run test:ci`) | System package manager (CI image) |
| `claude` | `tests/behavioral/system.test.ts` | `bootstrap.sh` installs Claude Code |
| `shellcheck` | `bun run lint:hooks` (not in this tree, but paired) | System package manager |

### Env Vars

| Variable | Effect |
|----------|--------|
| `RUN_E2E_TESTS=true` | Enables `tests/e2e/containers.test.ts` (also requires `docker info` to succeed) |
| `RUN_BEHAVIORAL_TESTS=true` | Enables `tests/behavioral/system.test.ts` (also requires `claude` on PATH) |
| `HOME` | Read by `src/backup.ts` at module load — scenario tests that exercise `createBackup` land manifests in the real `~/.claude-backup/` and must clean up |

<!-- MANUAL: -->
