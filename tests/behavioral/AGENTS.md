<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# tests/behavioral/

## Purpose

Behavioral / acceptance tests for the installed Claude Code v12 system. These are **black-box** specs: they do not import installer code — they feed inputs to the shipped artifacts (hook scripts, `settings.json`) and, for `system.test.ts`, to a live `claude -p` subprocess, and assert on externally observable behavior.

Two tiers live here:

1. **Pure behavioral** (`hooks.test.ts`, `settings.test.ts`) — deterministic, offline, parse the shipped config and pipe JSON into hook scripts. Run on every `bun test`.
2. **Live system** (`system.test.ts`) — invokes `claude -p` against the developer's installed v12 system using their Claude Max subscription. Gated behind `RUN_BEHAVIORAL_TESTS=true` and requires `claude` on `PATH`.

## Key Files

| File | Description |
|------|-------------|
| `hooks.test.ts` | Pipes fixture JSON through `configs/hooks/pre-destructive-blocker.sh` and `configs/hooks/pre-secrets-guard.sh` via `echo ... \| bash`, asserts `decision: "block"` for dangerous inputs (20 destructive patterns, 6 secret patterns) and `decision: "allow"` for safe inputs and non-Bash tools. `describe.skipIf(!jqAvailable)`-gated. |
| `settings.test.ts` | Static validation of `configs/home-claude/settings.json`: deny array non-empty, no duplicates, `model` pinned to a claude string, `effortLevel` set, and that a curated danger list (`rm -rf /`, `git push --force`, `DROP DATABASE`, `terraform destroy`, `npm publish`, `shutdown`, `curl \| sh`) is matched by at least one deny rule while safe commands (`ls`, `git status`, `npm install`, `bun test`) are not. Uses substring matching, not regex. |
| `system.test.ts` | Live acceptance suite against `claude -p`. Covers: hook enforcement (destructive + secret block, safe passthrough), tool selection (Read, Bash, Grep, Glob), settings deny-rule enforcement (force push), CLAUDE.md principle adherence (research-first, verification, dedicated tools — AI-evaluated via a second `claude --bare -p` judge), and MCP server awareness. 60–90s per-test timeouts. `describe.skipIf(!shouldRun)`-gated. |

## For AI Agents

### Where New Behavioral Tests Go

1. **New hook script in `configs/hooks/`?** Add per-command `test.each` block to `hooks.test.ts` with matching `destructive`/`safe` arrays. Keep inputs as `{ tool_name, tool_input: { command } }` objects piped via the existing `pipeToHook` helper — do not spawn shells directly.
2. **New `settings.json` field with security impact?** Add a static assertion to `settings.test.ts` (alongside `model` / `effortLevel`). If the field is a new deny-rule list, extend `definitelyDangerous` / `definitelySafe` with representative examples.
3. **New CLAUDE.md principle or system behavior?** Add a `test` to the matching `describe` in `system.test.ts`. For qualitative checks, use the existing `aiEvaluate(output, criteria)` helper — it spawns a judge `claude --bare -p` and expects a `{"passed": bool, "reasoning": string}` JSON response.
4. **New MCP server in the installer?** Append its name to the `known` array in the "MCP server awareness" test.

### Hard Rules

1. **Never import installer source here.** Behavioral tests consume shipped artifacts only: `configs/hooks/*.sh` and `configs/home-claude/settings.json`. For whitebox installer tests use `tests/scenarios/` or `tests/unit/`.
2. **`hooks.test.ts` and `settings.test.ts` must stay deterministic and offline.** No `claude`, no Docker, no network — they run on every `bun test`.
3. **`system.test.ts` uses the Claude Max subscription, not an API key.** Invoke `claude -p "..." --output-format json` (or `stream-json --verbose --include-partial-messages`) via `Bun.spawnSync`. Never import `@anthropic-ai/sdk` or read `ANTHROPIC_API_KEY` in this directory.
4. **Gate live tests behind env vars.** `describe.skipIf(!claudeAvailable || process.env.RUN_BEHAVIORAL_TESTS !== "true")`. Do not let CI accidentally burn Max subscription tokens.
5. **Gate `jq` tests.** Hook scripts use `jq` to parse stdin — wrap those `describe` blocks with `describe.skipIf(!jqAvailable)` (see existing pattern at the top of `hooks.test.ts`).
6. **Hook tests pipe via the exact production surface.** Use `$\`echo ${inputJson} \| bash ${hookPath}\`` — do not `source` the script or reimplement its env.
7. **AI-evaluated tests must parse JSON defensively.** The `aiEvaluate` helper regex-extracts `{"passed": ...}` and returns `{ passed: false, reasoning: "AI evaluation failed to parse" }` on failure. Preserve that fallback — don't hard-fail on judge-LLM nondeterminism.
8. **Timeouts are generous for a reason.** `claude -p` cold starts can take 30s+. Keep per-test timeouts at 60–90s and match them in both the `Bun.spawnSync({ timeout })` call and the `test(..., timeout)` positional argument.

### Running

```bash
# Pure behavioral (offline, runs with every `bun test`)
bun test tests/behavioral/hooks.test.ts
bun test tests/behavioral/settings.test.ts

# Live system (requires `claude` on PATH + Max subscription)
RUN_BEHAVIORAL_TESTS=true bun test tests/behavioral/system.test.ts

# One test by name
bun test tests/behavioral/hooks.test.ts --test-name-pattern "pre-destructive-blocker"
```

### Writer vs Reviewer

Consistent with the parent `AGENTS.md`: author behavioral specs here, then hand the approval pass to `code-reviewer` or `verifier` in a separate lane. Do not self-approve behavioral coverage in the same context that wrote it.

## Dependencies

### Runtime (devDependencies)

| Package | Role |
|---------|------|
| `bun:test` | `describe`, `test`, `expect`, `test.each`, `describe.skipIf` |
| `bun` (`$`, `Bun.file`, `Bun.which`, `Bun.spawnSync`) | Shell pipes (`hooks.test.ts`), JSON load (`settings.test.ts`), `claude` subprocess (`system.test.ts`) |
| `node:path` | Resolving `HOOKS_DIR` / `SETTINGS_PATH` via `import.meta.dir` |

### External Tools (must be on PATH for the gated suites)

| Tool | Required by | Install |
|------|-------------|---------|
| `jq` | `hooks.test.ts` (hook scripts use it internally) | `bootstrap.sh`; brew / apt / pacman / dnf |
| `bash` | `hooks.test.ts` (hook scripts are bash) | System default |
| `claude` | `system.test.ts` | `bootstrap.sh` installs Claude Code |

### Env Vars

| Variable | Effect |
|----------|--------|
| `RUN_BEHAVIORAL_TESTS` | Must be `"true"` to enable `system.test.ts` (also requires `claude` on PATH) |

### Upstream Artifacts Under Test

| Artifact | Used by |
|----------|---------|
| `configs/hooks/pre-destructive-blocker.sh` | `hooks.test.ts` |
| `configs/hooks/pre-secrets-guard.sh` | `hooks.test.ts` |
| `configs/home-claude/settings.json` | `settings.test.ts` |
| Installed `~/.claude/` system (hooks, settings, CLAUDE.md, MCP servers) | `system.test.ts` |

<!-- MANUAL: -->
