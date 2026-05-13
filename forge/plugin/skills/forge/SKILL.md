---
name: forge
description: Top-level runbook for /forge:forge. Plan → research → council → code → verify → ship with PBT + mutation + browser gates and signed audit chain.
when_to_use: forge-lead activates this at the start of each /forge run.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Task, TodoWrite, WebFetch, WebSearch
model: opus
---

# /forge runbook

Execute these phases in order. Stop on first ship-blocking failure. Every gate writes a `forge-meta` commit trailer.

## Phase 0 — Bootstrap (run before any phase)

```bash
# git ops below must work even when the workspace is owned by a different user.
git config --global --add safe.directory '*'
git config --global --add safe.directory "$(pwd)"
```

## Phase 1 — Plan (delegate to feature-dev)

forge-lead does **not** decompose the brief itself. Mandatory dispatch — no inline planning, no exceptions.

```bash
mkdir -p .forge .forge/kind .forge/pbt .forge/mutation .forge/browser .forge/receipts .forge/council .forge/audit
```

Eligibility check (forge-lead does this inline BEFORE the dispatch): single repo, single package only. BAIL ONLY if the brief spans multiple repos or multiple packages — never bail on a single-target brief, even if its only changes are config or infra (those parcels classify as `kind=config|infra` in Phase 5 and skip gates; they do NOT skip Phase 1).

REQUIRED dispatch:

```
Task(
  subagent_type="feature-dev:feature-dev",
  model="opus",
  prompt="Decompose the following brief into independent parcels for the forge pipeline.
          Output strictly the JSON for .forge/dag.json with shape
            { parcels: [ { id, claim, paths, deps, research: [] }, ... ] }.
          Brief: <verbatim user brief>"
)
```

After the dispatch returns, forge-lead writes the result verbatim to `.forge/dag.json` and appends one line to `.forge/audit/tool-trace.jsonl`:

```json
{"kind":"task","subagent_type":"feature-dev:feature-dev","model":"opus","phase":"plan"}
```

**Audit invariant (delegation):** after Phase 1 completes, `.forge/audit/tool-trace.jsonl` MUST contain at least one entry with `subagent_type: "feature-dev:feature-dev"`. forge-lead authoring `dag.json` from its own context is a verify-gate failure regardless of the dag's correctness — the trace is the receipt.

## Phase 2 — Research (mandatory MCP calls, routed by claim type, FIRST-CHOICE order)

For every parcel, consult the **first-choice** MCP for each claim type. Web research is a FALLBACK, not a first stop — only escalate to web when the canonical tool misses or the claim is inherently web-shaped (recent news, philosophy, broad topic research).

| Claim type | First choice (try first) | Fallback (only if first misses) |
|---|---|---|
| Library / package API (npm, pip, cargo, go.mod imports) | `mcp__docfork__search_docs` + `mcp__docfork__fetch_doc` | `WebFetch` on docs site / `mcp__github__get_file_contents` on lib repo |
| Upstream repo semantics, behavior, recent change history | `mcp__deepwiki__ask_question` | `mcp__github__*` / `gh` CLI / `WebFetch` on repo |
| GitHub PR/issue/commit context across repos | `mcp__github__*` (`gh` CLI for single repo) | `WebFetch` on PR/issue URL |
| Our prior runs / lessons / cross-session memory | `mcp__plugin_claude-mem*` | (no fallback — always first, no substitute) |
| Recent / year-bounded web facts (CVEs published this month, new RFCs) | `WebSearch` (Exa if available) | `WebFetch` on cited URLs |
| Abstract / subjective topic research (best practices, design patterns, philosophy) | `WebSearch` | `WebFetch` |
| Database schema / SQL behavior | `psql` / `mongosh` / project ORM CLI | (no fallback — direct only) |
| Security / dep scan / CVE check | `mcp__snyk__*` (Snyk MCP — invoke even unauthenticated; the call attempt is the audit signal, partial results are fine) | `WebSearch` for advisories |
| SaaS integration semantics | `mcp__composio__*` | `WebFetch` on provider docs |

**Rule of thumb:** docs first via canonical MCP, web second when canonical misses. Going straight to web for a library that's covered by docfork is a violation of the contract.

