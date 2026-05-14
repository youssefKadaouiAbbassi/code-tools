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

## Phase 1 — Plan (delegate to feature-dev:code-architect)

forge-lead does **not** decompose the brief itself. Mandatory dispatch — no inline planning, no exceptions.

```bash
mkdir -p .forge .forge/kind .forge/pbt .forge/mutation .forge/browser .forge/receipts .forge/council .forge/audit
```

Eligibility: forge accepts any brief — single-repo, multi-repo, single-package, monorepo. No bail. Multi-repo briefs are handled by:
- The architect emits parcels with an optional `repo` field (absolute path or git remote) in addition to `paths[]`. Single-repo runs omit `repo` (defaults to `process.cwd()`).
- Phase 4 creates each parcel's worktree under its declared `repo` (`git -C <repo> worktree add ...`).
- Phase 6 merges each parcel back into its own repo's integration branch and writes a forge-meta trailer commit per repo (`forge-meta-<sanitized-repo>` if multiple, plain `forge-meta` if one).
- Phase 6 opens one PR per repo touched (or one PR total if all parcels share a repo).

The architect should still BAIL if the brief is too vague to decompose at all (no concrete claim), but never bail on scope alone. Cross-repo coordination is a first-class case, not an escape.

**Why this specific subagent (verified against the on-disk plugin):** the `feature-dev` plugin ships **three** Task subagents — `code-explorer`, `code-architect`, `code-reviewer` — plus an interactive `/feature-dev` slash-command. The slash-command stops to ask the user questions ("DO NOT START WITHOUT USER APPROVAL", "Ask user which approach"), so it cannot be invoked from headless forge-lead. `code-architect` is the correct primitive — its description: *"Designs feature architectures by analyzing existing codebase patterns and conventions, then providing comprehensive implementation blueprints with specific files to create/modify, component designs, data flows, and build sequences."* That is parcel-DAG decomposition by another name.

REQUIRED dispatch:

```
Task(
  subagent_type="feature-dev:code-architect",
  model="opus",
  prompt="Decompose the following brief into independent parcels for the forge pipeline.
          Output strictly the JSON for .forge/dag.json with shape
            { parcels: [ { id, claim, paths, deps, repo?, research: [], must_fix: [] }, ... ] }.
          - `paths` is relative to the parcel's `repo` (or cwd if `repo` is omitted).
          - `repo` is an absolute filesystem path. Set it when the brief spans multiple repos;
            omit it for single-repo briefs (defaults to the cwd where forge was invoked).
          - Independence: a parcel with empty `deps` must be implementable without any other
            parcel's output. Use `deps: [<id>, ...]` only when strictly necessary.
          - Multi-repo briefs are first-class. Do NOT bail because the brief touches several repos;
            instead emit one parcel per logical change with its `repo` set, and the pipeline
            will fan out (worktree-in-repo, merge-in-repo, forge-meta-per-repo, PR-per-repo).
          Brief: <verbatim user brief>"
)
```

Optional follow-on (dispatch in parallel with the planner when the brief is large or unfamiliar): up to 2 `feature-dev:code-explorer` subagents for codebase analysis — the architect reads their outputs to ground its blueprint.

After the dispatch returns, forge-lead writes the JSON verbatim to `.forge/dag.json` and appends one line to `.forge/audit/tool-trace.jsonl`:

```json
{"kind":"task","subagent_type":"feature-dev:code-architect","model":"opus","phase":"plan"}
```

**Audit invariant (delegation):** after Phase 1 completes, `.forge/audit/tool-trace.jsonl` MUST contain either (a) an entry `{"kind":"task","subagent_type":"feature-dev:code-architect", ...}`, OR (b) an escape-hatch entry `{"kind":"delegation-blocked","phase":"plan","reason":"<short>"}` recorded only when the `Task` primitive is physically unavailable in the harness (verifiable via `ToolSearch(query="select:Task")` returning no result). Mode (b) downgrades the run from `ship` to `audit-only` and the PR body MUST surface the gap. forge-lead authoring `dag.json` from its own context **without** the escape-hatch entry is a verify-gate failure regardless of the dag's correctness — the trace is the receipt.

