---
name: pbt-verify
description: Generate property-based tests via fast-check / Hypothesis / proptest, run them, emit VERIFIED / PARTIAL / MISSING with shrunk counterexamples.
when_to_use: Phase 5b verify gate for every pure-fn (and io-with-pure-boundary) parcel.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Task
model: opus
---

# pbt-verify runbook

Delegate property generation to `pbt-verifier` subagent. This skill defines the contract + parsers.

## 1. Stack detection

```bash
PARCEL_ID="$1"
PATHS="$(jq -r '.parcels[] | select(.id=="'"$PARCEL_ID"'") | .paths[]' .forge/dag.json)"
mkdir -p .forge/pbt
STACK=""
echo "$PATHS" | grep -q '\.tsx\?$\|\.js$' && STACK="typescript"
[ -z "$STACK" ] && echo "$PATHS" | grep -q '\.py$' && STACK="python"
[ -z "$STACK" ] && echo "$PATHS" | grep -q '\.rs$' && STACK="rust"
```

## 2. Property derivation table

| Pattern (name / signature) | Property |
|---|---|
| `add`, `or`, `union`, `merge`, `max`, `min` over commutative monoid | **commutativity** `f(a,b) === f(b,a)` |
| `subtract`, `divide`, function composition | **anti-commutativity** `f(a,b) === neg(f(b,a))` or length-preserving |
| `add`, `multiply`, `union`, `merge` | **associativity** |
| op with identity `e` | **identity** `f(a, e) === a` |
| `parse`/`stringify`, `encode`/`decode` | **round-trip** `decode(encode(x)) === x` |
| `sort`, `dedupe`, `normalize`, `canonicalize` | **idempotency** `f(f(x)) === f(x)` |
| total order on input → output | **monotonicity** `a ≤ b ⇒ f(a) ≤ f(b)` |
| function returning a discriminated-union variant | **type-safety** all input domains map to a valid variant |

## 3. Anti-property guardrail (REJECT — never write these as positive properties)

- `subtract(a,b) === subtract(b,a)` → REJECTED: anti-commutative
- `divide(a,b) === divide(b,a)` → REJECTED: anti-commutative
- `compose(f,g) === compose(g,f)` → REJECTED
- `parse(stringify(x)) === x` for floats without explicit tolerance → REJECTED
- `concat(xs, ys) === concat(ys, xs)` → REJECTED: list concat not commutative
- `f(NaN, anything) === anything` → REJECTED: NaN propagates per IEEE-754

If pbt-verifier proposes any → emit `REJECTED: <reason>` instead of writing the test.

## 4. Generate test file

### TypeScript (fast-check)

```bash
cat > ".forge/pbt/${PARCEL_ID}.test.ts" <<EOF
import { test, expect } from "bun:test";
import * as fc from "fast-check";
import { add /* TODO: replace with the parcel's exports */ } from "../../src/<file>";

test("commutativity", () => {
  fc.assert(fc.property(fc.integer(), fc.integer(), (a, b) => add(a, b) === add(b, a)), { numRuns: 100 });
});
test("zero-identity", () => {
  fc.assert(fc.property(fc.integer(), (a) => add(a, 0) === a), { numRuns: 100 });
});
EOF
```

### Python (Hypothesis)

```bash
cat > ".forge/pbt/test_${PARCEL_ID}_pbt.py" <<EOF
from hypothesis import given, strategies as st
from <module> import add

@given(st.integers(), st.integers())
def test_commutativity(a, b): assert add(a, b) == add(b, a)
@given(st.integers())
def test_zero_identity(a): assert add(a, 0) == a
EOF
```

### Rust (proptest)

```bash
cat > ".forge/pbt/${PARCEL_ID}_pbt.rs" <<EOF
use proptest::prelude::*;
proptest! {
    #[test]
    fn commutativity(a: i64, b: i64) { prop_assert_eq!(add(a, b), add(b, a)); }
    #[test]
    fn zero_identity(a: i64) { prop_assert_eq!(add(a, 0), a); }
}
EOF
```

## 5. Execute

```bash
case "$STACK" in
  typescript) bun test "./.forge/pbt/${PARCEL_ID}.test.ts" 2>&1 | tee ".forge/pbt/${PARCEL_ID}-run.log"; EXIT=${PIPESTATUS[0]} ;;
  python)     pytest ".forge/pbt/test_${PARCEL_ID}_pbt.py" -q 2>&1 | tee ".forge/pbt/${PARCEL_ID}-run.log"; EXIT=${PIPESTATUS[0]} ;;
  rust)       cargo test --test "${PARCEL_ID}_pbt" 2>&1 | tee ".forge/pbt/${PARCEL_ID}-run.log"; EXIT=${PIPESTATUS[0]} ;;
esac
# EXIT is captured per-branch above via ${PIPESTATUS[0]}; a bare `$?` would read
# tee's exit code (always 0) and silently mask runner failures.
```

## 6. Parse → verdict

```bash
# Count passes from the runner log only (single file). The previous glob
# `${PARCEL_ID}".*` matched both the test file AND the run.log, returning
# multi-line counts that broke arithmetic comparisons downstream.
PASS=$(grep -cE '\(pass\)' ".forge/pbt/${PARCEL_ID}-run.log" 2>/dev/null || echo 0)
TOTAL=$(grep -cE '^[[:space:]]*test\(|^def test_|fn .* {' ".forge/pbt/${PARCEL_ID}.test.ts" ".forge/pbt/test_${PARCEL_ID}_pbt.py" ".forge/pbt/${PARCEL_ID}_pbt.rs" 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')

if [ "${TOTAL:-0}" -eq 0 ]; then
  VERDICT="MISSING"; REASON="no-derivable-property"
elif [ "$EXIT" -eq 0 ] && [ "$PASS" -ge "$TOTAL" ]; then
  VERDICT="VERIFIED"; REASON=""
else
  VERDICT="PARTIAL"
  REASON=$(grep -A2 'Counterexample\|Falsified after\|Falsifying example' ".forge/pbt/${PARCEL_ID}-run.log" 2>/dev/null | head -6)
  [ -z "$REASON" ] && REASON="runner failed (exit=$EXIT) — see .forge/pbt/${PARCEL_ID}-run.log"
fi

cat > ".forge/pbt/${PARCEL_ID}.json" <<EOF
{
  "gate": "pbt-verify",
  "parcel": "$PARCEL_ID",
  "stack": "$STACK",
  "properties_total": $TOTAL,
  "properties_passed": $PASS,
  "result": "$VERDICT",
  "reason": $(jq -Rs . <<<"$REASON")
}
EOF
echo "pbt-verify: $STACK · $PASS/$TOTAL · verdict $VERDICT"
```

## Gate semantics

- `VERIFIED` → PASS
- `PARTIAL` → BLOCK; surface shrunk-minimum counterexample as new TDD test case (framework's built-in shrinker output, never hand-minimized)
- `MISSING + no-derivable-property` → PASS only if derive-kind = pure-fn AND no algebraic structure exists (rare). Otherwise escalate.
