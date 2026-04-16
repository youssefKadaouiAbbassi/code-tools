<!-- Generated: 2026-04-14 | Updated: 2026-04-14 -->

# tests/ci

Parent: [`../AGENTS.md`](../AGENTS.md)

## Purpose

Post-install verification suite driven by **Bats** (Bash Automated Testing System). This directory holds CI-specific shell-level assertions that run against a **real installed system** — not a mock. They answer one question: "after the installer ran, does the machine actually look right?"

These tests are the authoritative post-install contract. They run in GitHub Actions via the `bats-ubuntu` and `bats-macos` jobs (see `.github/workflows/test.yml`) and locally via `bun run test:ci`.

## Key Files

| File | Description |
|------|-------------|
| `verify.bats` | 10 Bats assertions validating the primordial install: `jq` present, `~/.claude/settings.json` exists with >= 40 deny rules, `~/.claude/CLAUDE.md` present, 6 hook scripts executable (`pre-destructive-blocker`, `pre-secrets-guard`, `post-lint-gate`, `session-start`, `session-end`, `stop-summary`), `~/.tmux.conf` deployed, `~/.config/starship.toml` deployed, shell rc contains `# code-tools-managed` marker, `~/.claude-backup/` exists, backup has `manifest.json` |

## Running

```bash
# From repo root — runs the bats suite exactly as CI does
bun run test:ci

# Equivalent raw command
bats tests/ci/verify.bats
```

`bats` is **not** installed by `bun install`. Install it separately:

```bash
# Ubuntu / Debian
sudo apt-get install -y bats jq

# macOS
brew install bats-core jq
```

CI workflow (`.github/workflows/test.yml`) runs:

1. The installer non-interactively (`--non-interactive --tier primordial`).
2. `bats tests/ci/verify.bats` against the resulting `~/.claude/` state.

## For AI Agents

### When To Modify `verify.bats`

Add a new `@test` block whenever you:

1. **Add a primordial component** — every file the installer guarantees to deploy must have a corresponding bats assertion.
2. **Add a new hook script** — extend the loop in the "all 6 hooks are executable" test (and rename the test to reflect the new count).
3. **Change the `settings.json` deny-rule floor** — update the `[ "$count" -ge 40 ]` threshold.
4. **Add a new shell rc marker or config file** — add an explicit existence check.

### Rules

- **Bats tests run against `~/` of the CI runner.** Never assume developer machine state — CI starts from a clean home directory after the installer runs.
- **Assertions must be idempotent and order-independent.** Bats runs each `@test` in isolation; do not rely on side effects from prior tests.
- **Check existence before content.** Pattern: `[ -f path ]` before `jq` / `grep` against the file, so a missing file fails with a clear message instead of a tool error.
- **Prefer POSIX-portable shell.** The same `verify.bats` runs on Ubuntu (`bash`) and macOS (`bash 3.2`). No `mapfile`, no `[[ =~ ]]` without care, no `${var,,}`.
- **Never modify `~/.claude/**` from a bats test.** This suite is read-only verification — mutations belong in integration/e2e suites.
- **Match the installer's verify.ts branches.** Every new case in `src/verify.ts` must have a mirrored assertion here — the bats suite is the external ground truth against the TypeScript `verify()` logic.

### Writer vs Reviewer

Per Principle 7: author bats changes here, then hand the approval pass to `code-reviewer` or `verifier` in a separate lane. Do not self-approve.

## Dependencies

### Runtime (host system)

| Tool | Role | Install |
|------|------|---------|
| `bats` | Test runner (Bash Automated Testing System) | `apt-get install bats` / `brew install bats-core` |
| `jq` | JSON assertions against `settings.json` | `apt-get install jq` / `brew install jq` |
| `bash` | Test shell | System default |
| `grep` | Shell rc marker detection | System default |

### Expected State (created by installer before bats runs)

| Path | Created by |
|------|-----------|
| `~/.claude/settings.json` | `src/primordial.ts` |
| `~/.claude/CLAUDE.md` | `src/primordial.ts` |
| `~/.claude/hooks/*.sh` | `src/primordial.ts` (6 scripts from `configs/hooks/`) |
| `~/.tmux.conf` | `src/primordial.ts` |
| `~/.config/starship.toml` | `src/primordial.ts` |
| `~/.zshrc` or `~/.bashrc` (marker line) | `src/primordial.ts` |
| `~/.claude-backup/{timestamp}/manifest.json` | `src/backup.ts` |

<!-- MANUAL: -->