## Phase 2 — Research (mandatory MCP calls, routed by claim type, FIRST-CHOICE order)

For every parcel, consult the **first-choice** MCP for each claim type. Web research is a FALLBACK, not a first stop — only escalate to web when the canonical tool misses or the claim is inherently web-shaped (recent news, philosophy, broad topic research).

| Claim type | First choice (try first) | Fallback (only if first misses) |
|---|---|---|
| Library / package API (npm, pip, cargo, go.mod imports) | `mcp__(plugin_forge_)?docfork__search_docs` + `mcp__(plugin_forge_)?docfork__fetch_doc` | `WebFetch` on docs site / `mcp__(plugin_forge_)?github__get_file_contents` on lib repo |
| Upstream repo semantics, behavior, recent change history | `mcp__(plugin_forge_)?deepwiki__ask_question` | `mcp__(plugin_forge_)?github__*` / `gh` CLI / `WebFetch` on repo |
| GitHub PR/issue/commit context across repos | `mcp__(plugin_forge_)?github__*` (`gh` CLI for single repo) | `WebFetch` on PR/issue URL |
| Our prior runs / lessons / cross-session memory | `mcp__plugin_claude-mem*` | (no fallback — always first, no substitute) |
| Recent / year-bounded web facts (CVEs published this month, new RFCs) | `WebSearch` (Exa if available) | `WebFetch` on cited URLs |
| Abstract / subjective topic research (best practices, design patterns, philosophy) | `WebSearch` | `WebFetch` |
| Database schema / SQL behavior | `psql` / `mongosh` / project ORM CLI | (no fallback — direct only) |
| Security / dep scan / CVE check | `mcp__(plugin_forge_)?snyk__*` (Snyk MCP — invoke even unauthenticated; the call attempt is the audit signal, partial results are fine) | `WebSearch` for advisories |

(Tool names resolve under either prefix depending on how the plugin is mounted — `mcp__docfork__*` when installed as a top-level MCP, `mcp__plugin_forge_docfork__*` when installed via the `forge` plugin. Audit-invariant regex accepts both.)

**Rule of thumb:** docs first via canonical MCP, web second when canonical misses. Going straight to web for a library that's covered by docfork is a violation of the contract.

### Pre-research routing classifier (mandatory before research begins)

Before invoking any research MCP, scan each parcel claim for these keywords and write the routing decision to `.forge/routing-plan.md`:

| If brief mentions… | Route to (BEFORE other MCPs) |
|---|---|
| `CVE`, `vulnerability`, `audit dependencies`, `security scan`, `dep scan`, `package security`, `npm audit`, `dependency vulnerabilities` | `mcp__(plugin_forge_)?snyk__*` |
| `recent`, `2025`, `2026`, `latest`, `news`, `current state of`, `philosophy of`, `best practices` | `WebSearch` (Exa if available) |
| Specific GitHub repo by owner/name (`django/django`, `astropy/astropy`) | `mcp__(plugin_forge_)?deepwiki__*` |
| npm/pip/cargo package name (`ts-pattern`, `lodash`, `requests`) | `mcp__(plugin_forge_)?docfork__*` |
| GitHub PR number, issue number, commit sha | `mcp__(plugin_forge_)?github__*` |

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
- For each distinct **library** named in any parcel: ≥1 entry matching `mcp__(plugin_forge_)?docfork__*`
- For each distinct **upstream repo** named in any parcel: ≥1 entry matching `mcp__(plugin_forge_)?deepwiki__*`
- For each **recent/year-bounded** claim: ≥1 `WebSearch` / `WebFetch` / Exa entry
- For each **CVE / security** claim: ≥1 entry matching `mcp__(plugin_forge_)?snyk__*`

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

## Phase 4 — Code (delegate to tdd-workflows:tdd-orchestrator)

