#!/usr/bin/env bash
# Deep pipeline test — runs INSIDE forge-dev. Brief is non-trivial (LRU with PBT)
# so the forge runbook must actually exercise:
#   - Phase 1: feature-dev plans 2+ parcels into .forge/dag.json
#   - Phase 2: at least 1 MCP call logged to .forge/audit/tool-trace.jsonl
#   - Phase 3: council via pr-review-toolkit (≥1 review file in .forge/council/)
#   - Phase 4: worker writes failing test + impl
#   - Phase 5a: derive-kind classifies parcel as pure-fn
#   - Phase 5b: pbt-verify generates property tests
# Skip Phase 5c mutation (too slow) and Phase 6 ship (no PR).
set -o pipefail
LOG=/tmp/forge-deep
rm -rf "$LOG" && mkdir -p "$LOG"

bash /workspace/forge/dev/install-harness.sh > "$LOG/install.log" 2>&1 || { tail -30 "$LOG/install.log"; exit 1; }
bun /workspace/forge/dist/cli.js update > /dev/null 2>&1   # re-stub protect-mcp + claude-hud after install-harness side effects

PROJ=/tmp/forge-deep-pipeline
rm -rf "$PROJ" && mkdir -p "$PROJ" && cd "$PROJ"
git init -q
git config user.email "test@forge"
git config user.name "Forge Deep Test"
echo "# deep test" > README.md
git add -A && git commit -qm "init"

# Pre-allowlist commands so TDD-guard test execution doesn't stall
mkdir -p .claude
cat > .claude/settings.local.json <<'SETTINGS'
{"permissions":{"allow":["Bash(npm *)","Bash(node *)","Bash(npx *)","Bash(git *)","Bash(jq *)","Bash(ls *)","Bash(cat *)","Bash(mkdir *)","Bash(echo *)","Edit","Write","Read","mcp__plugin_forge_docfork","mcp__plugin_forge_deepwiki","mcp__plugin_forge_github","mcp__plugin_forge_snyk","mcp__plugin_claude-mem_mcp-search","Skill","Task"]}}
SETTINGS

read -r -d '' BRIEF <<'BRIEF'
Activate the forge:forge skill via Skill tool. Run the COMPLETE forge pipeline on this brief:

  "Add `createLRU(capacity)` factory in `src/lru.ts` that returns an LRU cache with `get(k)` and `put(k, v)`. Pure data structure (no I/O). Capacity bounds the size; oldest entry evicted first when over capacity."

Execute EVERY phase from forge:forge runbook:
- Phase 0 (bootstrap)
- Phase 1 (plan into .forge/dag.json)
- Phase 2 (research with MCPs, audit to .forge/audit/tool-trace.jsonl)
- Phase 3 (full 6-persona council + meta-judge into .forge/council/)
- Phase 4 (ralph-loop worker: red test then impl, tdd-guard enforced)
- Phase 5a (derive-kind → .forge/kind/lru.json)
- Phase 5b (pbt-verify with fast-check → .forge/pbt/lru.json)
- Phase 5c (mutation-gate with stryker → .forge/mutation/lru.json, score ≥0.80 required)
- Phase 5d (skip — pure-fn, no UI; record skip in .forge/browser/lru.skipped)
- Phase 6 (ship: protect-mcp signed receipts in .forge/receipts/, forge-meta branch append, then attempt `gh pr create` — if no GITHUB_TOKEN, write the would-be PR body to .forge/pr-body.md and proceed)

When all phases finish (or are correctly skipped with rationale), reply FORGE_DEEP_PASS on its own line.
BRIEF

echo "=== launching deep pipeline (up to 40 min) ==="
timeout 2400 claude -p "$BRIEF" --permission-mode acceptEdits --model claude-sonnet-4-6 > "$LOG/pipeline.stdout" 2> "$LOG/pipeline.stderr"
RC=$?
echo "exit=$RC"
echo

FAIL=0
echo "=== verifying acceptance ==="

if [ -f "$PROJ/.forge/dag.json" ]; then
  PARCELS=$(jq '.parcels | length // 0' "$PROJ/.forge/dag.json" 2>/dev/null)
  if [ "${PARCELS:-0}" -ge 1 ]; then echo "  ✓ Phase 1: .forge/dag.json has $PARCELS parcel(s)"; else echo "  ⚠ Phase 1: dag.json exists but parcels=$PARCELS"; fi
else
  echo "  ✗ Phase 1: .forge/dag.json missing"; FAIL=$((FAIL+1))
fi

if [ -f "$PROJ/.forge/audit/tool-trace.jsonl" ]; then
  MCP_HITS=$(grep -cE 'mcp__plugin_forge_(docfork|deepwiki)|mcp__plugin_claude-mem' "$PROJ/.forge/audit/tool-trace.jsonl" 2>/dev/null || echo 0)
  if [ "$MCP_HITS" -ge 1 ]; then echo "  ✓ Phase 2: $MCP_HITS MCP call(s) in tool-trace.jsonl"; else echo "  ✗ Phase 2: zero MCP hits in audit trace"; FAIL=$((FAIL+1)); fi
else
  echo "  ✗ Phase 2: no .forge/audit/tool-trace.jsonl"; FAIL=$((FAIL+1))
