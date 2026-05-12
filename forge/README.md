# forge

One-command coding pipeline orchestrator for Claude Code: **plan → research → council → code → verify (PBT + mutation + browser) → ship PR with signed audit chain.**

Forge is a *conductor*, not a musician. It wires together best-of-breed Claude Code plugins (feature-dev, pr-review-toolkit, ralph-loop, tdd-guard, mutation-test-runner, protect-mcp, claude-mem, claude-hud) into a single deterministic 6-phase runbook with **cryptographically signed gate-level audit receipts** — every Phase-5 verify gate (derive-kind, pbt-verify, mutation-gate, browser-verify, tdd-guard) emits a `@veritasacta/verify`-signed Ed25519 receipt to `.forge/receipts/`. Per-tool-call signing is on the roadmap pending upstream `protect-mcp` v2.

## Install

```bash
bunx -y @yka/forge@latest install
```

> Pre-publish (dev): `bun /path/to/forge/dist/cli.js install --local /path/to/forge`

Single command. The installer:

1. **Auto-installs 15 system tools** (no manual prereq step): rustup → cargo → jj, uv → apprise + mutmut + hypothesis + pytest, syft, grype (sudo), opengrep. Skippable with `--skip-prereqs`.
2. **Registers 5 marketplaces** via `claude plugin marketplace add` (so Claude Code owns `known_marketplaces.json`):
   - `claude-plugins-official` (anthropics/claude-plugins-official)
   - `claude-code-workflows` (wshobson/agents)
   - `claude-code-plugins-plus` (jeremylongshore/claude-code-plugins-plus-skills)
   - `tdd-guard` (nizos/tdd-guard)
   - `claude-hud` (jarrodwatts/claude-hud)
   + the forge marketplace itself
3. **Installs 8 plugins** (forge + 7 KEEPs): `feature-dev`, `pr-review-toolkit`, `ralph-loop`, `tdd-workflows`, `tdd-guard`, `mutation-test-runner`, `protect-mcp`, `claude-hud`. Plus 2 optional extras (`hookify`, `superpowers`) via `--with-extras`.
4. **Installs `claude-mem` as a Claude Code plugin** (via `npx claude-mem install`, registered under `thedotmack` marketplace). Patches its non-standard `marketplace.json` location to bridge the upstream packaging quirk so the MCP loads correctly.
5. **Stubs protect-mcp's broken upstream hooks** (current v0.5.5 ships `evaluate`/`sign` subcommands that no longer exist). Phase 6 signing falls back to `@veritasacta/verify` directly.
6. **Configures claude-hud as the HUD** in `~/.claude/settings.json` `statusLine`, with a curated 9-knob config (tools / agents / todos / duration / speed / prompt cache / memory / token breakdown / session tokens) and `[forge X.Y.Z]` brand label.
7. **Writes a wrapper** at `~/.claude/forge/bin/forge` so the `forge` command works from any shell.
8. **Runs a post-install hook smoke check** — fails the install if any enabled plugin's hook errors immediately.

Restart Claude Code once after — plugins activate, HUD shows. Total install time: ~5 min cold (mostly cargo install), <30 s warm.

## Use

```
/forge:forge "Add subtract(a, b) alongside add. PBT + mutation gates. Open the PR."
```

The forge-lead agent activates, walks the 6-phase runbook, writes every artifact to `.forge/`, and opens a PR with mutation scores + property-test verdicts + signed audit-chain link in the body.

## CLI surface

```
forge install [--local <path>] [--with-extras|--full] [--skip-prereqs]
forge update [enable|disable|status]
forge uninstall [--keep-deps]
forge reinstall [--local <path>] [--with-extras]
forge doctor [--quiet|--hooks|--json]
forge statusline                      # debug only — production HUD is claude-hud
```

### `forge doctor`

The single source of truth for "is forge healthy?" Runs 11 checks:

1. `~/.claude/forge/.bootstrapped` marker present
2. All 6 marketplaces registered in `known_marketplaces.json`
3. All 8 default plugins enabled in `settings.json`
4. `statusLine.command` points at claude-hud
5. `~/.claude/plugins/claude-hud/config.json` has `[forge X.Y.Z]` customLine
6. protect-mcp hooks stubbed (no broken upstream commands left)
7. `.mcp.json` declares 4 MCPs (docfork, deepwiki, github, snyk)
8. `claude-mem@thedotmack` plugin enabled
9. All 15 system tools present (`command -v` with `~/.cargo/bin`, `~/.local/bin`, `~/.opengrep/cli/latest` fallback search)
10. Hook smoke: every enabled plugin's hooks fired with fake event payloads, all exit clean
11. All marketplaces up to date with upstream

Exits 0 when fully green, 1 on any fail. `--json` emits machine-readable output. `--hooks` runs only the hook smoke. `--quiet` emits JSON `additionalContext` for the SessionStart hook.