### Pre-research routing classifier (mandatory before research begins)

Before invoking any research MCP, scan each parcel claim for these keywords and write the routing decision to `.forge/routing-plan.md`:

| If brief mentions… | Route to (BEFORE other MCPs) |
|---|---|
| `CVE`, `vulnerability`, `audit dependencies`, `security scan`, `dep scan`, `package security`, `npm audit`, `dependency vulnerabilities` | `mcp__snyk__*` |
| `recent`, `2025`, `2026`, `latest`, `news`, `current state of`, `philosophy of`, `best practices` | `WebSearch` (Exa if available) |
| Specific GitHub repo by owner/name (`django/django`, `astropy/astropy`) | `mcp__deepwiki__*` |
| npm/pip/cargo package name (`ts-pattern`, `lodash`, `requests`) | `mcp__docfork__*` |
| GitHub PR number, issue number, commit sha | `mcp__github__*` |

If a brief touches multiple categories, route to ALL applicable MCPs — not just one. Snyk MUST fire when the brief mentions security/CVE/vulnerability/audit terms regardless of what other claims also need research.

`.forge/routing-plan.md` format:
```
- claim: "audit npm deps for CVEs"
  route: mcp__snyk__*  (matched: 'CVE', 'audit', 'deps')
- claim: "uses ts-pattern library"
  route: mcp__docfork__*  (matched: npm package 'ts-pattern')
```

**Training-data-only research is forbidden.** Even if you "know" how `django.db.models.Aggregate` works, call docfork or deepwiki BEFORE writing the patch. The audit trace is the receipt.

Forbidden shortcut: replying "I already know X, no MCP needed". That's a verify-gate failure regardless of patch correctness.

Append findings to each parcel's `research:` field. Reject the plan if any external claim is unsourced.

**Audit invariant:** `audit/tool-trace.jsonl` MUST contain:
- ≥1 `mcp__plugin_claude-mem*` entry per run (always check prior context first)
- For each distinct **library** named in any parcel: ≥1 `mcp__docfork__*` entry
- For each distinct **upstream repo** named in any parcel: ≥1 `mcp__deepwiki__*` entry
- For each **recent/year-bounded** claim: ≥1 `WebSearch` / `WebFetch` / Exa entry
- For each **CVE / security** claim: ≥1 `mcp__snyk__*` entry

If any required tool for a claim is missing, the verify phase REJECTS the run — re-enter Phase 2 and call it. Do not proceed with stale or training-data-only research.

## Phase 3 — Council (≥ 80 confidence filter)

Single Task batch dispatching all 6 in parallel:
- pr-review-toolkit:silent-failure-hunter
- pr-review-toolkit:type-design-analyzer
- pr-review-toolkit:code-reviewer
- pr-review-toolkit:code-simplifier
- pr-review-toolkit:comment-analyzer
- pr-review-toolkit:pr-test-analyzer

Each persona's findings go to `.forge/council/<persona>.json` with `confidence` 0-100.

Meta-judge (fresh context): drop confidence < 80, group remaining by parcel, write `.forge/council/meta-judge.json` with `must_fix`.

**Council is unconditional.** Even for one-line bug fixes. Even when "obviously correct". Even when the brief is a typo correction. Skipping council = verify-gate failure regardless of patch correctness. Do not let perceived simplicity override the contract.

**Audit invariant:** after Phase 3 completes, `.forge/council/` MUST contain at least 6 persona JSON files + 1 `meta-judge.json`. Verify phase rejects the run if any are missing.

## Phase 4 — Code (delegate to ralph-loop)

forge-lead does **not** write code itself. For every parcel, dispatch a ralph-loop worker — each worker runs in its own context and its own worktree.

**Parallelism mandate:** parcels with no unmet `deps` run in a SINGLE Task batch (one assistant message containing N parallel `Task(...)` calls). Mirror the Phase 3 council batch pattern. Serial dispatch of independent parcels is a verify-gate failure.

Per parcel, before dispatch:

```bash
git worktree add .forge/wt/<parcel-id> -b forge/<parcel-id>
# WorktreeCreate hook fires worktree-create-jj.sh → jj util snapshot
```

REQUIRED dispatch (batched in parallel for independent parcels):

