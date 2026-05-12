# forge

One-command coding pipeline for Claude Code: **plan → research → council → code → verify (PBT + mutation + browser) → ship PR with signed audit chain.**

## Install

```bash
bunx -y @yka/forge@latest install
```

That's it. The installer:

1. Adds 4 dependency marketplaces (`claude-plugins-official`, `claude-code-workflows`, `claude-code-plugins-plus`, `tdd-guard`) + the forge marketplace itself
2. Installs the forge plugin and its 15 sub-plugins (council personas, mutation testing, signed audit chain, browser-verify, tdd-guard, etc.)
3. Patches your `~/.claude/settings.json` with the forge statusLine
4. Writes a `~/.claude/forge/.bootstrapped` marker

Restart Claude Code once after — sub-plugins activate, status line shows.

> Requires [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`). Node's `npx` works too: `npx -y @yka/forge@latest install`.

## Use

In any project, after install:

```
/forge:forge add subtract(a, b) alongside add. Open the PR.
```

forge orchestrates the pipeline. The status line shows current phase, parcel, mutation score, branch.

## Updates

The forge SessionStart hook silently `git fetch`es each marketplace on every Claude Code launch. If updates are available it injects a one-liner into the agent's context — Claude will then ask you (via AskUserQuestion) whether to apply them on your next message.

Manual control:

```bash
bunx @yka/forge@latest update              # pull marketplaces + apply now
bunx @yka/forge@latest update enable       # turn auto-prompt on (default)
bunx @yka/forge@latest update disable      # silence auto-prompt
bunx @yka/forge@latest update status       # show current setting
```

Or via slash commands (in any Claude Code session):

```
/forge:update
/forge:update enable
/forge:update disable
/forge:bootstrap        # re-run install (e.g. if it failed)
```

## Uninstall

```bash
bunx @yka/forge@latest uninstall            # removes plugin, marketplaces, statusLine, state dir
bunx @yka/forge@latest uninstall --keep-deps # leave dep marketplaces in place (other plugins use them)
```

## What forge does

- **Phase 0 — Bootstrap.** `git config safe.directory` for containers and worktrees.
- **Phase 1 — Plan.** `feature-dev` expands the brief into N parcels with explicit deps. Writes `.forge/dag.json`.
- **Phase 2 — Research.** Routes claims to canonical MCPs:
  - Library API → `docfork`
  - Upstream repo behavior → `deepwiki`
  - Year-bounded web facts (CVEs published this month, recent RFCs) → `WebSearch`
  - GitHub PR/issue/commit context → `mcp__github__*`
  - Security / dep scan → `mcp__snyk__*`
  - Prior runs / lessons → `claude-mem` (always first)
  
  Training-data-only research is rejected. Audit trace at `.forge/audit/tool-trace.jsonl`.
- **Phase 3 — Council.** All 6 `pr-review-toolkit` personas dispatched in parallel + meta-judge in fresh context. Unconditional even on a 1-line typo. Findings <80 confidence dropped.
- **Phase 4 — Code.** `ralph-loop` worker per parcel in a `jj`-snapshotted worktree. Red-test → green-fix loop. tdd-guard blocks impl edits before a failing test exists.
- **Phase 5 — Verify.** `derive-kind` classifies parcel → routes:
  - `pure-fn` → `pbt-verify` + `mutation-gate` (≥0.80)
  - `io` → `mutation-gate` + optional pbt
  - `ui` → `mutation-gate` + `browser-verify` (Playwright headless, console + 4xx/5xx detect)
  - `config` / `infra` → all skipped
- **Phase 6 — Ship.** `protect-mcp` Cedar-policy-checked signing → `@veritasacta/verify` chain → `forge-meta` branch (append-only) → `git fsck --strict` → `gh pr create`. Stop hook fires apprise.

## Ship-blocking gates (any one → no PR)

- council finding ≥80 confidence unaddressed
- mutation-gate score < 0.80 on any code parcel
- pbt-verify PARTIAL with a failing counterexample
- browser-verify console error or 4xx/5xx
- tdd-guard non-test edit while red
- protect-mcp Cedar denial in the chain
- `npx @veritasacta/verify` fails
- stub-warn flagged stub reaching merge

## Required tools on your machine

forge calls these via Bash. Install via your package manager:

| Tool | Why |
|---|---|
| `bun` | TS/JS test runner + Stryker host + the forge CLI |
| `jj` | parcel snapshot/undo |
| `cargo` + `cargo-mutants` | Rust mutation testing |
| `python3` + `mutmut` + `hypothesis` + `pytest<9` | Python PBT + mutation |
| `gh` | PR creation |
| `apprise` (pip) | Stop-hook notifications |
| `opengrep` `grype` `syft` | SAST + SCA + SBOM |

Run `bunx @yka/forge@latest doctor` to see what's missing.

## License

MIT