### `forge update`

4-step refresh:
1. `git pull` every marketplace
2. `claude plugin marketplace update` to refresh listings
3. `claude plugin update <spec>` for every enabled forge-marketplace plugin
4. Re-apply post-install fixes (re-stub protect-mcp hooks, re-tune claude-hud config) — guaranteed to leave forge in green state even after an upstream regression

## The 6-phase runbook

| Phase | What runs | Audit artifact |
|---|---|---|
| 0 Bootstrap | `git config safe.directory '*'` | — |
| 1 Plan | `feature-dev` plugin expands brief into parcel DAG | `.forge/dag.json` |
| 2 Research | Routes each parcel claim to canonical MCP per type. Forbidden: training-data-only research. | `.forge/routing-plan.md` + `.forge/audit/tool-trace.jsonl` |
| 3 Council | All 6 `pr-review-toolkit` personas dispatched in **parallel** (single Task batch) + meta-judge in fresh context. Drops findings < 80 confidence. Unconditional — even on a 1-line typo. | `.forge/council/<persona>.json` × 6 + `meta-judge.json` |
| 4 Code | Per-parcel `ralph-loop` worker in a `jj`-snapshotted git worktree. Red-test → green-fix. tdd-guard blocks impl edits while red. | `src/<parcel>.ts` + `src/<parcel>.test.ts` |
| 5a derive-kind | Classifies each parcel as `pure-fn` / `io` / `ui` / `config` / `infra` (rule-based: ast-grep + path heuristics + claim regex) | `.forge/kind/<parcel>.json` |
| 5b PBT verify | `pbt-verifier` agent generates property tests via fast-check / Hypothesis / proptest, runs them | `.forge/pbt/<parcel>.json` |
| 5c Mutation gate | `mutation-orchestrator` agent runs Stryker / mutmut / cargo-mutants per stack; score ≥ 0.80 or block | `.forge/mutation/<parcel>.json` |
| 5d Browser verify | `browser-driver` agent boots dev server via webapp-testing's `with_server.py`, drives bundled-Chromium headless via Playwright, captures screenshot + console + HAR via proofshot | `.forge/browser/<parcel>.proofshot` |
| 6 Ship | Each gate's payload Ed25519-signed via `@veritasacta/verify sign-payload` → chained receipts → append-only `forge-meta` git branch with `Decision-Gate` trailer commits → `git fsck --strict` → `gh pr create` (or `.forge/pr-body.md` fallback if no token). Stop hook fires `apprise`. | `.forge/receipts/*.json` + `forge-meta` branch + PR |

### Phase 2 — Research routing

| Claim type | First-choice MCP | Fallback |
|---|---|---|
| Library / package API | `mcp__docfork__*` | WebFetch on docs site |
| Upstream repo behavior | `mcp__deepwiki__*` | `mcp__github__*` |
| GitHub PR/issue/commit | `mcp__github__*` / `gh` | WebFetch on URL |
| Prior runs / lessons | `mcp__plugin_claude-mem*` | (no fallback — always first) |
| Year-bounded web facts | `WebSearch` | WebFetch |
| Security / dep scan / CVE | `mcp__snyk__*` | WebSearch advisories |

Every MCP call is logged to `.forge/audit/tool-trace.jsonl` with `{ts, phase, tool, query, parcel, result_count}`. Verify phase rejects the run if any required tool for a claim is missing.

## Custom forge agents

4 orchestrator agents (live in `plugin/agents/`):

| Agent | Role |
|---|---|
| `forge:forge-lead` | Top-level conductor — parses brief, walks 6 phases, dispatches subagents, signs Phase 6 receipts |
| `forge:pbt-verifier` | Phase 5b — derives properties from signatures, writes runnable PBT tests, returns VERIFIED/PARTIAL/MISSING with shrunk counterexamples |
| `forge:mutation-orchestrator` | Phase 5c — runs Stryker / mutmut / cargo-mutants, parses score, returns PASS/BLOCK with surviving-mutant report |
| `forge:browser-driver` | Phase 5d — Playwright headless via webapp-testing, ProofShot bundle |

All 4 are *thin orchestrators* around external tools. The deep judgment work (code review, code generation, TDD enforcement, audit signing, memory) is delegated to upstream plugins.

## Ship-blocking gates

Any one → no PR:

- council finding ≥ 80 confidence unaddressed
- mutation-gate score < 0.80 on any code parcel
- pbt-verify PARTIAL with failing counterexample
- browser-verify console error or 4xx/5xx
- tdd-guard non-test edit while red
- protect-mcp Cedar policy denial in the chain (conditional — fires once upstream protect-mcp v2 ships working hooks; no-op today)
- `npx @veritasacta/verify` fails on receipt chain
- stub-warn flagged stub reaching merge

## System tools (auto-installed)

The CLI installs all of these during `forge install`. Listed for reference; you should not need to install any manually.

