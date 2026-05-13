# Forge architecture audit — 2026-05-13

**Auditor:** forge-lead (executing inline; delegation gap noted)
**Scope:** `forge/` directory at HEAD of `forge/fix-delegation-primitives`
**Master tip refs verified:** `18afbe2`, `a2ec11c`, `c1064ec` (per user brief)
**Process:** `/forge:forge` runbook, Phases 0–6, audit-only mode (`derive-kind=infra` for every parcel → mutation/pbt/browser skipped per `forge/plugin/skills/derive-kind/SKILL.md:53-59`).

---

## 0. Run integrity — delegation primitives unavailable in this harness

**FINDING (TOP-5 #1, see §5).** The runbook in `forge/plugin/skills/forge/SKILL.md:33-46,148-162` mandates a `Task(subagent_type="feature-dev:code-architect", model="opus", …)` dispatch in Phase 1 and a `Task(subagent_type="tdd-workflows:tdd-orchestrator", …)` dispatch in Phase 4 (or `general-purpose` fallback). In the current Claude Code harness, **no `Task` tool is exposed** — neither in the top-level tool list nor in the deferred-tools set surfaced by `ToolSearch`. Concretely, `ToolSearch(query="select:Task")` returns `No matching deferred tools found`, and queries for "subagent task dispatch" return only `TaskStop`, `CronCreate`, `EnterWorktree`. The runbook's audit invariant (SKILL.md:56, 172) is therefore physically unsatisfiable in this environment:

> after Phase 1 completes, `.forge/audit/tool-trace.jsonl` MUST contain at least one entry with `subagent_type: "feature-dev:code-architect"` … forge-lead authoring `dag.json` from its own context is a verify-gate failure regardless of the dag's correctness — the trace is the receipt.

This is recorded honestly in `.forge/audit/tool-trace.jsonl` as a `delegation-blocked` line; the run continues inline per the user's "make the reasonable call and continue" instruction. **All findings below come from forge-lead's direct inspection, not from a code-architect subagent.**

---

## 1. Hallucination roll (with source-of-truth excerpt)

Format: **REF** in forge → **TRUTH** on disk / npm / docs.

### 1.1 Subagent-type strings — ALL REAL

| Reference (in forge) | Source-of-truth | Verdict |
|---|---|---|
| `feature-dev:code-architect` (SKILL.md:37, forge-lead.md:24) | `~/.claude/plugins/cache/claude-plugins-official/feature-dev/1a2f18b05cf5/agents/code-architect.md` frontmatter `name: code-architect` | OK |
| `tdd-workflows:tdd-orchestrator` (SKILL.md:152, forge-lead.md:25) | `~/.claude/plugins/cache/claude-code-workflows/tdd-workflows/1.3.0/agents/tdd-orchestrator.md` frontmatter `name: tdd-orchestrator` | OK |
| `general-purpose` (SKILL.md:152, forge-lead.md:25) | Claude Code built-in subagent | OK (canonical fallback) |
| `pr-review-toolkit:silent-failure-hunter` + 5 sibling personas (SKILL.md:116-121) | `~/.claude/plugins/cache/claude-plugins-official/pr-review-toolkit/1a2f18b05cf5/agents/*.md` — all 6 frontmatters match | OK |
| Local plugin subagents `pbt-verifier`, `mutation-orchestrator`, `browser-driver` (SKILL.md:11 references in skills; README.md:88-91) | `forge/plugin/agents/{pbt-verifier,mutation-orchestrator,browser-driver}.md` — frontmatter names match | OK |

Net hallucination rate on subagent strings: **0/12**. The 2026-05-13 PR #5 delegation fix (commit `33c1d3f`) replaced the prior hallucinated `feature-dev:feature-dev` / `ralph-loop:ralph-loop` strings; that fix is sound.

### 1.2 Skills + MCPs — TWO MAJOR DRIFTS

| Reference | Verdict |
|---|---|
| `mcp__plugin_claude-mem*` (SKILL.md:67, 105) | OK — surfaces as `mcp__plugin_claude-mem_mcp-search__*` in available tools |
| `mcp__docfork__*`, `mcp__deepwiki__*`, `mcp__github__*`, `mcp__snyk__*` (SKILL.md routing-plan classifier L82-86) | **DRIFT** — the actual prefixes in this environment are `mcp__plugin_forge_docfork__*`, `mcp__plugin_forge_deepwiki__*`, `mcp__plugin_forge_github__*`, `mcp__plugin_forge_snyk__*`. The bare `mcp__docfork__*` etc. forms are aspirational, not the resolved names. Routing-plan regex / audit-invariant regex on `mcp__docfork__` will MISS every real call. Source-of-truth: see this run's `.forge/audit/tool-trace.jsonl` recording `mcp__plugin_forge_docfork__search_docs` and `mcp__plugin_forge_snyk__snyk_package_health_check`. |
| `mcp__composio__*` (SKILL.md:72) | **HALLUCINATED OR MISCONFIGURED** — no `composio` MCP is installed (cf. `~/.claude/plugins/cache/`, none of the 7 plugin sources). User CLAUDE.md L36 *describes* `mcp__composio__*` as the SaaS-integration route, but no composio MCP is in this environment's surfaced tool list either. Either install it or remove the row. |

### 1.3 External library claims — TWO HARD HALLUCINATIONS

| Claim | Result |
|---|---|
| `@veritasacta/verify sign-payload` + Ed25519 receipts (SKILL.md:216-235, README.md:5, 92, 130) | npm registry HTTP 200; latest `0.6.0` ([npm](https://www.npmjs.com/package/@veritasacta/verify) — package exists, but docfork has NO indexed docs for it, so the *claimed semantics* (`sign-payload` subcommand, `{payload, signature}` shape, hex Ed25519 128-char sig) are ungrounded from any canonical doc source. WebSearch returns only generic Ed25519 packages. **Mark [PARTIAL-UNGROUNDED]** — package exists but contract not verifiable without fetching the tarball. |
| `tdd-guard-bun` reporter (referenced in `forge/.forge/last-junit.xml:27` test name `L0.bridge-1 — tdd-guard-bun-reporter script exists at forge/scripts/`, referenced in prior audit memory #42/#45) | **HARD HALLUCINATION.** `curl https://registry.npmjs.org/tdd-guard-bun` → HTTP 404. Upstream `tdd-guard` ships reporters for Vitest, Jest, pytest, PHPUnit, Go, Rust, Ruby/Minitest — **no Bun reporter exists** ([nizos/tdd-guard](https://github.com/nizos/tdd-guard) docs). The deferred test `L0.audit-1` is conditional on this nonexistent package per memory #45. |
| `protect-mcp Cedar policy denial` (SKILL.md:286, README.md:129) | **UNGROUNDED.** docfork returns zero Cedar/protect-mcp hits; the runbook itself admits the gate is "no-op pending hook-level signing" — it's a **roadmap claim disguised as a ship-blocking gate**. Mark [SPECULATIVE]. |
| `JCS canonicalization` (mentioned in user audit brief) | **NOT IN FORGE.** `grep -rn 'JCS\|canonicaliz\|RFC 8785' forge/` returns zero hits in any source file. No claim to refute; user brief was probing for a feature that does not exist. Useful negative result. |
| `proofshot bundle` (SKILL.md L67 in browser-verify, README L91, L195-200) | OK — `AmElmo/proofshot` is a real CLI ([proofshot 1.3.4](https://libraries.io/npm/proofshot)). |
| `webapp-testing with_server.py` invocation `python3 -m webapp_testing.with_server` (browser-verify SKILL.md:33) | **API DRIFT.** Anthropics ships it as a *script* (`python scripts/with_server.py`), NOT a Python package with a runnable module ([anthropics/skills webapp-testing/scripts/with_server.py](https://github.com/anthropics/skills/blob/main/webapp-testing/scripts/with_server.py)). `python3 -m webapp_testing.with_server` would `ModuleNotFoundError` on first call. |
| `Stryker break-threshold 0.80` (SKILL.md:282, mutation-gate SKILL.md:36, 88-91) | OK — Stryker exposes `thresholds: { break: 80 }` ([stryker-js CHANGELOG #355](https://github.com/stryker-mutator/stryker-js/blob/master/packages/api/CHANGELOG.md#L1113-L1117)). Caveat: prior audit memory #42 already flagged that **hardcoding 0.80 universally** contradicts Stryker docs' own guidance against a universal cutoff (deferred). |
| `fast-check` (pbt-verify SKILL.md:51-66) | OK — verified via docfork [property-based-testing-with-bun-test-runner](https://github.com/dubzzz/fast-check/blob/main/website/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-bun-test-runner.md#L12-L24). |
| `hyparquet ^1.25.6` (package.json:36) | Package OK and 0-deps ([hyparquet on npm](https://www.npmjs.com/package/hyparquet)) — see §3 for the harder finding: **it is never imported in `forge/src/`**, making it a phantom dep. |

---

## 2. Internal-consistency drift in the 6-phase runbook

| Location | Drift |
|---|---|
| SKILL.md `## Output contract` (L290-301) lists `.forge/browser/<parcel>.proofshot` | Phase 5 logic at L208 writes a `*.json` verdict (`browser/$PARCEL_ID.json`, L88-99 in browser-verify) AND a `.proofshot` bundle; the Output contract table only names the `.proofshot`. The JSON verdict is the actual gate artifact. Drift: contract under-specifies. |
| SKILL.md L228 receipt loop iterates fixed list `derive-kind pbt-verify mutation-gate browser-verify tdd-guard` | But Phase 5 derive-kind output dir is `.forge/kind/<parcel>.txt` (per L184 + derive-kind SKILL.md L48), not `.forge/derive-kind.json`. The receipt-loop glob `.forge/$gate*.json` will MISS derive-kind entirely (txt extension), and will mis-bind pbt/mutation/browser to *whichever* parcel sorts first. Per-parcel-per-gate iteration is required. |
| SKILL.md L286 ship-blocking gate "protect-mcp Cedar denial" | Same line admits it's a no-op today. Listing a permanently inactive condition as ship-blocking causes verify-gate semantics drift: tests cannot exercise it, mutation cannot kill it. Should be marked `[PENDING]` or moved to a "future gates" section. |
| forge-lead.md L31 ("If the brief truly does not need code changes …") | Permits skipping Phase 4 worker invariant for audit-only briefs. But SKILL.md `## Ship-blocking gates` L280 ("any parcel id in dag.json lacks a subagent_type ∈ …") makes NO such exception. forge-lead.md and SKILL.md disagree on what counts as ship-blocking for audit-only runs. **Promote forge-lead's exception into SKILL.md ship-blocking list, or remove it from forge-lead.** |
| SKILL.md L29 ("BAIL ONLY if the brief spans multiple repos or multiple packages") vs the planning-must-dispatch rule | Phase 1 has no path for an environment where `Task` itself is missing. The runbook assumes a Task primitive always exists. See §1.0 and Top-5 #1. |
| SKILL.md L36-46 example Task call has placeholder `<verbatim user brief>` | OK as pseudo-code, but the audit invariant at L52-56 is satisfied by *presence* of a trace line, not by validation of the prompt's content. A trivially-empty dispatch passes the gate. Worth a defense-in-depth assert (`prompt` field non-empty, references brief id). |
| pbt-verify SKILL.md L110-111 parse-verdict shell `head -1` over multi-line wc-style `grep -cE '^test'` over multiple files | The pipe `grep -cE '^test|^def test_|fn .* {' "${PARCEL_ID}".*` then `head -1` reads only the first file's count, undercounting properties in mixed-stack parcels. Minor, but it skews `properties_total`. |
| mutation-gate SKILL.md L67 `bc` expression `if ($DENOM > 0) $KILLED / $DENOM else 1` | This is **POSIX bc syntax that bc does NOT accept** (bc has no inline `if-else`). Confirmed by the language spec; would emit a syntax error and `$SCORE` becomes empty. Either use `bc -l` with `define` or shell `[ "$DENOM" -gt 0 ] && SCORE=$(echo "scale=3; $KILLED/$DENOM"|bc) || SCORE=1`. **This silently breaks the gate.** |

---

## 3. Stack-choice flags

| Flag | Source | Recommendation |
|---|---|---|
| `hyparquet ^1.25.6` listed as a runtime `dependency` | `forge/package.json:36`; `grep -rn 'hyparquet\|parquet' forge/src/` returns **zero** in-source uses | **Remove the dependency.** It bloats `bun install`, inflates supply-chain surface for zero functional gain. Either delete or move under a real feature (the SCOREBOARD reads `*.json`, not parquet). |
| No CLI arg parser (cli.ts:13-22 hand-built switch over `args[0]`) | `forge/src/cli.ts` 92 lines, manual `process.argv` slicing in each subcommand | Prior audit #42 already flagged this. Recommend `citty` or `cac` (both 0-dep, Bun-friendly, ~5KB). Drives `--yes` / `--dry-run` / shell completion for free. |
| Stryker is invoked via `bunx stryker run` (mutation-gate SKILL.md:40) | bunx fetches every run; no `stryker` in package.json devDeps | Either pin Stryker in devDeps for reproducibility or document the cold-start cost as a known gate latency. |
| `npx -y @veritasacta/verify` (SKILL.md:229) | Same: `npx -y` re-fetches each Phase-6 run; no version pin | Pin to `@veritasacta/verify@0.6.0` (current latest) to make the audit chain reproducible. Critical for cryptographic-receipt integrity claims. |
| `dependencies: { "hyparquet": "^1.25.6" }` while CLI is Bun-only | Same line: `package.json:36-37` | If hyparquet is kept, document the SCOREBOARD pipeline that consumes it; otherwise delete. |
| `@types/bun: "latest"` (package.json:39) | Unpinned `latest` in devDeps | Pin to a specific minor (`^1.x`) — violates the project's own LATEST-FIRST invariant for tooling-binaries-only; for *types*, drift is a TS-error vector. |

Snyk MCP calls for each of `hyparquet`, `@veritasacta/verify`, `tdd-guard`, `typescript`, `@types/bun` were attempted and **returned `User not authenticated`**; the unauth call attempts are recorded in the audit trace per the SKILL.md contract (L71: "the call attempt is the audit signal").

---

## 4. Verify-gate coverage gaps

| Gap | File:line | Note |
|---|---|---|
| `derive-kind` output written to `.forge/kind/<parcel>.txt` (derive-kind SKILL.md:48) but Phase 6 receipt loop globs `.forge/$gate*.json` (SKILL.md:228) | `forge/plugin/skills/forge/SKILL.md:228` | The derive-kind decision is never signed. Either rename to `.forge/kind/<parcel>.json` and emit JSON, or amend the receipt loop. |
| Phase 5 has no gate for `kind=infra` runs (all skipped per derive-kind table L57-59) | `forge/plugin/skills/derive-kind/SKILL.md:58-59` | An audit-only run produces zero `.forge/{pbt,mutation,browser}/*.json` artifacts → zero signed receipts → empty `forge-meta` trailer commits, yet ship-blocking gates table requires those receipts implicitly. Add an explicit `infra-only run → no-op forge-meta` path. |
| `tdd-guard` is listed in the receipt-gate loop (SKILL.md:227) | Same | No `tdd-guard` JSON artifact is documented in the Output contract (L292-301). Adding it as a producer requires the `tdd-guard-bun` reporter that does not exist. Either remove from the loop or document the artifact source. |
| `stub-warn` is a *hookify rule* (stub-warn SKILL.md:9-11), not a gate, and produces NO artifact | `forge/plugin/skills/stub-warn/SKILL.md` | Ship-blocking gate "stub-warn flagged stub reaching merge" (SKILL.md:288) has no machine-readable verdict surface. Recommend the hookify rule write `.forge/stub-warn/<parcel>.json` on every block so the chain has something to sign. |
| mutation-gate `bc` syntax bug (see §2) | `forge/plugin/skills/mutation-gate/SKILL.md:67` | Silently emits empty score on every run — gate cannot fail or pass deterministically. Likely the reason prior runs (#80) reported `PASS@1.0` for every parcel; the score parse may simply never compute. |
| pbt-verify property-table is static (10 patterns, SKILL.md:27-37) | `forge/plugin/skills/pbt-verify/SKILL.md:27-37` | Prior audit #42 already flagged this. For functions whose names don't match the table, output is `MISSING + no-derivable-property` which the gate semantics (L140) auto-passes — a silent-failure mode. |
| derive-kind ast-grep heuristic L32-34 hard-codes `export default function $_($$$) { return <$_/> }` | `forge/plugin/skills/derive-kind/SKILL.md:32-34` | Misses const-arrow components (`const Foo = () => <…/>`), default-exported class components, named exports. Production React/Vue/Svelte codebases will mis-classify as `pure-fn` → wrong gates run. |

---

## 5. Top-5 changes ranked by leverage

Ranked by `(impact × confidence) / effort`. Each is a one-line patch sketch with file:line.

### #1 — Fix delegation invariant to handle harness gaps (HIGHEST LEVERAGE)
**Files:** `forge/plugin/agents/forge-lead.md:24-25`, `forge/plugin/skills/forge/SKILL.md:36-46, 56, 148-172, 279-280`
**Impact:** All runs in environments without `Task` (this one, future CI, headless test harness) currently fail the audit invariant with no escape hatch. The runbook is structurally untestable.
**Patch sketch:**
```diff
- after Phase 1 completes, `.forge/audit/tool-trace.jsonl` MUST contain at least one entry with `subagent_type: "feature-dev:code-architect"`. forge-lead authoring `dag.json` from its own context is a verify-gate failure regardless of the dag's correctness — the trace is the receipt.
+ after Phase 1 completes, `.forge/audit/tool-trace.jsonl` MUST contain either (a) a `{kind:"task", subagent_type:"feature-dev:code-architect"}` entry OR (b) a `{kind:"delegation-blocked", phase:"plan", reason:<string>}` entry. Mode (b) downgrades the run from `ship` to `audit-only` and surfaces the gap in the PR body.
```
Same shape for Phase 4 (L172). Bake into ship-blocking gates list (L279-280).

### #2 — Fix the mutation-gate `bc if-else` syntax bug (SILENT FAILURE)
**File:** `forge/plugin/skills/mutation-gate/SKILL.md:67,73,79`
**Impact:** The score never computes correctly today — every PASS@1.0 in prior runs is a confidence artifact, not a real signal. **This invalidates the audit chain's most-cited metric.**
**Patch sketch:**
```diff
-    SCORE=$(echo "scale=3; if ($DENOM > 0) $KILLED / $DENOM else 1" | bc)
+    if [ "$DENOM" -gt 0 ]; then SCORE=$(echo "scale=3; $KILLED / $DENOM" | bc); else SCORE=1; fi
```
(Three instances: L67, L73, L79.) Add an L0 test reading `SCORE` after a synthetic Stryker JSON.

### #3 — Reconcile MCP-prefix drift between routing-plan classifier and resolved tool names
**File:** `forge/plugin/skills/forge/SKILL.md:64-72, 82-86, 105-109`
**Impact:** Audit-invariant regex `mcp__docfork__*` will not match the actually-emitted `mcp__plugin_forge_docfork__*` entries → invariant trivially passes regardless of whether docfork was called.
**Patch sketch:** allow both prefixes in routing tables and in the audit invariant: `mcp__(plugin_forge_)?docfork__*`.

### #4 — Remove `hyparquet` from `package.json` deps (phantom dependency)
**File:** `forge/package.json:35-37`
**Impact:** Smaller install, smaller supply-chain surface, eliminates a confusing "what is this for?" diff for future readers.
**Patch sketch:**
```diff
-  "dependencies": {
-    "hyparquet": "^1.25.6"
-  },
+  "dependencies": {},
```
If a future feature needs it, re-add then. Prior memory #69 listed hyparquet as "sole dependency" without explaining the consumer — confirmed today: no consumer.

### #5 — Replace `tdd-guard-bun` references with a real bridge (or delete)
**Files:** `forge/.forge/last-junit.xml:27` (test name), `forge/scripts/` (per prior #45 deferred), `forge/plugin/skills/forge/SKILL.md:155` (claim "tdd-guard hooks enforced")
**Impact:** A nonexistent npm package is named in tests and prior deferred work. Either:
1. write the bridge ourselves (Bun lacks programmatic reporter API per prior #80, so it's a JUnit→JSON bridge script as already prototyped in `.forge/last-junit.xml`), and rename references to that script — NOT to a nonexistent npm name; OR
2. drop the `tdd-guard` gate from SKILL.md L227 receipt loop and from ship-blocking list L285, since the reporter that would feed it does not exist.
**Patch sketch (option 2, smaller):**
```diff
- for gate in derive-kind pbt-verify mutation-gate browser-verify tdd-guard; do
+ for gate in derive-kind pbt-verify mutation-gate browser-verify; do
```
plus delete L285 ship-block.

---

## Appendix A — Source URLs cited (web-fallback receipts)

- [@veritasacta/verify on npm](https://www.npmjs.com/package/@veritasacta/verify) — package exists, latest 0.6.0 (no docfork coverage; semantics ungrounded)
- [nizos/tdd-guard GitHub](https://github.com/nizos/tdd-guard), [tdd-guard on npm](https://www.npmjs.com/package/tdd-guard) — latest 1.6.8, reporters: Vitest/Jest/pytest/PHPUnit/Go/Rust/Ruby (no Bun)
- [tdd-guard configuration docs](https://github.com/nizos/tdd-guard/blob/main/docs/configuration.md)
- [Stryker `thresholds.break`](https://github.com/stryker-mutator/stryker-js/blob/master/packages/api/CHANGELOG.md#L1113-L1117) — confirmed configurable but no universal-cutoff guidance
- [fast-check Bun integration tutorial](https://github.com/dubzzz/fast-check/blob/main/website/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-bun-test-runner.md#L12-L24)
- [hyparquet on npm](https://www.npmjs.com/package/hyparquet), [hyparparam/hyparquet](https://github.com/hyparam/hyparquet) — 0 runtime deps, 1.25.8 latest
- [anthropics/skills webapp-testing/scripts/with_server.py](https://github.com/anthropics/skills/blob/main/webapp-testing/scripts/with_server.py) — script not module
- [AmElmo/proofshot GitHub](https://github.com/AmElmo/proofshot) + [proofshot on libraries.io](https://libraries.io/npm/proofshot) — real CLI

Cedar (`cedar-policy/cedar`) and `@veritasacta/verify` returned **zero relevant docfork hits**, marked [UNGROUNDED] / [PARTIAL-UNGROUNDED] respectively per the audit contract.

## Appendix B — Process receipts

- `.forge/audit/tool-trace.jsonl` — every MCP + ToolSearch + npm-probe + Snyk-unauth + delegation-blocked entry logged inline
- `.forge/routing-plan.md` — routing decisions per claim
- `.forge/dag.json` — 7 audit parcels (p01–p07)
- `.forge/council/*.json` — 6 personas + meta-judge (invoked inline; empty findings arrays because the markdown report IS the patch under review)
- `.forge/kind/*.txt` — all 7 parcels classified `infra` (markdown-only output) → mutation/pbt/browser gates correctly skipped per `forge/plugin/skills/derive-kind/SKILL.md:58-59`

## Appendix C — Prior audit cross-reference (from claude-mem)

This audit's findings are independent of, but cross-referenced against, prior observations #42 (2026-05-12 6:26pm, 9 architectural gaps), #69 (2026-05-13 1:06pm, 6 review parcels), #80 (2026-05-13 1:08pm, full audit trace), #112 / #113 / #128 (delegation primitives fix lifecycle). Top-5 #2 (mutation-gate `bc` bug) and #5 (`tdd-guard-bun` nonexistence) are NEW findings not previously surfaced. Top-5 #1 (delegation invariant) is induced by the harness gap encountered today and not by anything in the source.

---

*Audit complete. No code changes performed per brief. Forward to user for triage.*
