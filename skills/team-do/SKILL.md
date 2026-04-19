---
name: team-do
description: [yka-code] Spawns a persistent Agent Team (native TeamCreate) for work that actually splits — multi-subsystem features, debate-worthy architecture, parallel-reviewable diffs, or verification-heavy audits. Activates when the task touches ≥3 independent files OR involves multiple specialist roles (architect + reviewer + test-engineer) OR is a competing-hypotheses decision. Lead coordinates via SendMessage, teammates work assigned tasks in parallel, handoff docs persist across stages. Uses anthropics/claude-plugins-official feature-dev agents as teammates. Refuses to activate when DEV_TEAM_WORKER=1 or when the session is already running as a teammate — nested teams are forbidden.
---

# team-do — auto-invoked parallel workflow

Native `TeamCreate` / `Task` / `SendMessage` pipeline, modeled on the oh-my-claudecode staged pattern but auto-invoked from `/do` (no slash command).

## Canonical source (2026-04-19)

Anthropic's official lifecycle doc: **`code.claude.com/docs/en/agent-teams`**. This skill defers to that spec. The critical rules from it:

- *"When in doubt about whether a task warrants a team, prefer spawning a team."* (TeamCreate tool schema)
- *"Always use the lead to clean up. Teammates should not run cleanup because their team context may not resolve correctly, potentially leaving resources in an inconsistent state."*
- `TeamDelete` refuses to proceed if any teammate is still alive — shut them all down first, then delete.
- `/resume` and `/rewind` do not restore in-process teammates. After resuming, spawn fresh — do NOT try to message dead members from the stale `config.json`.
- No auto-reaping on lead crash (documented gap). Orphaned `~/.claude/teams/{name}/` dirs are cleaned by our `session-start-team-reaper.sh` hook, not by Claude.

## How teams actually work — full lifecycle (per official spec)

Before the opinionated stage pipeline below, the raw Anthropic model. Every rule here comes from the `TeamCreate` / `TeamDelete` / `SendMessage` tool schemas and `code.claude.com/docs/en/agent-teams`. Read this if you're about to touch any team tool.

### Enablement

