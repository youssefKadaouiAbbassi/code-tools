<!-- Generated: 2026-04-14 | Updated: 2026-04-14 -->

# .github/

## Purpose

CI/CD workflows and GitHub automation for the `code-tools` installer. This directory holds every pipeline that runs on `push` and `pull_request` against `master` — unit, integration, e2e, hook linting, and post-install BATS verification across Ubuntu and macOS runners.

Parent: [`../AGENTS.md`](../AGENTS.md).

## Key Files

| File | Description |
|------|-------------|
| `workflows/test.yml` | Single test pipeline with 6 jobs — `typecheck`, `unit`, `lint-hooks`, `e2e-ubuntu`, `bats-ubuntu`, `bats-macos`. Triggers on push/PR to `master`. Pins `ubuntu-24.04` and `BUN_VERSION` env var; declares `permissions: contents: read` and concurrency cancel. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `workflows/` | GitHub Actions workflow definitions. Each `.yml` file here becomes a distinct workflow in the GitHub Actions UI. |

## Workflow Jobs (`workflows/test.yml`)

| Job | Runner | Depends on | What it does |
|-----|--------|------------|--------------|
| `typecheck` | `ubuntu-24.04` | — | `bun install --frozen-lockfile` then `bun tsc --noEmit`. |
| `unit` | `ubuntu-24.04` | — | `bun install --frozen-lockfile` then `bun test tests/unit` and `bun test tests/integration`. |
| `lint-hooks` | `ubuntu-24.04` | — | Installs `shellcheck` via apt and runs it against `configs/hooks/*.sh`, `configs/project-claude/hooks/*.sh`, and `bootstrap.sh`. |
| `e2e-ubuntu` | `ubuntu-24.04` | `unit` | `bun test tests/e2e` with a 15-minute timeout (testcontainers). |
| `bats-ubuntu` | `ubuntu-24.04` | `unit` | Runs the installer with `--non-interactive --tier primordial`, then executes `bats tests/ci/verify.bats`. |
| `bats-macos` | `macos-14` | `unit` | Same as `bats-ubuntu` but on macOS. Gated to `master` pushes only (`if: github.ref == 'refs/heads/master'`) to conserve macOS minutes. |

## For AI Agents

### Working With Workflows

- **Keep the single-file convention.** All jobs live in `workflows/test.yml`. Do not split into multiple workflow files without a concrete reason (matrix complexity, unrelated schedules, etc.) — one file is easier to reason about.
- **Pin actions by major version.** Current pins: `actions/checkout@v4`, `oven-sh/setup-bun@v2`. When adding new actions, pin to `@vN` (not `@latest`, not a floating `main`).
- **Bun version is pinned via `BUN_VERSION` env var** (currently `1.3.11`). Update the env var in one place when bumping; all jobs consume it. `bootstrap.sh` installs `bun-install-latest` for end-users — CI uses a pinned version for reproducibility.
- **Respect job dependencies.** `e2e` and `bats` jobs `needs: [unit]` so fast unit failures short-circuit the slower lanes. Preserve this ordering when adding jobs.
- **macOS runs are gated to `master`.** `bats-macos` uses `if: github.ref == 'refs/heads/master'` — PRs do not consume macOS minutes. Do not remove this guard without approval.
- **Install system tools inside the job.** `shellcheck`, `bats`, and `jq` are installed step-by-step (`apt-get`/`brew`) rather than via third-party setup actions — keeps the supply chain small.

### Adding a New Job

1. Add the job under `jobs:` in `workflows/test.yml`.
2. Start with `actions/checkout@v4` and `oven-sh/setup-bun@v2`.
3. Declare `needs: [unit]` if the job is slow or depends on build artefacts.
4. Add a `timeout-minutes` cap for any job that exercises containers or network installs (see `e2e-ubuntu` = 15).
5. Update the job table above.

### Hard Rules

1. **No secrets in workflows yet.** The repo has no publish pipeline in `.github/` today. When one is added (`publish.yml` for npm), use `secrets.NPM_TOKEN` from repo settings — never commit tokens.
2. **Never skip hooks.** Do not add `--no-verify` to any `git` step inside a workflow.
3. **Do not run `bun test` without narrowing.** The installer's default `bun test` includes e2e tests that need containers; CI invokes suites explicitly (`tests/unit`, `tests/integration`, `tests/e2e`) to keep lanes independent.
4. **Verify shellcheck-clean on every hook change.** The `lint-hooks` job is the gate for `configs/hooks/*.sh` — do not silence warnings with `# shellcheck disable=` without a justifying comment.
5. **Keep BATS verification authoritative.** `tests/ci/verify.bats` is the post-install contract. New primordial components must add a BATS assertion before merge.

### Writer vs Reviewer

Per Principle 7 in the root `AGENTS.md`: author workflow changes in this lane, then hand the green-CI verdict to `code-reviewer` or `verifier` in a separate pass. Do not self-approve a workflow change in the same context that wrote it.

## Dependencies

### GitHub Actions

| Action | Version | Role |
|--------|---------|------|
| `actions/checkout` | `v4` | Clone the repo into the runner. |
| `oven-sh/setup-bun` | `v2` | Install Bun (`bun-version: latest`). |

### Runner Tooling (installed in-job)

| Tool | Source | Used by |
|------|--------|---------|
| `shellcheck` | `apt-get` | `lint-hooks` |
| `bats` | `apt-get` (Ubuntu) / `brew` (macOS) | `bats-ubuntu`, `bats-macos` |
| `jq` | `apt-get` / `brew` | `bats-ubuntu`, `bats-macos` (required by installed hook scripts) |

### Runner Images

- `ubuntu-latest` — default for unit, lint, e2e, and Linux BATS.
- `macos-14` — Apple Silicon runner for macOS BATS verification.

<!-- MANUAL: -->