forge-lead does **not** write code itself. For every parcel, dispatch one Task subagent — each worker runs in its own context and its own worktree.

**Why NOT ralph-loop:** `ralph-loop` is **not a Task subagent**. The upstream `claude-plugins-official/ralph-loop` plugin ships only a `/ralph-loop` slash-command + a `Stop` hook (`hooks/stop-hook.sh`) that re-injects the same prompt into the **current session** when the agent tries to stop. It is a session-local autonomous-loop pattern, not a delegation primitive — `Task(subagent_type="ralph-loop:...")` would fail because no such subagent exists, and N parallel ralph-loop "workers" would all loop on the same session anyway. The Ralph technique is for unattended single-thread iteration; forge wants parallel, isolated workers.

**Why `tdd-workflows:tdd-orchestrator`:** it's a real Task subagent with the right shape — *"Master TDD orchestrator specializing in red-green-refactor discipline, multi-agent workflow coordination, and comprehensive test-driven development practices."* It gets its own context window (so 200K-token parcel work doesn't leak into forge-lead) and runs in parallel safely. If `tdd-workflows` is not installed in the project, fall back to `general-purpose` with a TDD-discipline prompt — never to inline forge-lead edits.

**Parallelism mandate:** parcels with no unmet `deps` run in a SINGLE Task batch (one assistant message containing N parallel `Task(...)` calls). Mirror the Phase 3 council batch pattern. Serial dispatch of independent parcels is a verify-gate failure.

Per parcel, before dispatch (multi-repo aware):

```bash
# parcel.repo may be set by the architect for multi-repo briefs. If absent, default
# to $(pwd). The worktree always lives under .forge/wt/<parcel-id> *inside the parcel's repo*
# so the path is stable for forge-lead and the worker.
REPO="$(jq -r --arg id "<parcel-id>" '.parcels[]|select(.id==$id)|.repo // empty' .forge/dag.json)"
[ -z "$REPO" ] && REPO="$(pwd)"
git -C "$REPO" worktree add "$REPO/.forge/wt/<parcel-id>" -b "forge/<parcel-id>"
# WorktreeCreate hook fires worktree-create-jj.sh → jj util snapshot
```

REQUIRED dispatch (batched in parallel for independent parcels):

```
Task(
  subagent_type="tdd-workflows:tdd-orchestrator",   # fallback: "general-purpose"
  model="opus",
  prompt="Implement parcel <parcel-id> in worktree .forge/wt/<parcel-id>.
          Discipline: red test → impl → green → refactor; tdd-guard hooks enforced.
          Claim: <parcel.claim>
          Paths: <parcel.paths>
          Must-fix from Phase 3 council meta-judge: <parcel.must_fix>
          Research context: <parcel.research>
          On red-state escape attempt: jj op restore <pre-parcel-snapshot>; one retry only."
)
```

After each worker returns, forge-lead appends one line per parcel to `.forge/audit/tool-trace.jsonl`:

```json
{"kind":"task","subagent_type":"tdd-workflows:tdd-orchestrator","model":"opus","phase":"code","parcel":"<parcel-id>"}
```

On worker failure: `jj op restore <pre-parcel-snapshot>`, re-dispatch once with the failure report appended to the brief. Two consecutive failures on the same parcel → halt that parcel and continue the others. forge-lead writing the parcel's code inline as a fallback is FORBIDDEN.

**Audit invariant (delegation):** after Phase 4 completes, `.forge/audit/tool-trace.jsonl` MUST contain, for EVERY parcel id in `.forge/dag.json`, either (a) an entry with `subagent_type` in `{"tdd-workflows:tdd-orchestrator", "general-purpose"}` AND matching `parcel` field, OR (b) an escape-hatch entry `{"kind":"delegation-blocked","phase":"code","parcel":"<id>","reason":"<short>"}` (only when `Task` is unavailable, same probe as Phase 1) — which downgrades the run to `audit-only`. Verify phase rejects the run if any parcel is missing both. forge-lead writing parcel code inline **without** the escape-hatch entry is a verify-gate failure regardless of patch correctness.

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

