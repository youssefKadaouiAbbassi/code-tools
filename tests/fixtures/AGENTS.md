<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# tests/fixtures/

## Purpose

Static, hand-authored test inputs shared across the test suite. This directory contains **mock data only** — no test logic, no executable code, no runtime dependencies. Fixtures are canonical JSON payloads that sibling suites (`tests/integration/`, `tests/unit/`, `tests/scenarios/`) pipe into hook scripts via stdin or load via `Bun.file()` to seed merge/verify tests.

All files are intentionally small (6-10 lines, 36 lines total across the directory) so diffs stay reviewable and intent stays obvious. If a fixture grows past ~30 lines, it probably belongs in a dedicated setup helper inside its consuming suite instead.

## Quick Reference

| Fixture | Consumed by | Purpose |
|---------|-------------|---------|
| `hook-stdin-bash.json` | `tests/integration/hooks.test.ts` | Benign `Bash` tool payload (`ls -la`) — asserts hooks return `allow` |
| `hook-stdin-bash-destructive.json` | `tests/integration/hooks.test.ts` | Destructive `Bash` command (`rm -rf /`) — asserts `pre-destructive-blocker.sh` returns `block` |
| `hook-stdin-bash-secrets.json` | `tests/integration/hooks.test.ts` | Bash command containing an AWS-key-shaped token — asserts `pre-secrets-guard.sh` returns `block` |
| `hook-stdin-edit.json` | `tests/integration/hooks.test.ts` | `Edit` tool payload — asserts bash-only guards ignore non-Bash tools (`allow`) |
| `settings-existing.json` | unit/scenario merge tests | Pre-existing `settings.json` shape (model, deny rules, custom `mcpServers`, custom user key) used to verify `mergeJsonFile` preserves user customisations |

## Key Files

### Hook stdin payloads

All `hook-stdin-*.json` files follow the Claude Code hook stdin contract:

```json
{
  "tool_name": "Bash" | "Edit" | ...,
  "tool_input": { /* tool-specific input schema */ }
}
```

| File | `tool_name` | Critical field |
|------|-------------|----------------|
| `hook-stdin-bash.json` | `Bash` | `tool_input.command = "ls -la"` |
| `hook-stdin-bash-destructive.json` | `Bash` | `tool_input.command = "rm -rf /"` |
| `hook-stdin-bash-secrets.json` | `Bash` | `tool_input.command` contains `AKIAIOSFODNN7EXAMPLE` (AWS key shape, non-live) |
| `hook-stdin-edit.json` | `Edit` | `tool_input.{file_path, old_string, new_string}` |

**Safety note:** the `rm -rf /` and AWS-key-shaped strings are **inert test payloads** — they are never executed, only piped to hook scripts whose job is to block them. The integration suite consumes these fixtures via `cat fixture.json \| bash hook-script.sh` and asserts the hook's `decision` field equals `block`.

### settings seed

`settings-existing.json` represents a user's pre-installed `~/.claude/settings.json` with:

- `model: "claude-haiku-4-5-20251001"` (non-default — tests that installer does not overwrite)
- `permissions.deny: ["rm -rf /", "custom-user-rule"]` (array union target)
- `mcpServers.my-custom-mcp` (per-key preserve target)
- `customUserSetting: true` (unknown-key passthrough target)

Each field exercises a distinct branch of `mergeJsonFile` in `src/utils.ts`: scalar preserve, array union, object per-key replace, and unknown-key passthrough.

## For AI Agents

### When To Add A Fixture Here

1. **Shared across 2+ suites?** Add it here. Single-use data belongs inline in the test file.
2. **Represents an external contract** (hook stdin schema, on-disk settings shape, MCP config entry)? Add it here so the contract lives in one reviewable place.
3. **Needs to survive test-run temp-dir teardown?** Yes — fixtures are read-only inputs, never mutated.

### Hard Rules

1. **Read-only.** Never write to `tests/fixtures/` from a test. Copy the file into a `mkdtemp` temp dir first, then mutate the copy.
2. **Valid JSON only.** Every `*.json` must `JSON.parse` cleanly; the integration suite pipes them through real hook scripts, and malformed JSON breaks all downstream suites simultaneously. Run `bun -e 'JSON.parse(await Bun.file("tests/fixtures/<name>.json").text())'` before committing.
3. **No secrets, no live credentials.** The AWS-key-shaped string in `hook-stdin-bash-secrets.json` is the documented AWS example key (`AKIAIOSFODNN7EXAMPLE`) — use only known-public example values from vendor docs. Never paste a real token, even a revoked one.
4. **No executable payloads.** Dangerous-looking commands (`rm -rf /`) are string literals inside stdin JSON — they are **never** written to a shell script, never chmod'd, never eval'd. If you need to test execution behaviour, mock it in `tests/scenarios/`.
5. **Schema-match real inputs.** `hook-stdin-*.json` must match the actual Claude Code hook contract — `tool_name` top-level, `tool_input` nested. If you invent a shape that real hooks never receive, your test passes against fiction.
6. **Naming convention.** `hook-stdin-<tool-lowercase>[-<variant>].json` for hook payloads. Other fixtures use `<subject>-<variant>.json` (e.g. `settings-existing.json`, `settings-empty.json`).
7. **Update consumers in the same commit.** If you rename or restructure a fixture, grep for its basename across `tests/` and update every call site in the same commit. Fixtures are a shared contract.

### Adding A New Hook Fixture

When introducing a new hook script under `configs/hooks/`, add all three of:

1. Fixture(s) here — one per decision branch (`allow` case + `block` case minimum).
2. Integration spec in `tests/integration/hooks.test.ts` that pipes each fixture into the hook and asserts the `decision` field.
3. Permission/shellcheck check in `tests/ci/verify.bats`.

See `tests/AGENTS.md` section "New hook script" for the full contract.

### Writer vs Reviewer

Consistent with the root and `tests/` `AGENTS.md`: author new fixtures here, then hand the approval pass to `code-reviewer` or `verifier` in a separate lane. Do not self-approve fixture correctness in the same context that wrote them — fixture schema drift is a common silent-failure mode.

## Dependencies

### Runtime

Fixtures are **pure data**. They have no runtime dependencies of their own.

### Consumer dependencies (for context)

| Consumer | Framework | How it loads fixtures |
|----------|-----------|-----------------------|
| `tests/integration/hooks.test.ts` | `bun:test` | `join(import.meta.dir, "../fixtures")` + `cat` piped into hook scripts via `Bun.$` |
| unit/scenario merge tests | `bun:test` + `Bun.file()` | Read JSON via `Bun.file(path).json()` into temp-dir copy |

### Test-Time Externals

None. This directory does not require `jq`, `bats`, `docker`, `claude`, or any package manager. The files are inert JSON on disk.

<!-- MANUAL: -->
