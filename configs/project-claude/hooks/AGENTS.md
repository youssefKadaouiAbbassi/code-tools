<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# configs/project-claude/hooks/

## Purpose

Project-scope Claude Code **hook script templates** — the post-edit lint advisory and post-build auto-test pair that `src/primordial.ts` deploys into a target repository's `.claude/hooks/` directory. Each script reads the standard Claude Code hook JSON envelope from stdin and emits exactly one JSON decision on stdout.

Where `configs/hooks/` ships the **user-scope** enforcement layer (destructive blocker, secrets guard, session lifecycle), this directory ships the **project-scope** observability layer: every hook here is **advisory only** and bounded to files inside the current git worktree. Project hooks never block; they surface results to stderr and always emit `{"decision":"allow"}`.

These are templates — the installer copies them verbatim onto the target machine; the Claude Code process there runs them.

## Key Files

| File | Hook Event | Role | Blocking? |
|------|------------|------|-----------|
| `post-edit-lint.sh` | `PostToolUse` (Write\|Edit\|MultiEdit) | Resolves the edited file via `realpath`, scopes it to `git rev-parse --show-toplevel`, then dispatches by extension: `tsc --noEmit --skipLibCheck` + `eslint` (ts/tsx), `eslint` (js/jsx/mjs/cjs), `ruff check` + `mypy --ignore-missing-imports` (py), `cargo clippy -- -D warnings` (rs, walks up to find `Cargo.toml`), `golangci-lint` or `go vet` fallback (go), `shellcheck` (sh/bash). Missing tools probed via `command -v` and skipped silently | No (advisory to stderr) |
| `post-bash-test.sh` | `PostToolUse` (Bash) | `grep -qF`-matches the executed command against a build-command allow-list (`npm run build`, `yarn build`, `bun run build`, `cargo build`/`compile`, `go build`, `make build`/`all`/`compile`, `tsc`, `just build`/`compile`, `mvn compile`/`package`, `gradle build`/`assemble`). On match, auto-runs the first detected test runner: `just test` → `{bun\|yarn\|npm} test --passWithNoTests` → `cargo test` → `go test ./...` → `make test`. Test output streamed to stderr | No (advisory) |

## Hook Contract

Both scripts follow the shared Claude Code hook protocol — preserve it when adding new project hooks.

**Input (stdin):** a single JSON object containing at minimum `tool_name` and `tool_input`. Both scripts parse it with `jq -r`.

**Output (stdout):** exactly one JSON line — always `{"decision":"allow"}` for project-scope hooks. Every code path (early exit, scope rejection, success, failure) must emit this line before exiting; a forgotten `printf` breaks the Claude Code hook handler.

**Advisory output:** write to stderr. Lint findings, build/test logs, and pass/fail summaries surface to the user there without blocking the tool call.

**Exit code:** `0` on success. `set -euo pipefail` is the baseline.

**Scope guard:** any file-targeted hook MUST resolve the absolute path and reject anything outside `git rev-parse --show-toplevel` (or `pwd` fallback when not in a repo) before doing work. `post-edit-lint.sh` is the reference implementation — copy its `case "$file_path" in "$project_root"/*) ;; *) printf '{"decision":"allow"}\n'; exit 0 ;; esac` block.

## For AI Agents

### Working With These Scripts

- **Document and analyze freely; do not silently rewrite.** Per parent rule and the root `AGENTS.md` writer/reviewer separation, hook content changes go through `code-reviewer` in a separate pass.
- **Read the full script before adding a language branch.** Match the existing `advisory_lint` helper signature (`tool` then args; `command -v` probe; capture status; print to stderr on non-zero) — do not invent a new logging convention.
- **Project hooks are advisory by contract.** Never emit `{"decision":"block"}` from this directory — blocking is the user-scope `pre-destructive-blocker.sh` / `pre-secrets-guard.sh` job. If a project pattern truly needs to block, raise it with the user-scope hook owner.
- **Always emit the final JSON line.** Both scripts have multiple `exit 0` paths; each one is preceded by `printf '{"decision":"allow"}\n'`. Preserve this on every new branch.
- **Use `printf`, not `echo`.** Both scripts use `printf` exclusively — stay consistent for deterministic newline handling.
- **Keep `set -euo pipefail`.** Removing it lets malformed `jq` output silently cascade.
- **Honour the worktree scope.** `post-edit-lint.sh` rejects paths outside the project root; replicate the `realpath` + `case` guard in any new file-targeted hook.
- **Prefer `command -v` probes over hard requires.** Optional linters must degrade silently — a missing `mypy` is not a hook failure.
- **Build-pattern matching is `grep -qF` (literal).** `post-bash-test.sh` deliberately avoids regex to keep the allow-list auditable. Add new build commands as plain literal strings to the `build_patterns` array.
- **Test runner detection is ordered.** `post-bash-test.sh` short-circuits at the first match: `justfile` → `package.json` → `Cargo.toml` → `go.mod` → `Makefile`. Insert new runners with awareness of the precedence.

### Testing