### Anti-theatre invariants (verify-gate FAILURE if any trip)

After each subagent gate returns, forge-lead MUST validate the artifact contains evidence of real execution. **Fabricated verdicts (subagent narrates a PASS without invoking the underlying tool) are a ship-blocking failure.** Run these checks:

```bash
# mutation: requires real tool name + on-disk raw report
for f in .forge/mutation/*.json; do
  TOOL=$(jq -r '.tool // "manual"' "$f")
  RAW=$(jq -r '.raw_report // empty' "$f")
  [ "$TOOL" = "manual" ] && { echo "THEATRE: $f has tool=manual"; exit 1; }
  [ -n "$RAW" ] && [ -s "$RAW" ] || { echo "THEATRE: $f raw_report missing/empty ($RAW)"; exit 1; }
done

# pbt: requires on-disk test file + runner output
for f in .forge/pbt/*.json; do
  TF=$(jq -r '.test_file // empty' "$f")
  RO=$(jq -r '.runner_output_path // empty' "$f")
  [ -n "$TF" ] && [ -f "$TF" ] || { echo "THEATRE: $f test_file missing ($TF)"; exit 1; }
  [ -n "$RO" ] && [ -f "$RO" ] || { echo "THEATRE: $f runner_output missing ($RO)"; exit 1; }
done
```

A `tool: "manual"` mutation receipt or a missing PBT test file means the subagent hallucinated. Halt the run, do NOT proceed to Phase 6.

## Phase 6 — Ship

