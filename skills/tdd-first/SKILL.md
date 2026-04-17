---
plugin: code-tools
name: tdd-first
description: Enforces test-first discipline — red → green → refactor. Use when the user is about to fix a bug, implement core logic, or add a feature where correctness matters. Writes a failing test first, confirms it fails for the right reason, THEN allows implementation. Complements pr-review-toolkit:pr-test-analyzer (reactive) with proactive test-writing.
---

# TDD-First — red, green, refactor (in that order)

Closes the gap where Claude writes the fix first and bolts on a test afterward. TDD means the test comes FIRST, the test FAILS FIRST for the RIGHT reason, then and only then do you write code.

Inherits `karpathy-guidelines`: goal-driven execution means defining the verifiable success criterion up front — the test IS that criterion.

## When to activate

- About to fix a bug (before editing implementation)
- About to add core logic: algorithm, parser, validator, state machine, protocol handler
- Any code where correctness > speed
- User explicitly asks for TDD, test-first, or red-green-refactor

## When to skip

- Typo fixes, formatting, one-line config
- UI prototyping (use `playground` skill — iteration loop beats test loop for visuals)
- Throwaway scripts
- Code where the test would just mirror the implementation (tests of trivial getters, etc.)

## The three-step loop

### Red — write the failing test

Before touching implementation:

1. **Name the success criterion as an assertion.** Not "it works", but "when input X, output is Y". Pick the most minimal case that proves the behavior exists.
2. **Write the test.** Descriptive name: `it("returns 401 when token is expired")` not `it("works")`. Deterministic: no random seeds, no real time unless explicitly mocked, no real network unless contract-tested.
3. **Run the test. Confirm it fails.** Running a test you THINK is failing without actually running it is the #1 TDD mistake.
4. **Confirm it fails for the RIGHT reason.** If it fails with a syntax error, the test is broken — fix that first. If it fails because `foo` doesn't exist yet, good — that's the red state.

Exit red only when: test runs, test fails, failure matches the expected-behavior gap.

### Green — minimum code to pass

Now write the SMALLEST implementation that makes the test pass:

1. No speculative code. No "while I'm here" additions. Just enough to turn red to green.
2. Pseudo-implementations are OK as a first green. (Hard-code the expected value. "Lying" implementations force you to write more tests to force real logic.)
3. Run the test. Confirm green.
4. Run the full suite. Confirm no regressions.

### Refactor — only on green

With the test green and the suite green:

1. Tighten the implementation: remove duplication, clarify names, extract helpers.
2. **Never refactor on a red test.** If you break something during refactor, you lose the cause-and-effect signal.
3. Re-run tests after each refactor step.

Repeat the loop for the next behavior. Small loops (<5 min per loop) beat big loops.

## Tool dispatch

| Need | Tool |
|---|---|
| Run tests fast | Framework-native: `bun test`, `pytest`, `cargo test`, `go test`, `npm test`. Prefer `just test` if a `justfile` exists. |
| Write E2E / browser / DOM tests | `playwright-cli` skill | CLI snapshots beat MCP on tokens; supports parallel sessions |
| Detect what test framework / structure exists | `serena` (finds existing test patterns), `ast-grep` (matches test-definition shapes), or `Explore` agent for a broader scan |
| Find similar existing tests as a template | `/claude-mem:smart-explore` (AST search is cheap) or `Grep` for `describe\|it\|test\(` |
| Check past TDD decisions on this file | `/claude-mem:mem-search <file or module>` |
| Look up test-framework API when writing assertion/mock | `docfork` MCP — avoids guessing matcher/mock APIs from training cutoff |
| Verify framework behavior upstream before treating as bug | `deepwiki` MCP — confirms whether odd test output is known upstream |
| Review test quality after writing | `pr-review-toolkit:pr-test-analyzer` (plugin reviewer — catches weak assertions, missing edge cases, mock-only tests) |
| Avoid testing mocks only | Read `pr-test-analyzer` findings before committing — it flags "tests that only test mocks" specifically |

## Hard rules

- **Test before implementation. No exceptions on qualifying work.** If the user says "just add it quickly", remind them this skill is about qualifying work (bugs, core logic). For quick-and-dirty, use a different skill.
- **Confirm the test fails for the right reason.** A syntax error is not a red — it's a broken test.
- **Never refactor on red.** Green first. Refactor second.
- **Descriptive test names.** They document intent; Claude-readable > cute.
- **Deterministic.** Random seeds, real time, network — all banned unless explicitly mocked or contract-tested.
- **One behavior per test.** If the test's name has "and" in it, split it.
- **At least one integration path per feature.** Unit tests over mocks alone can pass while production breaks (principle validated by `pr-test-analyzer`'s "tests that only test mocks" finding).

## Integration with other skills

- **`fix-bug` Phase 6 calls this skill** for the regression-test-first step
- **`ship-feature` Phase 1 calls this skill** for core-logic modules (auth, payments, state machines, parsers)
- **`refactor-safely` Phase 1** uses it to write characterization tests when baseline coverage is missing
- **NOT called from** `onboard-codebase` (read-only), `security-audit` (review-mode), `knowledge-base` (not code)

## Example walkthrough

**Task:** "Add a `parseDuration("2h30m")` helper that returns milliseconds."

1. Red: write `expect(parseDuration("2h30m")).toBe(9_000_000)`. Run. Fails because `parseDuration` doesn't exist. ✓ right reason.
2. Green: write a simple parser that handles `h` and `m`. Run. Passes.
3. Refactor: extract the unit-to-ms map. Re-run. Still passes.
4. Next red: `expect(parseDuration("1.5h")).toBe(5_400_000)` — fractional hours. Fails. Repeat.
5. Next: edge cases (negative, zero, malformed input). Each one drives the next red → green.
6. After final green, invoke `pr-review-toolkit:pr-test-analyzer` to catch anything I missed (boundary conditions, unicode, etc.).