fi

if [ -d "$PROJ/.forge/council" ] && [ -n "$(ls -A "$PROJ/.forge/council" 2>/dev/null)" ]; then
  COUNCIL_FILES=$(ls "$PROJ/.forge/council" | wc -l)
  echo "  ✓ Phase 3: $COUNCIL_FILES council review file(s)"
else
  echo "  ✗ Phase 3: no .forge/council/ artifacts"; FAIL=$((FAIL+1))
fi

if [ -f "$PROJ/src/lru.ts" ] && grep -q "createLRU" "$PROJ/src/lru.ts"; then
  echo "  ✓ Phase 4: src/lru.ts contains createLRU"
else
  echo "  ✗ Phase 4: src/lru.ts missing or no createLRU"; FAIL=$((FAIL+1))
fi
if [ -f "$PROJ/src/lru.test.ts" ]; then
  echo "  ✓ Phase 4: src/lru.test.ts present"
else
  echo "  ✗ Phase 4: src/lru.test.ts missing"; FAIL=$((FAIL+1))
fi

if [ -f "$PROJ/.forge/kind/lru.json" ] || [ -f "$PROJ/.forge/kind.json" ]; then
  KFILE=$([ -f "$PROJ/.forge/kind/lru.json" ] && echo "$PROJ/.forge/kind/lru.json" || echo "$PROJ/.forge/kind.json")
  if grep -qi 'pure-fn\|pure_fn' "$KFILE"; then echo "  ✓ Phase 5a: kind classified as pure-fn"; else echo "  ⚠ Phase 5a: kind file exists but no pure-fn marker"; fi
else
  echo "  ✗ Phase 5a: no .forge/kind/ artifacts"; FAIL=$((FAIL+1))
fi

if grep -qi "fast-check\|fc\.property\|forall\|@property" "$PROJ/src/lru.test.ts" 2>/dev/null; then
  echo "  ✓ Phase 5b: property tests detected (fast-check)"
else
  echo "  ⚠ Phase 5b: no fast-check style PBT detected in src/lru.test.ts"
fi

if [ -f "$PROJ/.forge/mutation/lru.json" ]; then
  SCORE=$(jq -r ".score // 0" "$PROJ/.forge/mutation/lru.json" 2>/dev/null)
  echo "  ✓ Phase 5c: mutation/lru.json present (score=$SCORE)"
else
  echo "  ✗ Phase 5c: no .forge/mutation/lru.json"; FAIL=$((FAIL+1))
fi

# Phase 5d: should record skip rationale for pure-fn parcel (no UI)
if [ -f "$PROJ/.forge/browser/lru.skipped" ] || ls "$PROJ/.forge/browser/" 2>/dev/null | grep -q "lru"; then
  echo "  ✓ Phase 5d: skip rationale recorded for pure-fn"
else
  echo "  ⚠ Phase 5d: no .forge/browser/lru.skipped artifact (acceptable if pipeline marked it inapplicable elsewhere)"
fi

# Phase 6: signed receipts + ship artifact
if [ -d "$PROJ/.forge/receipts" ] && [ -n "$(ls -A $PROJ/.forge/receipts 2>/dev/null)" ]; then
  RCPT_COUNT=$(ls "$PROJ/.forge/receipts" | wc -l)
  echo "  ✓ Phase 6: $RCPT_COUNT signed receipt(s) in .forge/receipts/"
else
  echo "  ✗ Phase 6: no .forge/receipts/ artifacts"; FAIL=$((FAIL+1))
fi
# forge-meta branch (audit chain branch)
if git -C "$PROJ" branch --list "forge-meta" | grep -q "forge-meta" || git -C "$PROJ" log -1 --format=%h forge-meta 2>/dev/null; then
  echo "  ✓ Phase 6: forge-meta branch exists"
else
  echo "  ⚠ Phase 6: no forge-meta branch (acceptable if ship was non-PR)"
fi
# PR body fallback (no GITHUB_TOKEN in this env)
if [ -f "$PROJ/.forge/pr-body.md" ]; then
  echo "  ✓ Phase 6: PR body drafted (no gh auth → wrote .forge/pr-body.md)"
fi

if grep -q "FORGE_DEEP_PASS" "$LOG/pipeline.stdout"; then
  echo "  ✓ agent reported FORGE_DEEP_PASS"
else
  echo "  ⚠ no FORGE_DEEP_PASS marker"
fi
if grep -qiE 'PROTECT_MCP.*error|Missing.*separator' "$LOG/pipeline.stderr"; then
  echo "  ✗ pipeline triggered PROTECT_MCP errors"
  grep -iE 'PROTECT_MCP|Missing' "$LOG/pipeline.stderr" | head -3 | sed 's/^/    /'
  FAIL=$((FAIL+1))
fi

echo
echo "=== artifacts ==="
ls -la "$PROJ/.forge/" 2>/dev/null
ls "$PROJ/src/" 2>/dev/null

echo
[ $FAIL -eq 0 ] && echo "✅ DEEP PIPELINE PASS" && exit 0
echo "❌ DEEP PIPELINE FAIL: $FAIL"
exit 1
