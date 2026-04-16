<!-- Generated: 2026-04-14 | Updated: 2026-04-14 -->
<!-- Parent: ../AGENTS.md -->

# configs/hooks

## Purpose

Claude Code **hook script templates** — the enforcement and observability layer that `src/primordial.ts` deploys to `~/.claude/hooks/` (and/or the project's `.claude/hooks/`). Each script reads Claude Code's hook JSON from stdin and emits a JSON decision on stdout, acting as a blocking gate (PreToolUse), advisory notifier (PostToolUse / Stop), or session-lifecycle logger (SessionStart / SessionEnd).

These are **templates** — they are copied verbatim onto the target system by the installer, not imported or executed from this directory at installer runtime. The installer only reads these files; the Claude Code process on the target machine runs them.

## Key Files

| File | Hook Event | Role | Blocking? |
|------|------------|------|-----------|
| `pre-destructive-blocker.sh` | `PreToolUse` (Bash) | Pattern-matches destructive shell commands (`rm -rf /`, `git push --force`, `DROP TABLE`, `terraform destroy`, fork bombs, `curl \| sh`, etc.) and emits `{"decision":"block"}` with a reason | **Yes** |
| `pre-secrets-guard.sh` | `PreToolUse` (any tool) | Regex-scans the serialized `tool_input` for credentials — AWS keys (`AKIA…`), GitHub PATs (`ghp_…`), Stripe (`sk_live_…`), Anthropic (`sk-ant-…`), OpenAI, Slack, JWTs, PEM/OpenSSH keys, DB connection strings with embedded passwords, `.env` reads | **Yes** |
| `post-lint-gate.sh` | `PostToolUse` (Write/Edit/MultiEdit) | Dispatches to the language-appropriate linter by file extension — `eslint` (ts/js), `ruff` (py), `cargo clippy` (rs), `golangci-lint`/`go vet` (go), `shellcheck` (sh). Prints findings to stderr | No (advisory) |
| `session-start.sh` | `SessionStart` | Prints date, repo, branch, and the first 10 lines of `tasks/lessons.md` so the session opens with project context loaded | No |
| `session-end.sh` | `SessionEnd` | Appends a YAML-delimited entry (timestamp, `session_id`, repo, branch, `stop_hook_active`) to `~/.claude/session-logs/{YYYY-MM-DD}.log` | No |
| `stop-summary.sh` | `Stop` | Scans files modified in the last 5 minutes for debug leftovers (`console.log`, `debugger;`, `TODO`, `FIXME`, `pdb.set_trace`, `binding.pry`, stray `print(`) and prints an advisory to stderr | No (advisory) |

## Hook Contract

Every script in this directory follows the same I/O contract — do not deviate when adding new hooks.

**Input (stdin):** a single JSON object from Claude Code containing at minimum `tool_name`, `tool_input`, `session_id`, `stop_hook_active`.

**Output (stdout):** exactly one JSON line. Valid shapes:
- `{"decision":"allow"}` — proceed normally
- `{"decision":"block","reason":"<human-readable message>"}` — PreToolUse only; aborts the tool call

**Advisory output:** write to stderr — it surfaces to the user as a notification without blocking the tool call.

**Exit code:** `0` on success. `set -euo pipefail` is the baseline; any uncaught non-zero exit is treated as a hook failure by Claude Code.

## For AI Agents

### Working With These Scripts

- **Analysis is allowed; do not rewrite these scripts in this task.** The parent `configs/AGENTS.md` and repository guidance treat hook content as security-critical — the writer agent documents them; security/review agents modify them in a separate pass.
- **Read before editing.** If asked to add a pattern, read the full script first to match the existing `check_pattern` / `check_secret` helper style and regex conventions.
- **Preserve the JSON contract.** Every code path must terminate with exactly one `{"decision":"…"}` line on stdout. Early `exit 0` paths that forget to print break the Claude Code hook handler.
- **Use `printf`, not `echo`.** Every existing script uses `printf` for determinism — stay consistent.
- **Keep `set -euo pipefail`.** Remove it and malformed JSON from `jq` will silently pass through.
- **Patterns are shell regex, not PCRE.** `grep -qE` is BRE-with-`-E` extensions. No lookaheads, no `\d`, no `\s` on all platforms — use `[[:space:]]` and `[[:digit:]]` as the existing scripts do.
- **Case matters.** `pre-destructive-blocker.sh` uses `check_pattern_i` (case-insensitive) for SQL keywords and `check_pattern` (case-sensitive) for everything else. Pick deliberately.
- **Pre hooks are cheap, Stop hooks scan disk.** `stop-summary.sh` walks the working tree with `find -mmin -5`; keep any new Stop-hook work similarly bounded (time window, excluded paths).

### Testing

No dedicated test harness lives in this directory — tests are in `tests/ci/verify.bats` and `tests/integration/`. Manual smoke test pattern:

```bash
# Block case
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' \
  | bash configs/hooks/pre-destructive-blocker.sh
# -> {"decision":"block","reason":"Blocked: recursive force delete targeting root path"}

# Allow case
echo '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}' \
  | bash configs/hooks/pre-destructive-blocker.sh
# -> {"decision":"allow"}

# Syntax check all hooks
for f in configs/hooks/*.sh; do bash -n "$f" && echo "OK: $f"; done
```

Before committing hook changes, run `bun run lint:hooks` (shellcheck) from the repo root — the parent AGENTS.md lists this as a hard requirement and CI enforces it.

### Installer Integration

- `src/primordial.ts` copies these files into `${HOME}/.claude/hooks/` during the Primordial tier install and registers them in the target `settings.json` under `hooks.PreToolUse` / `hooks.PostToolUse` / `hooks.SessionStart` / `hooks.SessionEnd` / `hooks.Stop`.
- File permissions must be preserved as executable (`chmod +x`) by the install step — hooks invoked via `command` strings without `bash` prefix will otherwise fail with `EACCES`.
- Template resolution uses `new URL("../configs/hooks", import.meta.url).pathname` (see parent AGENTS.md rule 7) so paths work from source, bunx cache, and compiled binary alike.

## Dependencies

### Runtime (on the target machine)

| Tool | Required by | Notes |
|------|-------------|-------|
| `bash` >= 4 | all scripts | `mapfile` / associative arrays (`declare -A`) used in `stop-summary.sh` need 4+ |
| `jq` | all scripts | Parses hook JSON from stdin. `bootstrap.sh` installs if missing |
| `grep` (GNU or BSD with `-E`) | all `check_*` helpers | ERE syntax only |
| `find` | `stop-summary.sh` | `-mmin -5`, `-newer`, `-not -path` |
| `git` | `session-start.sh`, `session-end.sh` | Optional — scripts degrade to `"unknown"` when not in a repo |
| Optional linters | `post-lint-gate.sh` | `eslint`, `ruff`, `cargo`, `golangci-lint`/`go`, `shellcheck` — each is probed with `command -v` and skipped silently if absent |

### Dev (in this repo)

| Tool | Role |
|------|------|
| `shellcheck` | `bun run lint:hooks` gate — scripts must be shellcheck-clean |
| `bats` | `tests/ci/verify.bats` — end-to-end hook behavior tests |
| `bun test` | Integration suite that installs hooks into a `testcontainers` image and asserts block/allow decisions |

### Claude Code Hook System

- Hook events consumed: `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`, `Stop`.
- Contract reference: Claude Code writes the hook request to stdin as a single JSON object; the script must respond on stdout with a JSON decision before its configured timeout. Advisory messages go to stderr.
- Only `PreToolUse` hooks can meaningfully `block`; `PostToolUse` and `Stop` decisions are ignored by Claude Code but the convention in this repo is to still emit `{"decision":"allow"}` for uniformity.

<!-- MANUAL: -->
