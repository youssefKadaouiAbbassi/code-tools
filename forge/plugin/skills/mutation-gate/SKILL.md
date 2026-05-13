---
name: mutation-gate
description: Per-stack mutation testing — Stryker / mutmut / cargo-mutants — gate score ≥ 0.80.
when_to_use: Phase 5c verify gate for every code-bearing parcel.
allowed-tools: Bash, Read, Grep, Glob, Task
model: opus
---

# mutation-gate runbook

## 1. Stack detection

```bash
PARCEL_ID="$1"
PATHS="$(jq -r '.parcels[] | select(.id=="'"$PARCEL_ID"'") | .paths[]' .forge/dag.json)"
mkdir -p .forge/mutation
STACK=""
echo "$PATHS" | grep -q '\.tsx\?$\|\.js$' && STACK="typescript"
[ -z "$STACK" ] && echo "$PATHS" | grep -q '\.py$' && STACK="python"
[ -z "$STACK" ] && echo "$PATHS" | grep -q '\.rs$' && STACK="rust"
[ -z "$STACK" ] && { echo '{"gate":"mutation-gate","result":"skip","reason":"unknown-stack"}' > ".forge/mutation/${PARCEL_ID}.json"; exit 0; }
```

## 2. Run mutator

### TypeScript (Stryker)

```bash
[ -f stryker.conf.mjs ] || cat > stryker.conf.mjs <<EOF
export default {
  testRunner: "command",
  commandRunner: { command: "bun test" },
  reporters: ["json", "clear-text"],
  jsonReporter: { fileName: ".forge/mutation/${PARCEL_ID}-stryker.json" },
  mutate: $(echo "$PATHS" | jq -R . | jq -s .),
  thresholds: { high: 80, low: 60, break: 80 },
  timeoutMS: 60000
};
EOF
bunx stryker run --reporters json
```

### Python (mutmut)

```bash
mutmut run --paths-to-mutate "$(echo "$PATHS" | head -1)" --simple-output | tee ".forge/mutation/${PARCEL_ID}-mutmut.txt"
mutmut results > ".forge/mutation/${PARCEL_ID}-mutmut-results.txt"
```

### Rust (cargo-mutants)

```bash
cargo mutants --in-place --in-diff --timeout 60 2>&1 | tee ".forge/mutation/${PARCEL_ID}-cargo-mutants.txt"
```

## 3. Parse score (independent recomputation — never trust skill self-reporting)

```bash
case "$STACK" in
  typescript)
    REPORT=".forge/mutation/${PARCEL_ID}-stryker.json"
    KILLED=$(jq '[.files[].mutants[] | select(.status=="Killed")] | length' "$REPORT")
    SURVIVED=$(jq '[.files[].mutants[] | select(.status=="Survived")] | length' "$REPORT")
    NOCOV=$(jq '[.files[].mutants[] | select(.status=="NoCoverage")] | length' "$REPORT")
    TIMEOUT_COUNT=$(jq '[.files[].mutants[] | select(.status=="Timeout")] | length' "$REPORT")
    DENOM=$((KILLED + SURVIVED + NOCOV))
    SCORE=$(echo "scale=3; if ($DENOM > 0) $KILLED / $DENOM else 1" | bc)
    ;;
  python)
    KILLED=$(grep -oE '[0-9]+ killed' ".forge/mutation/${PARCEL_ID}-mutmut-results.txt" | grep -oE '[0-9]+' | head -1)
    SURVIVED=$(grep -oE '[0-9]+ survived' ".forge/mutation/${PARCEL_ID}-mutmut-results.txt" | grep -oE '[0-9]+' | head -1)
    DENOM=$((KILLED + SURVIVED))
    SCORE=$(echo "scale=3; if ($DENOM > 0) $KILLED / $DENOM else 1" | bc)
    ;;
  rust)
    CAUGHT=$(grep -cE '^CAUGHT' ".forge/mutation/${PARCEL_ID}-cargo-mutants.txt" || echo 0)
    MISSED=$(grep -cE '^MISSED' ".forge/mutation/${PARCEL_ID}-cargo-mutants.txt" || echo 0)
    DENOM=$((CAUGHT + MISSED))
    SCORE=$(echo "scale=3; if ($DENOM > 0) $CAUGHT / $DENOM else 1" | bc)
    KILLED=$CAUGHT
    SURVIVED=$MISSED
    ;;
esac

# Exclude unviable/timeout from the denominator (test-quality signal only).
```

## 4. Gate

```bash
RESULT=$([ "$(echo "$SCORE >= 0.80" | bc -l)" = "1" ] && echo PASS || echo BLOCK)
[ "${TIMEOUT_COUNT:-0}" -gt 0 ] && [ "$RESULT" = "PASS" ] && RESULT="PASS-WITH-TIMEOUT"
cat > ".forge/mutation/${PARCEL_ID}.json" <<EOF
{
  "gate": "mutation-gate",
  "parcel": "$PARCEL_ID",
  "stack": "$STACK",
  "score": $SCORE,
  "killed": $KILLED,
  "survived": $SURVIVED,
  "result": "$RESULT",
  "threshold": 0.80
}
EOF
echo "mutation-gate: $STACK · score $SCORE · $KILLED killed · $SURVIVED survived · gate $RESULT"
```

## 5. On BLOCK

```bash
[ "$RESULT" = "BLOCK" ] && jq -r '.files[].mutants[] | select(.status=="Survived") | "\(.location.start.line): \(.replacement)"' ".forge/mutation/${PARCEL_ID}-stryker.json"
```

Surviving mutants become concrete failing test cases for the next TDD cycle. Never weaken the threshold.