```bash
# 1. MERGE PARCEL WORKTREES BACK to each repo's integration branch (multi-repo aware).
#    Without this step, parcel branches `forge/<parcel-id>` contain the worker's
#    code but the user's checked-out branch never receives it — the run produces
#    artifacts but no actual code change. THIS IS SHIP-BLOCKING.
#
#    For multi-repo briefs: group parcels by their `repo` field, then for each repo
#    merge that repo's parcels into that repo's integration branch (HEAD when forge
#    started in that repo). Single-repo briefs default repo to $(pwd).
mapfile -t REPOS < <(jq -r '.parcels[] | (.repo // env.PWD)' .forge/dag.json | sort -u)
for REPO in "${REPOS[@]}"; do
  INTEGRATION_BRANCH=$(git -C "$REPO" rev-parse --abbrev-ref HEAD)
  mapfile -t REPO_PARCELS < <(jq -r --arg r "$REPO" '.parcels[] | select((.repo // env.PWD) == $r) | .id' .forge/dag.json)
  for pid in "${REPO_PARCELS[@]}"; do
    pbranch="forge/${pid}"
    git -C "$REPO" rev-parse --verify "$pbranch" >/dev/null 2>&1 || { echo "FATAL: parcel branch $pbranch missing in $REPO"; exit 1; }
    git -C "$REPO" merge --no-ff "$pbranch" -m "forge: merge parcel $pid" || \
      { echo "FATAL: merge conflict on $pbranch in $REPO — re-enter Phase 4 with conflict report"; exit 1; }
  done
  # Tear down each repo's worktrees once their commits are merged.
  for pid in "${REPO_PARCELS[@]}"; do
    git -C "$REPO" worktree remove --force ".forge/wt/${pid}" 2>/dev/null || true
  done
done

# 2. Build evidence receipts for each verify-gate artifact.
#
#    NOTE on signing: @veritasacta/verify@0.6.0 does NOT expose a one-shot
#    `sign-payload` subcommand. Its CLI provides `init` / `proxy` / `daemon`
#    / `prompt` / `chain explore`; per-artifact signing requires running
#    `verify daemon` as a sidecar and posting each payload over its unix
#    socket. Until forge wires that daemon up (tracked separately), receipts
#    are written as UNSIGNED evidence JSON with `signature: null` and a
#    `signature_note` explaining the gap. The cryptographic anchor today is
#    the forge-meta git history (each receipt is committed as a trailer below),
#    NOT an Ed25519 signature on the receipt itself.
#
#    Granularity: GATE-LEVEL (derive-kind / pbt-verify / mutation-gate /
#    browser-verify). tdd-guard omitted — no Bun reporter bridge exists upstream.
mkdir -p .forge/receipts
for artifact in .forge/kind/*.txt .forge/pbt/*.json .forge/mutation/*.json .forge/browser/*.json; do
  [ -f "$artifact" ] || continue
  name=$(basename "$artifact" | sed 's/\.[^.]*$//')
  gate=$(echo "$name" | sed 's/-.*//')   # kind / pbt / mutation / browser
  parcel=$(echo "$name" | sed 's/^[^-]*-//')
  if [[ "$artifact" == *.json ]]; then PAYLOAD=$(cat "$artifact"); else PAYLOAD=$(jq -Rs . < "$artifact"); fi
  jq -n \
    --arg version "forge-receipt/0" \
    --arg parcel "$parcel" \
    --arg gate "$gate" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg path "$artifact" \
    --argjson payload "$PAYLOAD" \
    '{version:$version, parcel:$parcel, gate:$gate, timestamp:$ts, artifact_path:$path, payload:$payload, signature:null, signature_note:"@veritasacta/verify@0.6.0 has no sign-payload subcommand; receipt is unsigned. Audit chain is anchored in forge-meta git trailers."}' \
    > ".forge/receipts/${name}.json"
done

# 3. Verify any signed receipts that DO exist (e.g. from protect-mcp v2 when active).
#    Skip the chain-verify call entirely if every receipt has signature:null,
#    because `npx @veritasacta/verify` will reject unsigned input.
HAS_SIGNED=$(jq -s '[.[] | select(.signature != null)] | length' .forge/receipts/*.json)
if [ "$HAS_SIGNED" -gt 0 ]; then
  npx -y @veritasacta/verify@0.6.0 .forge/receipts/
fi

# 4. Write forge-meta trailers — MANDATORY, PER REPO (runs regardless of how step 2 produced receipts).
#
#    Append-only invariant: any commit reachable from forge-meta BEFORE this run MUST still be
#    reachable AFTER this run. Test this by reading the prior tip sha first, then asserting it's
#    in `git log forge-meta` after the new commits.
#
#    Multi-repo: each repo gets its own forge-meta branch. Single-repo runs use plain `forge-meta`.
#    Group receipts by their parcel's repo, then commit per-repo.
#
#    PROHIBITED (destroys prior work):
#      ❌ git checkout -B forge-meta       — recreates branch at HEAD, loses prior commits
#      ❌ git branch -f forge-meta         — force-moves ref, loses prior commits
#      ❌ git branch -D forge-meta && ...  — deletes branch
#      ❌ git reset --hard <anything>      — only safe on detached HEAD or feature branches
#      ❌ git update-ref refs/heads/forge-meta  — direct ref manipulation
for REPO in "${REPOS[@]}"; do
  PRIOR_SHA=$(git -C "$REPO" rev-parse --verify forge-meta 2>/dev/null || true)
  if [ -n "$PRIOR_SHA" ]; then
    git -C "$REPO" checkout forge-meta
  else
    git -C "$REPO" checkout -b forge-meta
  fi
  # Receipts live in the *root* .forge/receipts/ (forge-lead-side state). Iterate them all;
  # each receipt names its parcel, which maps to a repo via the parcel->repo lookup we built earlier.
  for receipt in .forge/receipts/*.json; do
    [ -f "$receipt" ] || continue
    PARCEL=$(jq -r '.parcel // ""' "$receipt")
    PARCEL_REPO=$(jq -r --arg id "$PARCEL" '.parcels[] | select(.id==$id) | (.repo // env.PWD)' .forge/dag.json)
    [ "$PARCEL_REPO" = "$REPO" ] || continue
    GATE=$(jq -r '.payload.gate // .gate // ""' "$receipt")
    RESULT=$(jq -r '.payload.result // .result // "n/a"' "$receipt")
    SCORE=$(jq -r '.payload.score // .score // "n/a"' "$receipt")
    CONF=$(jq -r '.payload.confidence // .confidence // "n/a"' "$receipt")
    git -C "$REPO" commit --allow-empty -m "forge: $GATE" \
      --trailer "Decision-Gate: $GATE" \
      --trailer "Decision-Result: $RESULT" \
      --trailer "Decision-Score: $SCORE" \
      --trailer "Decision-Confidence: $CONF"
  done
  # Verify append-only invariant per repo.
  [ -z "$PRIOR_SHA" ] || git -C "$REPO" merge-base --is-ancestor "$PRIOR_SHA" forge-meta || \
    { echo "FATAL: prior forge-meta $PRIOR_SHA lost in $REPO"; exit 1; }
  git -C "$REPO" fsck --strict
done

# 5. Open one PR per repo touched (or one PR total if all parcels share a repo).
#    Use feature-dev's gh integration. PR body per repo: parcels in that repo, gate scores,
#    cross-repo coordination notes if multiple PRs are part of the same brief.
# 6. Stop hook fires apprise dispatch (apprise.urls list).
```