```
Task(
  subagent_type="ralph-loop:ralph-loop",
  model="opus",
  prompt="Implement parcel <parcel-id> in worktree .forge/wt/<parcel-id>.
          Discipline: red test → impl → green; tdd-guard enforced.
          Claim: <parcel.claim>
          Paths: <parcel.paths>
          Must-fix from Phase 3 council meta-judge: <parcel.must_fix>
          Research context: <parcel.research>
          On red failure: jj op restore <pre-parcel-snapshot>; one retry."
)
```

After each worker returns, forge-lead appends one line per parcel to `.forge/audit/tool-trace.jsonl`:

```json
{"kind":"task","subagent_type":"ralph-loop:ralph-loop","model":"opus","phase":"code","parcel":"<parcel-id>"}
```

On worker failure: `jj op restore <pre-parcel-snapshot>`, re-dispatch ralph-loop once with the failure report appended to the brief. Two consecutive failures on the same parcel → halt that parcel and continue the others. forge-lead writing the parcel's code inline as a fallback is FORBIDDEN.

**Audit invariant (delegation):** after Phase 4 completes, `.forge/audit/tool-trace.jsonl` MUST contain at least one entry with `subagent_type: "ralph-loop:ralph-loop"` AND a matching `parcel` field for EVERY parcel id in `.forge/dag.json`. Verify phase rejects the run if any parcel is missing — forge-lead writing parcel code inline is a verify-gate failure regardless of patch correctness.

## Phase 5 — Verify (parallel per parcel)

```bash
# 5a. derive-kind
KIND=$(claude -p "/forge:derive-kind <parcel-id>" --model opus | tr -d '[:space:]')
echo "$KIND" > .forge/kind/<parcel-id>.txt
# Routing:
#   pure-fn → mutation+pbt required, browser skipped
#   io      → mutation+pbt(if pure boundary) required, browser skipped
#   ui      → mutation+browser required, pbt optional
#   config  → all skipped
#   infra   → all skipped

# 5b. pbt-verify (REQUIRED for pure-fn; OPTIONAL for io if it has a pure boundary; SKIP for ui/config/infra)
case "$KIND" in
  pure-fn)
    claude -p "/forge:pbt-verify <parcel-id>" --model opus
    test -f .forge/pbt/<parcel-id>.json || { echo "pbt-verify did not produce artifact"; exit 1; }
    ;;
  io)
    # only if the parcel exposes a pure-fn boundary; otherwise skip
    claude -p "/forge:pbt-verify <parcel-id>" --model opus || true
    ;;
esac

# 5c. mutation-gate (REQUIRED for pure-fn, io, ui — write .forge/mutation/<parcel-id>.json)
case "$KIND" in
  pure-fn|io|ui)
    claude -p "/forge:mutation-gate <parcel-id>" --model opus
    test -f .forge/mutation/<parcel-id>.json || { echo "mutation gate did not produce artifact"; exit 1; }
    ;;
esac

# 5d. browser-verify (UI only)
[ "$KIND" = "ui" ] && claude -p "/forge:browser-verify <parcel-id>" --model opus
```

Any gate fail → re-enter Phase 4 with the failing report. Two consecutive fails on the same parcel → halt the DAG.

## Phase 6 — Ship