Teams require `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in env or `settings.json`. Check before attempting `TeamCreate` — absent flag, the tool call errors. The installer here sets the flag; if a user reports "team-do won't start", check env first.

### Team = TaskList (1:1)

`TeamCreate({team_name, description})` creates BOTH:
- `~/.claude/teams/{team_name}/config.json` — the team registry (members, lead session ID, tmux panes)
- `~/.claude/tasks/{team_name}/` — the shared task list

You never `TaskCreate` in a team session without the tasks auto-landing in the team's list. Do not create a separate task dir "for this team" — the one created by `TeamCreate` is it.

### Spawning teammates — pick `subagent_type` by what tools it needs

Teammates are spawned via `Agent(subagent_type, team_name, name, prompt)`. The agent type determines what tools the teammate can call:
- **Read-only types** (`Explore`, `Plan`) — research/search/planning ONLY. They cannot edit files. Never assign implementation work.
- **Full-capability types** (`general-purpose`, `code-reviewer`, `code-architect`) — full tool access. Use for tasks that need file edits.
- **Custom `.claude/agents/`** — check the agent's own tool restrictions before assigning.

Name teammates with a **human-readable name** (e.g., `explorer`, `architect`, `reviewer`) — always use this for `SendMessage` and `TaskUpdate(owner)`. Never use the agentId (UUID).

Every teammate spawn prompt MUST start with the worker preamble (see "Worker preamble" section below). Without it, teammates can recursively spawn their own teams.

### Task assignment — pre-assign, don't race

- Pre-assign tasks via `TaskUpdate({task_id, owner: <name>})`. Any agent can set or change ownership.
- One task per owner at a time. No atomic-claim race.
- Teammates prefer tasks in ID order (lowest first) when multiple are available. Earlier tasks often set up context.
- If all available tasks are blocked, teammates should notify the lead or help unblock.

Anthropic handles file-locking on task claims natively — no race-condition code needed.

### Messages — push, not poll. Names, not UUIDs.

- Messages from teammates are delivered **automatically** as new conversation turns. **Never poll** `TaskList` or a mailbox.
- Plain text output is NOT visible to other agents. To communicate, you MUST call `SendMessage({to: <name>, message: "..."})`.
- `to: "*"` broadcasts — expensive (linear in team size), use only when everyone genuinely needs the message.
- When relaying a teammate's message to the user, do NOT quote it — the UI already rendered the original.
- **Never send structured JSON status messages** like `{"type":"idle",...}` or `{"type":"task_completed",...}`. Plain text only. Use `TaskUpdate` for status.

### Idle state — idle ≠ done

A teammate going idle is NORMAL. It does not mean:
- The teammate is done with its task (check `TaskList` for that)
- The teammate is unavailable
- Something is wrong

It means: the teammate's turn ended and it's waiting for input. Sending a message to an idle teammate wakes it up. Do NOT react to idle notifications unless you want to assign more work or follow up.

**Peer DM visibility** — when teammate A DMs teammate B, A's idle notification to the lead includes a brief summary. Informational only; no response needed.

### Discovering team members

Read the team config directly:
```
Read: ~/.claude/teams/{team_name}/config.json
```

The `members[]` array holds each teammate's `name` (what you message by), `agentId` (UUID, reference only), and `agentType`. Use `name`, never `agentId`, for all coordination.

### Shutdown protocol (individual teammate)

`SendMessage({to: <name>, message: {type: "shutdown_request"}})`. The teammate:
- Finishes its current tool call
- Responds `{type: "shutdown_response", request_id, approve: true}`  → exits
- Or responds `{approve: false}` with a reason → stays alive (rare; honor their refusal)

Approving shutdown terminates the teammate process. Don't originate `shutdown_request` unless you're actually tearing down the team.

### Session-reset sharp edges

- `/resume` restores the lead session but NOT the teammate processes. After resume, the lead's `config.json` still lists dead members — do NOT message them. Spawn fresh.
- `/rewind` same behavior.
- If a teammate's tmux pane persists after the team ends: `tmux ls` then `tmux kill-session -t <session-name>`.

### Nested teams — forbidden

A teammate CANNOT call `TeamCreate`. The worker preamble below enforces this via instruction. The `DEV_TEAM_WORKER=1` env var also guards the lead side of `/do`'s classifier. Violating this fork-bombs the host.

### Headless / SDK mode — incompatible

Teams do NOT work in `claude -p` / SDK mode. The lead hits `end_turn` while teammates run as background processes — lifecycle mismatch. If you're in headless mode, do not route to `team-do`; fall back to `Agent()` fan-out.

## Shutdown contract (non-negotiable)

**Every `TeamCreate` owes a `TeamDelete`.** One-to-one. No exceptions.

Before you call `TeamCreate`, commit to the teardown: you own the shutdown sequence for every team you spawn, regardless of whether the stage succeeds, fails, errors mid-flight, or gets interrupted by the user. If you can't guarantee the teardown will run, you're not ready to create the team.

At each stage's end (plan / exec / verify / fix), the BLOCKING order is:

1. Verify via `TaskList` that every team task is `completed` (or explicitly marked `deleted` if abandoned)
2. For EACH live teammate, `SendMessage({to: <name>, message: {type: "shutdown_request"}})`
3. Wait up to 30s per teammate for `shutdown_response({approve: true})` (or an idle notification — both mean the teammate is down)
4. After ALL teammates are confirmed down (or timed out), call `TeamDelete` — no params; team name comes from session context
5. Run an orphan-scan: if `~/.claude/teams/<team_name>/` still exists, log it and proceed — the reaper hook will catch it at next session start

If ANY of steps 1–4 fails, you must still call `TeamDelete` unconditionally before leaving the stage — the config-dir cleanup is more important than the graceful exit. A failed `TeamDelete` (e.g., live teammate) is the only reason to leave team state behind, and only briefly; escalate to the user if it can't be resolved.

**Never create a team in Stage N without first confirming the team from Stage N-1 is torn down.** Parallel live teams violate the nested-team rule even when the outer session isn't technically a teammate.

## Prerequisites — load team primitives FIRST (non-negotiable)

`TeamCreate`, `TeamDelete`, `SendMessage`, `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TaskStop` are **deferred tools** in CC's default tool set — they appear in the deferred tool list but their schemas are NOT loaded at session start. Calling any of them without pre-loading returns `InputValidationError`.

**First action on every team-do invocation** — load them in one ToolSearch call:

```
ToolSearch({
  query: "select:TeamCreate,TeamDelete,SendMessage,TaskCreate,TaskUpdate,TaskList,TaskGet,TaskStop",
  max_results: 10
})
```

This is the #1 reason team-do gets abandoned mid-Stage-1 — `TeamCreate` fails, classifier falls back to subagent fan-out, multi-turn coordination is lost. Don't skip the preload.

Only after the ToolSearch returns success do you move to the fork-bomb guards below.

## Fork-bomb guards — check FIRST (after preload), every invocation

**Refuse to activate if any of the following is true:**

1. Environment variable `DEV_TEAM_WORKER` is set to `1`. This session is already a worker inside another team — do NOT spawn a nested team.
2. The current session was spawned via `Agent(team_name=...)` — you're a teammate, not a lead.
3. The user's request is small: <3 files, no debate, no parallel-reviewable scope.

If any guard trips: abort immediately, tell the caller "team-do declined (nested/small/worker)", and let the caller route to a simpler path (Task, single-shot subagent, or direct edit).

## When team-do is the right call

Route here when **≥2 of these are true**:

- Task touches **≥3 independent files** that can be worked in parallel without edit conflicts
- Task spans **≥2 distinct subsystems** (auth + DB + API, or frontend + backend + infra)
- Task requires **multiple specialist lenses** (architecture + security + tests, or design + perf + types)
- Task has a **debate dimension** — "which approach is better", competing hypotheses, architecture decision
- Task is **verification-heavy** — needs parallel security-review + test-coverage-review + type-design-review

Route elsewhere when:
- Single file / single concern → use the direct Task path via `ship-feature` / `fix-bug` / `refactor-safely`
- Research / exploration / onboarding → `onboard-codebase`, no team
- Trivial tweak → direct edit, skip /do entirely

## Stage pipeline

Fixed 4-stage flow with a bounded fix-loop. Each stage produces a **handoff doc** under `.dev/handoffs/<stage>.md` that survives compaction and `TeamDelete`.

### Stage 1 — team-plan

Goal: decompose the task into N independent subtasks.

- Create team: `TeamCreate({ team_name: "plan-<shortslug>", description: "Plan <task>" })`
- Spawn teammates (parallel):
  - `Agent(subagent_type: "code-explorer", team_name, name: "explorer")` — map existing code, identify surface area
  - `Agent(subagent_type: "code-architect", team_name, name: "architect")` — propose approach + task split
- Teammates `SendMessage({to: "team-lead"})` on completion
- Lead writes `.dev/handoffs/plan.md`:
  ```markdown
  ## Decided
  - <approach + rationale>
  ## Rejected
  - <options + why not>
  ## Risks
  - <what could break>
  ## Files touched
  - <path:range> per subtask
  ## Subtasks
  - [task-1] <subject> — owner: worker-1 — files: <paths>
  - [task-2] …
  ## Remaining work
  - <anything for next stage>
  ```
- Shut down: `SendMessage` shutdown_request to each teammate, wait for `shutdown_response`, then `TeamDelete`

### Stage 2 — team-exec

Goal: execute the N subtasks in parallel.

- `TeamCreate({ team_name: "exec-<shortslug>" })`
- Read `.dev/handoffs/plan.md`, spawn **N teammates** (one per subtask) using `code-reviewer` style agents via `Agent(subagent_type: "code-reviewer", team_name, name: "worker-K")`. N = subtask count, capped at 5.
- Lead creates N tasks: `TaskCreate({subject, description})`, then `TaskUpdate({task_id, owner: "worker-K"})`
- Each teammate spawns with a **worker preamble** (see below) forbidding nested teams
- Teammates complete their tasks, `SendMessage` lead, lead marks `TaskUpdate({status: "completed"})`
- Lead writes `.dev/handoffs/exec.md` summarizing all diffs, per-task outcome, test-run-so-far state
- Shut down + `TeamDelete`

### Stage 3 — team-verify

Goal: parallel multi-lens review of the exec output.

- `TeamCreate({ team_name: "verify-<shortslug>" })`
- Spawn 3 teammates in parallel:
  - `Agent(subagent_type: "pr-review-toolkit:code-reviewer", team_name, name: "reviewer")`
  - `Agent(subagent_type: "pr-review-toolkit:silent-failure-hunter", team_name, name: "silent-failure-hunter")`
  - `Agent(subagent_type: "pr-review-toolkit:pr-test-analyzer", team_name, name: "test-analyzer")`
- Each reports findings via `SendMessage`. Lead aggregates into `.dev/handoffs/verify.md` with severity (high/med/low).
- If zero high-severity findings → skip Stage 4, done.
- Shut down + `TeamDelete`

### Stage 4 — team-fix (bounded loop, max 3 iterations)

Only if Stage 3 surfaced high-severity findings.

- `TeamCreate({ team_name: "fix-<shortslug>-iter-<N>" })`
- Spawn 1–2 `code-reviewer` teammates, one per finding cluster
- Fix → re-run Stage 3 style checks inline → if still high-severity, iterate (max 3)
- Write `.dev/handoffs/fix.md` each iteration
- After 3 iterations, escalate to user with the remaining findings — do NOT loop forever

## Worker preamble (first lines of every teammate spawn)

Every `Agent()` spawn within a team MUST start its prompt with:

```
You are a teammate in team "<team_name>", role "<name>". HARD RULES:
- NEVER call TeamCreate, TeamDelete, or activate the team-do / do skill.
- NEVER spawn further Agent() / Task() / subagent calls.
- NEVER run orchestration, loop, or ralph-style recursion.
- Work ONLY your assigned task(s). Report completion via SendMessage to "team-lead".
- If blocked, SendMessage the lead with a clear description; do not escalate autonomously.
Your assigned work:
<task body here>
```

This preamble is non-negotiable — without it, a teammate can recursively spawn its own team and fork-bomb the host.

## Coordination rules

- **Push, not poll.** Teammates `SendMessage` on completion or block. Lead does NOT poll `TaskList` — messages arrive as conversation turns.
- **One task per owner at a time.** Pre-assign via `TaskUpdate({owner})`; no atomic-claim race.
- **5-min stuck → status check.** If a teammate hasn't messaged in 5 min, `SendMessage({to: <name>, message: "status?"})`.
- **10-min silent → reassign.** Mark task pending, assign to another teammate; quarantine the silent one.
- **Filter internal tasks.** Every `Agent()` spawn auto-creates an internal lifecycle task with `metadata._internal: true`. Ignore those when checking completion state.

## Shutdown — see "Shutdown contract (non-negotiable)" at top

The authoritative 5-step blocking sequence is in the **Shutdown contract** section near the top of this file. Every stage end runs it. No variation.

## Handoff docs — how they survive

All handoffs live in `.dev/handoffs/<stage>.md` relative to the project root (or `~/.dev/handoffs/<session>/<stage>.md` in global scope). They:

- Survive `TeamDelete` (team state is wiped, handoffs persist on disk)
- Survive `/compact` (they're files, not transcript)
- Are the single source of truth for the next stage
- Are read-only for teammates; only the lead writes them

## Error handling

- **Teammate crashes** — lead reassigns the task. After 2 failures on same task, escalate to user with the task description + last error.
- **Verify surfaces issues after max 3 fix iterations** — stop, write `.dev/handoffs/unresolved.md`, present to user.
- **TeamCreate fails** — fall back to sequential Task-based execution via `ship-feature` or `fix-bug`. Log the failure; don't retry.
- **Fork-bomb guard trips mid-stage** — immediate abort, `TeamDelete` any partial team, surface "nested team attempt from <teammate_name>" to user.

## Teams vs subagents — pick based on what the work needs

Not everything that looks parallel needs a team. Teams and subagents do different jobs.

Use subagents (parallel `Agent()` calls in one message) when:
- Each agent does independent one-shot work — explore + lint + test + security scan, all returning once
- Specialist reviews return and don't need to argue with each other
- No agent needs to remember what another did in a prior turn

Use a team (this skill) when:
- Multi-turn coordination is needed — reviewer at turn 2 uses what architect decided at turn 1
- Cross-iteration persistence matters — verify → fix loop where the fix teammate keeps the last verify findings
- Debate / competing hypotheses — agents must message each other, not just the lead
- Staged handoffs — plan → exec → verify → fix, with docs bridging stages

**If the work is one-shot and parallel is enough, subagents are the right tool.** If the work needs coordination that persists across turns, teams are the right tool. The classifier in `/do` picks based on what the work needs; this skill runs only when that's the right answer.

## What team-do is NOT

- Not a replacement for `ship-feature` / `fix-bug` on single-concern work
- Not a parallel agent framework — that's `Agent()` fan-out (stateless, one-shot)
- Not a daemon — teams live only for the duration of the turn/task; no persistent always-on fleet
- Not nestable — one team per session, enforced by worker preamble + `DEV_TEAM_WORKER` check
- Not triggered by keywords in a hook — classification happens in `/do`, deliberately, to avoid the fork-bomb case that oh-my-claudecode v4.12.0 deliberately removed

## Chains from / to

- **Chained from** `/do` — the classifier decides team-do vs single-shot path
- **Never chains to** itself — nested teams forbidden
- **May chain to** `release-cut` after team-verify passes with zero high-severity findings
