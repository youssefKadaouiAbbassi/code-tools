---
description: Ultimate coding orchestrator. Runs the full dev workflow: clarify → classify → dispatch to sub-skill → execute with review loop → capture learnings.
allowed-tools: Task, AskUserQuestion, Read, Edit, Bash, Glob, Grep
argument-hint: [task description or leave blank to use previous message]
---

# /do — Ultimate Dev Orchestrator

You are orchestrating a complete development task. Use this workflow for any non-trivial coding request.

**Task:** $ARGUMENTS

If no task is given, use the most recent user message as the task.

## Phase 0 — Principles (always applied)

Load `karpathy-guidelines`: Think Before Coding · Simplicity First · Surgical Changes · Goal-Driven Execution.

## Parallelism rules (enforced throughout)

Agent Teams is enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` set by primordial). Leverage it.

**Hard rule:** if two subagent invocations have no data dependency between them, they MUST be launched in **one message** as multiple parallel Task calls — never sequentially. Sequential spawning when parallelism is possible is a direct 2-5× token and wallclock waste.

**Two primitives:**
1. **Parallel Task fan-out** (use for per-turn parallelism up to 5 agents) — send N Task calls in a single assistant message. All run concurrently; I wait for all to return before continuing.
2. **`TeamCreate`** (use for Tier C Complex work) — persistent named team that coordinates across multiple turns. Set it up once at Phase 4, then dispatch to team members by name in later phases without respawning.

**Data-dependency check** (use before every spawn):
- Does agent B need output from agent A? → sequential.
- Does agent B only need the task description? → parallel with A.
- Does A modify a file B will read? → sequential.
- A and B read the same file independently? → parallel.

## Phase 1 — Clarify (skip for trivial requests)

**Decide: does this task need clarification?** Run these checks:

- Is the success criterion verifiable? (tests, output format, behavior change spec)
- Is the scope clear? (single file, module, cross-cutting)
- Are external systems or secrets involved? (prod DB, API keys, filesystem)
- If the task mentions a library / framework — do I know its current API?

If ANY are unclear AND the task is non-trivial: spawn `do-clarifier` subagent with the task. It will produce at most 3 clarifying questions. Pause, ask the user, continue after answers.

**Skip Phase 1 for:**
- One-line edits, typo fixes, config tweaks
- Answer-only questions (no code change)
- Tasks where the user already spelled out success criteria and scope

## Phase 2 + 3 — Classify + Memory check (PARALLEL)

These are data-independent — both only need the clarified task. **Launch them in ONE message as parallel Task calls.**

- **Task call A:** spawn `do-classifier` with the clarified task → returns classification
- **Task call B:** spawn a `general-purpose` agent to run `/claude-mem:mem-search` with 2-3 key terms → returns any prior findings

Classification returns ONE of:
- `ship-feature` · `fix-bug` · `refactor-safely` · `security-audit` · `onboard-codebase` · `trivial` · `split`

Memory check returns prior related work (or "no prior findings").

For `split`, ask the user which half to do first. Never run two workflows interleaved.

If memory surfaces prior pain, show it to the user in 1-2 lines BEFORE moving to Phase 4.

## Phase 4 — Plan (decompose before acting)

**Produce an explicit, checkable plan before touching code.** Don't skip this — shipping without a plan is how silent scope-creep happens.

Three tiers based on task size:

**Tier A — Trivial (skip planning):** one-line edits, typo fixes, config tweaks, answer-only questions. Jump straight to Phase 5 (Dispatch) and execute inline.

**Tier B — Standard (light plan):** Most tasks. Create a task list via `TaskCreate` with 3-7 steps that map to the sub-skill's phases plus any task-specific work. Include explicit success criteria per step. Example for a bug fix:

```
1. Reproduce (success: command X produces Y error)
2. Trace call path via Explore + serena
3. Form root-cause hypothesis
4. Spawn silent-failure-hunter on fix site
5. Write regression test (fails before fix)
6. Apply minimum fix
7. Verify full suite + regression passes
```

**Tier C — Complex (deep plan):** Multi-file features, cross-cutting refactors, infrastructure changes. Invoke `/claude-mem:make-plan` — it produces a documented phased plan with discovery, and captures it in memory for future sessions. Then convert its output into a `TaskCreate` list.

**For Tier C, also create a persistent Team at the end of planning.** Use `TeamCreate` to group the agents you'll need across phases (e.g., `code-architect` + `code-reviewer` + `silent-failure-hunter` + `type-design-analyzer`). In later phases, dispatch to team members by name instead of re-spawning agents turn-by-turn. The team's shared context makes multi-turn coordination cheaper (reviewers remember what architects proposed; no re-priming needed).

**For every plan, verify:**
- Each step has a concrete success criterion (test passes, file exists, command returns 0)
- Each step names which tool/agent/plugin will execute it
- The plan is *surgical* — no opportunistic work added "while we're at it"

**Present the plan to the user before executing Tier C.** For Tier B, announce the plan in a compact list and proceed unless the user objects.

Update tasks via `TaskUpdate` as they move through `in_progress` → `completed`. If a step fails, mark it `completed` only when the failure is handled (retry succeeded OR user decided to skip).

## Phase 5 — Dispatch via Skill tool

**Invoke the classified sub-skill via the `Skill` tool** — this activates it with proper context integration, not a "read the file" approximation. Pass the refined task as args.

| Classification | Invocation |
|---|---|
| `ship-feature` | `Skill(skill: "ship-feature", args: "<refined task>")` |
| `fix-bug` | `Skill(skill: "fix-bug", args: "<refined task>")` |
| `refactor-safely` | `Skill(skill: "refactor-safely", args: "<refined task>")` |
| `security-audit` | `Skill(skill: "security-audit", args: "<refined task>")` |
| `onboard-codebase` | `Skill(skill: "onboard-codebase", args: "<refined task>")` |
| `trivial` | Handle inline. No Skill invocation needed. |

Wait for the sub-skill's workflow to complete before proceeding to Phase 6 (Review loop). The sub-skill's output is your input to the next phase.

**Parallelism inside the sub-skill:** The "map" steps (structural/semantic/historical scans) are almost always data-independent. Launch them in ONE message:

- `refactor-safely` Phase 2: `serena` find-references + `ast-grep` structural search + `/claude-mem:smart-explore` + `/claude-mem:mem-search` → parallel Task fan-out
- `onboard-codebase` Phases 2-4: `Explore` agent + `serena` symbol map + `/claude-mem:mem-search` + `git log` → parallel
- `fix-bug` Phase 3: `Explore` + `serena` find-references + `ast-grep` for similar patterns → parallel
- `security-audit` Phase 3: `snyk_code_scan` + `snyk_sca_scan` + `snyk_iac_scan` + `snyk_container_scan` (scope-appropriate subset) → parallel MCP calls in one message

Only dependency to respect: anything that reads a file an earlier step modifies. Since the map steps are read-only, they're always safe to parallelize.

## Phase 6 — Review loop (for workflows that produce code)

After the sub-skill's review phase, decide:

- **All reviewers pass** → proceed to Phase 6
- **High-confidence findings from any reviewer** → fix them, re-invoke ONLY the reviewer that flagged (not all of them) to confirm. Maximum 3 iterations, then escalate to user.
- **Only low-confidence / nitpick findings** → present to user, don't auto-fix. User decides.

## Phase 7 — Record learnings

Spawn `do-recorder` subagent with:
- The original task (post-clarification)
- The classification
- What worked (tools used, patterns that succeeded)
- What didn't (tools that missed, dead-ends taken)
- Any surprising insights

It writes a compact entry to the appropriate CLAUDE.md (project-level if in a repo, user-level for general lessons). If nothing was surprising, it can skip — no noise.

## Phase 8 — Done

Tell the user:
- What was accomplished (1-2 sentences)
- What workflow ran (`ship-feature`, etc.)
- Any follow-ups or deferred items

## Hard rules

- **Never skip Phase 0 (principles).** Karpathy's guidelines are the safety net.
- **Parallelize independent subagents.** Multiple Task calls in one message, not multiple messages with one Task each. Agent Teams is enabled — use it. Sequential-when-parallel-is-possible is a waste of tokens and wallclock.
- **Tier C tasks create a persistent Team.** `TeamCreate` once at end of planning, dispatch by name afterward.
- **One workflow per turn.** See Phase 2 `split` handling.
- **No silent failures.** If a subagent errors, surface it; don't mask.
- **Don't re-invent what the sub-skill already covers.** This command is a conductor, not a performer.
- **Tools beat fabrication.** If you don't know a library's current API, call `docfork` MCP before guessing.

## What this command avoids

- Routing every request through heavy workflows (see Phase 1 skip conditions)
- Re-running all reviewers in Phase 5 when only one flagged
- Capturing noise into CLAUDE.md (do-recorder decides if the lesson is worth writing)
- Installing parallel orchestration frameworks (you already have this)