```bash
# 1. forge generates one signed receipt per verify gate using `@veritasacta/verify sign-payload`.
#    Each receipt is `{payload, signature}` with a hex Ed25519 sig (128 chars).
#
#    Granularity: GATE-LEVEL, not per-tool-call. The runbook signs the JSON artifact each gate
#    (derive-kind / pbt-verify / mutation-gate / browser-verify / tdd-guard) writes to .forge/.
#    Per-tool-call signing requires upstream protect-mcp PreToolUse/PostToolUse hooks; the
#    upstream package's current hooks (v0.5.5) shell out to obsolete `evaluate`/`sign`
#    subcommands, so forge's install.ts deliberately leaves those hook files empty (no-op,
#    not active-overwrite). When upstream protect-mcp v2 ships working hooks, those receipts
#    will land in .forge/receipts/ alongside the gate-level ones — no SKILL.md change needed.
mkdir -p .forge/receipts
for gate in derive-kind pbt-verify mutation-gate browser-verify tdd-guard; do
  [ -f .forge/$gate*.json ] && \
    npx -y @veritasacta/verify sign-payload \
      --in .forge/$gate*.json \
      --out .forge/receipts/$gate.json
done

# 2. Verify chain offline:
npx -y @veritasacta/verify .forge/receipts/

# 3. Write forge-meta trailers — MANDATORY (runs regardless of how step 1 produced receipts).
#
#    Append-only invariant: any commit reachable from forge-meta BEFORE this run MUST still be
#    reachable AFTER this run. Test this by reading the prior tip sha first, then asserting it's
#    in `git log forge-meta` after the new commits.
#
#    PROHIBITED (destroys prior work):
#      ❌ git checkout -B forge-meta       — recreates branch at HEAD, loses prior commits
#      ❌ git branch -f forge-meta         — force-moves ref, loses prior commits
#      ❌ git branch -D forge-meta && ...  — deletes branch
#      ❌ git reset --hard <anything>      — only safe on detached HEAD or feature branches
#      ❌ git update-ref refs/heads/forge-meta  — direct ref manipulation
#
#    REQUIRED:
PRIOR_SHA=$(git rev-parse --verify forge-meta 2>/dev/null || true)
if [ -n "$PRIOR_SHA" ]; then
  git checkout forge-meta              # land on existing tip; new commits append to it
else
  git checkout -b forge-meta           # first run, branch doesn't exist
fi
# After all trailer commits below, verify append-only invariant:
#   [ -z "$PRIOR_SHA" ] || git merge-base --is-ancestor "$PRIOR_SHA" forge-meta || \
#     { echo "FATAL: prior forge-meta commit $PRIOR_SHA was lost"; exit 1; }
for receipt in .forge/receipts/*.json; do
  GATE=$(jq -r .payload.gate $receipt 2>/dev/null || jq -r .gate $receipt)
  RESULT=$(jq -r '.payload.result // .result' $receipt)
  SCORE=$(jq -r '.payload.score // .score // "n/a"' $receipt)
  CONF=$(jq -r '.payload.confidence // .confidence // "n/a"' $receipt)
  git commit --allow-empty -m "forge: $GATE" \
    --trailer "Decision-Gate: $GATE" \
    --trailer "Decision-Result: $RESULT" \
    --trailer "Decision-Score: $SCORE" \
    --trailer "Decision-Confidence: $CONF"
done
git fsck --strict

# 4. Open PR via feature-dev's gh integration. PR body includes parcel summary, mutation scores, PBT verdicts, screenshot links, audit-chain link.
# 5. Stop hook fires apprise dispatch (apprise.urls list).
```

## Ship-blocking gates (any one → no PR)

- Phase 1 delegation missing: no `subagent_type: "feature-dev:feature-dev"` entry in `audit/tool-trace.jsonl`
- Phase 4 delegation missing: any parcel id in `dag.json` lacks a `subagent_type: "ralph-loop:ralph-loop"` entry with matching `parcel` field in `audit/tool-trace.jsonl`
- council finding ≥ 80 confidence unaddressed
- mutation-gate score < 0.80 on any code-bearing parcel
- pbt-verify PARTIAL with FAILED counterexample on any pure-fn parcel
- browser-verify console error or 4xx/5xx on any UI parcel
- tdd-guard non-test edit while red
- protect-mcp Cedar denial in chain (only fires when upstream protect-mcp v2 ships working PreToolUse hooks; today this gate is a no-op pending hook-level signing)
- `npx @veritasacta/verify` fails on chain
- stub-warn flagged stub reaching merge

## Output contract

```
.forge/dag.json                    — parcel DAG with research + must_fix
.forge/council/<persona>.json      — all 6 personas + meta-judge
.forge/kind/<parcel>.txt           — derive-kind classification
.forge/pbt/<parcel>.json           — PBT verdict + .test.ts artifact
.forge/mutation/<parcel>.json      — mutation score + raw stryker.json
.forge/browser/<parcel>.proofshot  — UI parcel bundle
.forge/receipts/*.json             — Ed25519 hash-chained signed receipts
forge-meta branch                  — Decision-Gate trailer commits, git fsck clean
PR draft / open                    — diff + audit-chain link
```
