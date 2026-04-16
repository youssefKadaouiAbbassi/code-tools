<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# .github/workflows/

## Purpose

GitHub Actions workflow definitions that drive CI/CD for `code-tools`. Every push and pull request to `master` triggers the test matrix defined here: TypeScript unit/integration tests, shellcheck linting, containerized e2e tests, and BATS post-install verification on Ubuntu and macOS. These workflows are the **gate** that enforces the hard rules in the parent `AGENTS.md` (idempotency, shellcheck-clean hooks, passing test suite) before anything merges.

## Key Files

| File | Purpose |
|------|---------|
| `test.yml` | Primary CI pipeline — 5 jobs: `unit`, `lint-hooks`, `e2e-ubuntu`, `bats-ubuntu`, `bats-macos` |

### Job Breakdown (`test.yml`)

| Job | Runner | Trigger | What It Does |
|-----|--------|---------|--------------|
| `unit` | `ubuntu-latest` | every push/PR | `bun install` → `bun test tests/unit` → `bun test tests/integration` |
| `lint-hooks` | `ubuntu-latest` | every push/PR | `shellcheck configs/hooks/*.sh configs/project-claude/hooks/*.sh bootstrap.sh` |
| `e2e-ubuntu` | `ubuntu-latest` | after `unit` | `bun test tests/e2e` (15 min timeout) |
| `bats-ubuntu` | `ubuntu-latest` | after `unit` | Run installer at `--tier primordial`, then `bats tests/ci/verify.bats` |
| `bats-macos` | `macos-14` | master branch only, after `unit` | Same as `bats-ubuntu` but via Homebrew |

Triggers: `push` to `master`, `pull_request` targeting `master`. macOS job is gated on `github.ref == 'refs/heads/master'` to save minutes on PRs.

## For AI Agents

### Working In This Directory

- **Match the existing job style.** Use `actions/checkout@v4` and `oven-sh/setup-bun@v2` with `bun-version: latest`. Do not introduce `actions/setup-node` — the project is Bun-only.
- **Keep jobs reproducible.** Use `bun install` (respects `bun.lock`), never `bun install --no-save`. Pin third-party actions by major version tag (`@v4`, `@v2`).
- **Respect job dependencies.** `e2e-ubuntu` and `bats-*` jobs have `needs: [unit]` so the cheap suite gates the expensive ones. Preserve that ordering when adding jobs.
- **Shellcheck is a blocking gate.** Any new `.sh` under `configs/hooks/`, `configs/project-claude/hooks/`, or at repo root (like `bootstrap.sh`) must be added to the `lint-hooks` job and pass cleanly. See parent `AGENTS.md` Hard Rule #4.
- **BATS verification is the truth source for installer correctness.** Every new primordial component must have a matching assertion in `tests/ci/verify.bats` — both BATS jobs run it.
- **Installer runs non-interactively in CI.** Use `--non-interactive --tier primordial` (or another explicit tier). Never rely on prompts.
- **OS matrix is intentional.** Ubuntu covers apt paths; macOS-14 covers brew paths. Do not drop macOS without updating `installBinary()` coverage in `src/utils.ts`.

### Adding a New Workflow

1. Create `.github/workflows/<name>.yml` with an explicit `name:` and narrow `on:` triggers.
2. Reuse the `oven-sh/setup-bun@v2` + `bun install` prelude.
3. Set a `timeout-minutes:` for any job that shells out to containers, brew, or apt.
4. Use `needs:` to gate expensive jobs behind cheap ones.
5. Prefer `if: github.ref == 'refs/heads/master'` to skip non-master spending on premium runners (macOS, large).

### Publish Pipeline

A publish/release workflow is **not yet present**. When adding one:

- Trigger on tag push (`v*.*.*`) or manual `workflow_dispatch`.
- Require `unit`, `lint-hooks`, and at least one BATS job to succeed first.
- Use `NPM_TOKEN` from repo secrets; never commit tokens.
- Run `bun run build:npm` before `npm publish --access public`.

### Do Not

- Do not add `continue-on-error: true` to mask failing tests — fix the test instead.
- Do not cache `~/.bun` manually; `oven-sh/setup-bun@v2` handles it.
- Do not run the installer against the runner's real `~/.claude/` outside the BATS job — use `testcontainers` in e2e.
- Do not use `pull_request_target` — it exposes secrets to forks.

## Dependencies

### GitHub Actions

| Action | Version | Role |
|--------|---------|------|
| `actions/checkout` | `@v4` | Clone the repository into the runner |
| `oven-sh/setup-bun` | `@v2` | Install Bun (`latest`) and cache the toolchain |

### Runners

| Runner | Used By | Notes |
|--------|---------|-------|
| `ubuntu-latest` | `unit`, `lint-hooks`, `e2e-ubuntu`, `bats-ubuntu` | Standard GitHub-hosted Linux runner |
| `macos-14` | `bats-macos` | Apple Silicon runner; master-only for cost control |

### Tools Installed During Jobs

| Tool | Installed By | Used In |
|------|--------------|---------|
| `shellcheck` | `apt-get` | `lint-hooks` — validates all hook scripts |
| `bats` | `apt-get` (Ubuntu) / `brew` (macOS) | `bats-ubuntu`, `bats-macos` — runs `tests/ci/verify.bats` |
| `jq` | `apt-get` (Ubuntu) / `brew` (macOS) | `bats-*` — required by hook scripts under test |

### Repository Scripts Invoked

| Command | Invoked By |
|---------|-----------|
| `bun test tests/unit` | `unit` |
| `bun test tests/integration` | `unit` |
| `bun test tests/e2e` | `e2e-ubuntu` |
| `bun run bin/setup.ts --non-interactive --tier primordial` | `bats-ubuntu`, `bats-macos` |
| `bats tests/ci/verify.bats` | `bats-ubuntu`, `bats-macos` |

<!-- MANUAL: -->
