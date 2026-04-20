---
name: loop-patterns
description: [yka-code] Recipes for `/loop`, `CronCreate`, and `ScheduleWakeup`. Activate when the user asks Claude to "keep checking", "poll", "run every N minutes", "wait until X", "babysit", "watch for", or describes a task that repeats on a cadence or needs to resume after a delay. Not a route for one-shot work — only for recurring/scheduled tasks.
---

# Loop patterns

Three Claude Code primitives for time-based work:

| Primitive | Shape | Use when |
|---|---|---|
| `/loop <interval> <prompt>` | Fixed-interval recurrence (e.g. `/loop 5m /check-prs`). Same prompt re-fires until you stop it. | Cadence is known, prompt doesn't change. |
| `CronCreate` tool | In-session recurring or one-shot schedule. `CronList`/`CronDelete` manage. Survives `--resume` / `--continue`. | "Remind me in 2h to check X"; session-scoped scheduled work. |
| `ScheduleWakeup` tool | Self-paced wakeup. Claude picks `delaySeconds ∈ [60, 3600]` based on what it's waiting for. Only available during dynamic `/loop` (no interval given). | Model should judge the right cadence — e.g. waiting on a long build, poll-until-ready. |

## Principles before reaching for a loop

1. **Prefer one-shot.** Loops consume tokens per tick. If the task can complete in one pass, do that.
2. **Set a completion signal.** Every loop must have an explicit stop condition (PR merged, tests green, deploy healthy). Open-ended loops drift and burn budget.
3. **Right-size the interval.** Faster-than-needed polling wastes tokens *and* rate-limit quota. Slower-than-needed misses the window. Pick based on how fast the underlying state actually changes.
4. **Cache-aware cadence.** Anthropic prompt cache TTL is 5 minutes. Sleeps ≥300s pay a full cache-miss on wake. Under 270s stays warm. Don't pick 300s — worst-of-both.

## Recipes

### 1. Babysit a PR until CI green + review approved

Use-case: "watch PR #142 and merge it once CI passes and a reviewer approves."

```
/loop 3m Check PR #142 via `gh pr view 142 --json mergeable,statusCheckRollup,reviewDecision`. If mergeable=MERGEABLE AND all checks=SUCCESS AND reviewDecision=APPROVED, run `gh pr merge 142 --squash --delete-branch` and stop the loop. If any check=FAILURE, stop and report. Otherwise keep watching.
```

Stop conditions: merge succeeds, check fails, or user cancels. Cadence: 3m matches CI feedback cycle; slower wastes human time, faster burns tokens.

### 2. Poll a deploy until healthy

Use-case: kicked off a deploy, want Claude to confirm rollout before moving on.

```
/loop 60s Check `kubectl rollout status deployment/api -n prod --timeout=10s`. If status is "successfully rolled out", stop and report deployed commit SHA. If condition=Progressing and age>10m, alert and stop. If condition=Failed, roll back via `kubectl rollout undo deployment/api -n prod` and stop.
```

Cadence: 60s matches typical k8s reconcile loop — tighter than needed doesn't see new state.

### 3. Scheduled refactor sweep

Use-case: "every Monday morning run the simplify skill across `src/` and open a PR if anything changed."

```
CronCreate({ schedule: "0 9 * * 1", prompt: "Run the simplify skill on src/. If any diffs result, create a branch chore/weekly-simplify-{date}, commit, push, open PR titled 'weekly refactor sweep'. If diff is empty, skip silently." })
```

Use `CronCreate` not `/loop` — this is a calendar schedule, not an interval. Session-scoped; re-add on next session.

### 4. Watch a long test run

Use-case: `bun test` takes 8 minutes; don't spam re-checks.

```
(Dynamic /loop — no interval given)
/loop Check `tail -n 20 .test-output.log`. If the log contains "Tests passed" or "FAIL", summarize the result and stop. Otherwise sleep and check again.
```

Dynamic mode enables `ScheduleWakeup` — Claude picks ~270s (stay in cache) or ~1200s+ (single-miss amortization) based on expected remaining run time.

### 5. Wait for upstream state (external API, teammate PR, etc.)

```
(Dynamic /loop)
/loop Poll `gh pr view 87 --json mergeable,statusCheckRollup` on the upstream repo. When mergeable=MERGEABLE, open our downstream sync PR via `gh pr create --title "sync with upstream #87" ...` and stop.
```

## Anti-patterns

- **Don't loop for one-shot tasks.** "Write function X, loop until tests pass" should be `Skill("test-driven-development")`, not `/loop`.
- **Don't `/loop` when `CronCreate` fits.** Calendar schedules (`0 9 * * 1`) go in Cron; intervals (`5m`) go in `/loop`.
- **Don't spin faster than the underlying signal.** Polling GitHub faster than ~60s risks rate limiting and reveals nothing new.
- **Don't forget the stop condition.** Loops with no success criterion run until you notice.

## Hard rules

- Every loop recipe you write for the user must include the explicit stop condition.
- Cite cache cadence (≤270s warm; ≥1200s single-miss) when picking `delaySeconds` for dynamic mode.
- For `CronCreate`, remind the user that schedules are session-scoped — they must re-create on a new session or ask for a host-level cron.

## Chains to

- `ci-hygiene` — when the loop polls CI state.
- `claude-mem:version-bump` — when a loop waits for a release branch to settle.
- `fix-bug` — when a loop babysits a flaky test until it reproduces.