No dedicated harness in this directory — use the repo-wide pattern from `tests/ci/`:

```bash
# Allow case (file outside worktree → skipped)
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/outside.ts"}}' \
  | bash configs/project-claude/hooks/post-edit-lint.sh
# -> {"decision":"allow"}

# Non-build Bash command → no auto-test
echo '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}' \
  | bash configs/project-claude/hooks/post-bash-test.sh
# -> {"decision":"allow"}

# Build command → triggers detected test runner (writes to stderr)
echo '{"tool_name":"Bash","tool_input":{"command":"bun run build"}}' \
  | bash configs/project-claude/hooks/post-bash-test.sh

# Syntax check both hooks
for f in configs/project-claude/hooks/*.sh; do bash -n "$f" && echo "OK: $f"; done
```

Before committing hook changes run `bun run lint:hooks` from the repo root — the parent `configs/project-claude/AGENTS.md` lists shellcheck-clean as a hard requirement and CI enforces it against `configs/project-claude/hooks/*.sh`.

### Installer Integration

- `src/primordial.ts` copies these files into `<project>/.claude/hooks/` during installer runs and registers them in the project `settings.json` under `hooks.PostToolUse`.
- The installer must preserve executable bits (`chmod +x`) — Claude Code invokes hooks by path, not via `bash` prefix, so non-executable scripts fail with `EACCES`.
- Template path resolution uses `new URL("../../configs/project-claude/hooks", import.meta.url).pathname` — works from source, bunx cache, and compiled binary alike (root `AGENTS.md` rule 7).
- The installer never overwrites a project's existing `.claude/hooks/` files without first writing them to `~/.claude-backup/{timestamp}/` via `src/backup.ts`.

## Dependencies

### Runtime (on the target machine)

| Tool | Required by | Notes |
|------|-------------|-------|
| `bash` >= 4 | both scripts | Standard `case`, `[[`, parameter expansion |
| `jq` | both scripts | Parses hook JSON from stdin (`tool_name`, `tool_input.file_path`, `tool_input.command`). `bootstrap.sh` installs if missing |
| `git` | both scripts | `git rev-parse --show-toplevel` for worktree scoping; falls back to `pwd` outside a repo |
| `realpath`, `dirname`, `grep` | `post-edit-lint.sh` | coreutils — `realpath` resolves edit targets, `grep -qF` matches build patterns |
| `npx`, `tsc`, `eslint` | `post-edit-lint.sh` (ts/tsx, js/jsx/mjs/cjs) | Optional — probed with `command -v` |
| `ruff`, `mypy` | `post-edit-lint.sh` (py) | Optional |
| `cargo` (with `clippy`) | `post-edit-lint.sh` (rs) | Optional — walks parents until `Cargo.toml` is found |
| `golangci-lint` or `go` | `post-edit-lint.sh` (go) | Optional — `golangci-lint` preferred; falls back to `go vet ./pkg/...` |
| `shellcheck` | `post-edit-lint.sh` (sh/bash) | Optional |
| `just`, `bun`, `yarn`, `npm`, `cargo`, `go`, `make`, `mvn`, `gradle` | `post-bash-test.sh` (auto-detected) | Optional — first matching runner wins |

### Dev (in this repo)

| Tool | Role |
|------|------|
| `shellcheck` | `bun run lint:hooks` gate — scripts must be shellcheck-clean |
| `bats` | `tests/ci/verify.bats` — covers project-hook block/allow contract alongside user-scope hooks |
| `bun test` | Integration suite that installs project hooks into a `testcontainers` image and asserts advisory output |

### Claude Code Hook System

- Hook events consumed: `PostToolUse(Write\|Edit\|MultiEdit)` (lint), `PostToolUse(Bash)` (auto-test).
- `PostToolUse` decisions are ignored by Claude Code, but the convention here is to still emit `{"decision":"allow"}` for uniformity with the user-scope hooks and to stay schema-valid.
- Project-scope hooks run **after** user-scope hooks — destructive-blocker / secrets-guard have already gated the call by the time these scripts see the envelope.

### Consumed By

- **`src/primordial.ts`** — copies this tree to `<project>/.claude/hooks/` during installer runs, registers entries in project `settings.json`, sets executable bits.
- **`src/verify.ts`** — post-install verification asserts both files are present, executable, and emit the JSON contract on a synthetic stdin.
- **`src/backup.ts`** — backs up any pre-existing `.claude/hooks/*.sh` to `~/.claude-backup/{timestamp}/` before overwrite.

### External References

- Parent: `../AGENTS.md` (configs/project-claude/) — project-scope template tier, deny-list layering, settings.local.json contract
- Sibling: `../../hooks/AGENTS.md` (configs/hooks/) — user-scope hook contract, blocking gates, secrets-guard
- Grandparent: `../../AGENTS.md` (configs/) — directory tier table, install flow, backup policy
- Claude Code hook protocol — `PostToolUse(Bash|Write|Edit|MultiEdit)` stdin JSON shape, stdout decision schema

<!-- MANUAL: -->