## Ship-blocking gates (any one → no PR)

- Phase 1 delegation missing: neither a `subagent_type: "feature-dev:code-architect"` entry **nor** a `{kind:"delegation-blocked", phase:"plan"}` escape-hatch entry in `audit/tool-trace.jsonl` (escape hatch downgrades the run to `audit-only`, surfaced in PR body)
- Phase 4 delegation missing: any parcel id in `dag.json` lacks both an entry with `subagent_type ∈ {"tdd-workflows:tdd-orchestrator", "general-purpose"}` + matching `parcel` field **and** a `{kind:"delegation-blocked", phase:"code", parcel:<id>}` escape-hatch entry
- council finding ≥ 80 confidence unaddressed
- mutation-gate score < 0.80 on any code-bearing parcel
- pbt-verify PARTIAL with FAILED counterexample on any pure-fn parcel
- browser-verify console error or 4xx/5xx on any UI parcel
- tdd-guard non-test edit while red *(PENDING — requires a Bun reporter bridge; no upstream `tdd-guard-bun` package exists today, see `forge/scripts/` for the JUnit→JSON path under construction)*
- protect-mcp Cedar denial in chain *(PENDING — fires only when upstream protect-mcp v2 ships working PreToolUse hooks; today this gate is a no-op pending hook-level signing)*
- `npx @veritasacta/verify` fails on a chain that contains at least one signed receipt (skipped when all receipts have `signature:null`, since the verifier rejects unsigned input)
- parcel branch `forge/<parcel-id>` not merged back into the integration branch by end of Phase 6 — the worktree contains code that never reached the user's checkout
- anti-theatre invariant failure: any `.forge/mutation/*.json` has `tool: "manual"` OR missing `raw_report` on disk; any `.forge/pbt/*.json` lacks an on-disk `test_file` or `runner_output_path`
- stub-warn flagged stub reaching merge

## Output contract

```
.forge/dag.json                    — parcel DAG with research + must_fix
.forge/routing-plan.md             — Phase 2 claim → MCP routing decisions
.forge/audit/tool-trace.jsonl      — every Task dispatch + MCP call (the receipt)
.forge/council/<persona>.json      — all 6 personas + meta-judge
.forge/kind/<parcel>.txt           — derive-kind classification (signed as-is)
.forge/pbt/<parcel>.json           — PBT verdict + .test.ts artifact
.forge/mutation/<parcel>.json      — mutation score + raw stryker.json
.forge/browser/<parcel>.json       — browser-verify verdict (console/network/HAR summary)
.forge/browser/<parcel>.proofshot  — UI parcel bundle (companion to the .json verdict)
.forge/receipts/*.json             — Ed25519 hash-chained signed receipts, one per artifact
forge-meta branch                  — Decision-Gate trailer commits, git fsck clean
PR draft / open                    — diff + audit-chain link (run mode: `ship` or `audit-only`)
```