| Tool | Used by | Install path |
|---|---|---|
| `bun, node, npx, jq, git, gh, claude` | CLI itself | pre-existing (CLI errors if missing) |
| `cargo` (via rustup) | Phase 5c Rust mutation, jj install | `~/.cargo/bin/` |
| `jj` | Phase 4 parcel snapshots | `cargo install jj-cli` |
| `uv` (via astral.sh) | Python tool installer (replaces pip on distros without ensurepip) | `~/.local/bin/uv` |
| `apprise, mutmut, hypothesis, pytest<9` | Phase 5c/6 Python + Stop-hook notifier | `uv tool install` → `~/.local/bin/` |
| `syft` | Phase 2 SBOM | `/usr/local/bin/syft` (sudo) |
| `grype` | Phase 2 CVE scan | `/usr/local/bin/grype` (sudo) |
| `opengrep` | Phase 2 SAST | `~/.opengrep/cli/latest/` |

Sudo is only prompted for `syft` + `grype` (binary downloads to `/usr/local/bin`); skipped if the CLI runs without a TTY.

## Output contract

```
.forge/
├── dag.json                        # parcel DAG with research + must_fix
├── routing-plan.md                 # Phase 2 routing decisions
├── audit/tool-trace.jsonl          # every MCP call this run
├── council/<persona>.json          # all 6 personas + meta-judge
├── kind/<parcel>.json              # derive-kind classification
├── pbt/<parcel>.json               # PBT verdict + .test.ts artifact
├── mutation/<parcel>.json          # mutation score + raw stryker.json
├── browser/<parcel>.proofshot      # UI parcel bundle (or .skipped)
├── receipts/                       # Ed25519-signed receipts (one per gate)
│   ├── 01-tdd-guard.json
│   ├── 02-council.json
│   ├── ...
│   ├── _chain-head.txt             # tip of the hash chain
│   └── _public-key.pem             # verifier key
└── pr-body.md                      # PR body draft (offline fallback)

forge-meta branch                   # append-only, Decision-Gate trailer commits, git fsck clean
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                  forge:forge-lead  (conductor)                   │
└──────┬───────────────────────────────────────────────────────────┘
       │
       ▼ Phase 1            ▼ Phase 2          ▼ Phase 3 (parallel)
   ┌────────────┐      ┌─────────────┐      ┌───────────────────────┐
   │ feature-dev│      │ docfork     │      │ pr-review-toolkit     │
   │            │      │ deepwiki    │      │   silent-failure-hunter│
   │            │      │ github      │      │   type-design-analyzer │
   │            │      │ snyk        │      │   code-reviewer        │
   │            │      │ claude-mem  │      │   code-simplifier      │
   └────────────┘      │ WebSearch   │      │   comment-analyzer     │
                       └─────────────┘      │   pr-test-analyzer     │
                                            │ + meta-judge (fresh ctx)│
                                            └───────────────────────┘
       ▼ Phase 4 (per-parcel, parallel respecting deps)
   ┌────────────────────────────────────────────────────────┐
   │ ralph-loop worker  in  jj-snapshot git worktree        │
   │   tdd-guard hook blocks impl edits while red           │
   └────────────────────────────────────────────────────────┘
       ▼ Phase 5 (parallel per parcel, routed by derive-kind)
   ┌──────────────┐ ┌──────────────┐ ┌───────────────────────┐
   │ pbt-verifier │ │ mutation-    │ │ browser-driver        │
   │ (fast-check  │ │  orchestrator│ │  (Playwright headless │
   │  /Hypothesis │ │  Stryker     │ │   + webapp-testing    │
   │  /proptest)  │ │  /mutmut     │ │   + proofshot)        │
   │              │ │  /cargo-mut) │ │                       │
   └──────────────┘ └──────────────┘ └───────────────────────┘
       ▼ Phase 6
   ┌────────────────────────────────────────────────────────┐
   │ @veritasacta/verify sign-payload → Ed25519 receipts    │
   │ → forge-meta branch (append-only trailer commits)      │
   │ → git fsck --strict → gh pr create                     │
   │ → Stop hook fires apprise                              │
   └────────────────────────────────────────────────────────┘
```

## Update behavior

The forge SessionStart hook (`hooks/forge-status-check.sh`) silently `git fetch`es each marketplace on every Claude Code launch. If updates are available, it injects a one-line `additionalContext` JSON into the agent's startup. Claude will ask you on your next message (via AskUserQuestion): *Update now / Skip for this session / Disable auto-update prompt.*

Manual:
```bash
forge update              # pull marketplaces + apply now
forge update enable       # turn auto-prompt on (default)
forge update disable      # silence auto-prompt
forge update status       # show current setting
```

Or via slash commands in any session:
```
/forge:update
/forge:bootstrap          # re-run install (e.g. if it failed)
```

## License

MIT
