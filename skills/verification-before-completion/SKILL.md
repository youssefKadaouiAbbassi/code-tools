---
name: verification-before-completion
description: "[yka-code] You MUST use this skill BEFORE claiming any task is done — before saying 'all tests pass', 'build succeeds', 'the fix works', 'feature complete', or emitting victory language like 'Done!' / 'Perfect!' / 'Great!'. Self-challenge with fresh verification evidence. Complements pre-review-checklist (artifact audit) by catching premature completion claims BEFORE they're made. Non-optional for any task touching code."
---

# Verification Before Completion — the Iron Law

**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.**

Not "should work". Not "previous run passed". Not "I added the code so it must work". Fresh run, full output, exit code checked, in the current session.

## When to fire

Activate before emitting ANY of these:
- "All tests pass"
- "Build succeeds" / "build is green"
- "The fix works"
- "Feature complete" / "Implementation done"
- "Issue resolved"
- "Regression caught" / "test pins the fix"
- Any "Done!" / "Perfect!" / "Great!" / "All set!" / victory punctuation before running a command
- Marking a task `completed` via `TaskUpdate`
- Handing off to `/commit-commands:commit`

If you're about to make a completion claim and haven't run a verification command in the LAST 60 seconds, this skill fires.

## The Gate Function

Five steps. Blocking. No shortcuts.

1. **IDENTIFY** — What exact command proves this specific claim?
2. **RUN** — Execute the FULL command, fresh, from the current working directory. Not `--bail`, not `--only`, not scoped. Full run.
3. **READ** — The full output. Check the exit code explicitly. Count any failures / warnings / skipped.
4. **VERIFY** — Does the output literally confirm the claim? If NO → state actual status with evidence, do NOT claim success.
5. **ONLY THEN** — Make the claim, with the evidence inline.

## Per-claim-type table

Each claim has a required verification. Running a different command doesn't count.

| Claim | Required verification | Not acceptable |
|---|---|---|
| "All tests pass" | `bun test` / `pytest` / `cargo test` — full suite, exit 0, 0 failures | "previous run passed", "linter passed", "typecheck passed", partial test run |
| "Build succeeds" | `bun run build` / `cargo build` / `tsc --noEmit` — exit 0 | linter output, "build looks right", incremental build cache hit |
| "The fix works" | Test that reproduces the bug runs green NOW | "I applied the fix", "the logic looks right", staring at the diff |
| "Regression test pins the fix" | Full red-green cycle verified: (1) write test, (2) run → MUST fail for the right reason, (3) apply fix, (4) run → MUST pass. Skip any step = not pinned. | "the test exists", "the test passes" (without the earlier red phase) |
| "Feature complete" | Every success criterion from the spec OR plan has a verification command run fresh, all green | "I implemented everything in the plan" |
| "Types are clean" | `bun tsc --noEmit` / `cargo check` — exit 0, 0 errors | `lsp_diagnostics` from a stale edit, IDE hover reporting no error |
| "Agent finished" | `git diff` / `git status` shows the expected changes, AND the agent's declared tests pass when re-run | trusting the agent's self-report, trusting task `status: completed` |
| "No debug leftovers" | `grep -rn "console\.log\|TODO\|debugger\|pdb\.set_trace\|print(.*DEBUG" <changed-files>` returns empty | "I would've noticed", "I removed them" |
| "Works in browser" | Actually loaded the page, interacted with the feature, screenshots captured | dev server started, `bun run dev` booted, "no errors in compile" |

## Red flags — words that mean you're about to skip verification

If you're about to write any of these BEFORE running the verification command, stop:

- *"should work"* / *"should be fine"*
- *"probably passes"*
- *"Done!"* / *"Perfect!"* / *"Great!"* / *"All set!"*
- *"I think that's it"*
- *"ready to commit"* (before pre-review-checklist + verification)
- *"the fix is in"* (before the red-green cycle is complete)

These are rationalizations. Every single one has been wrong before. Run the command.

## Rationalization prevention

| What you're tempted to say | What it actually means |
|---|---|
| *"I already ran that this session"* | Run it again. State has changed since your last run — you edited files. |
| *"The change is trivial, verification is overkill"* | Trivial changes break builds routinely. Run it. |
| *"Partial test run is enough, the other tests are unrelated"* | "Unrelated" is an assumption. Run the full suite. |
| *"The linter passing means tests pass"* | It doesn't. Different tool, different signal. |
| *"The user is waiting, I'll skip verification this once"* | The rework when you get it wrong costs more than the verification. Run it. |
| *"I'm confident this works"* | Confidence isn't evidence. Run it. |

## How to cite verification inline

When you DO claim success, cite the evidence in the same message:

```
Full test suite: `bun test` → 293 pass, 0 fail, exit 0 (just ran, 14.56s)
```

Not at the end. Not in a summary. Right next to the claim.

## Scope

- Applies to tasks touching code, tests, config, or skills.
- Does NOT apply to pure conversation (answering "what does X do" without changing state).
- Does NOT apply to verification commands themselves — running `bun test` doesn't need its own verification.

## Chains from / to

- **Chained from** `/do` Phase 3 (fall-through) and every sub-skill's completion step (`ship-feature` Phase 2 end, `fix-bug` Phase 6, `team-do` Stage 3/4 verify)
- **Chains to** `pre-review-checklist` when the verification surfaces a specific finding that should be captured before commit
- **Pairs with** `karpathy-guidelines` Rule 4 "Goal-Driven Execution" — the goal of this skill is to make the verifiable-goal step enforceable, not advisory

## What this skill avoids

- Re-running verification commands that were run less than 60 seconds ago on the EXACT same files (no state change)
- Running verification for pure-text replies (no code state change)
- Being the reviewer — reviewing the artifact quality is `pre-review-checklist` and `pr-review-toolkit`. This skill is about *freshness of evidence for the specific claim*, not quality.

## Canonical source

Ported from `obra/superpowers` `verification-before-completion` skill, 2026-04-16. The Iron Law + Gate Function are adopted near-verbatim; the per-claim-type table is expanded for our stack (Bun, TypeScript, ast-grep, Playwright CLI).
