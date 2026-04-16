<!-- Generated: 2026-04-14 | Updated: 2026-04-14 -->

# tasks/

## Purpose

Task tracking and project management artifacts for the `code-tools` installer itself. This directory is **dogfooded** — the same `tasks/lessons.md` corrections log that the installer deploys into every target project also lives here and governs work on this repo.

Parent: [`../AGENTS.md`](../AGENTS.md)

## Key Files

| File | Description |
|------|-------------|
| `lessons.md` | Corrections log — every time a correction is made to agent output, the lesson belongs here so it is never repeated. Protected: `primordial.ts` **never overwrites** this file once it exists. |

## For AI Agents

### Reading Protocol

- **Read `lessons.md` at session start.** The global rule in `~/.claude/CLAUDE.md` mandates this: "Read `tasks/lessons.md` at session start if it exists." Lessons override default behavior.
- Lessons are authoritative for this repo's conventions. If a lesson contradicts a default, follow the lesson.

### Writing Protocol

- **Append corrections, never edit history.** When the user corrects output, append a new entry rather than rewriting prior lessons.
- **One lesson per correction.** Keep entries short, concrete, and actionable — a rule a future agent can follow without re-deriving context.
- **Do not duplicate.** Grep before appending; if the lesson already exists, skip.
- **Never overwrite from code.** The installer's `primordial.ts` deploys a seed `lessons.md` only when absent. Agent edits to this file must preserve existing content.

### Scope

- This directory is for **corrections log** only. Do not add roadmaps, backlogs, or design docs here — those belong in `IMPLEMENTATION_PLAN.md` (build spec), `.omc/plans/` (transient plans), or `README.md` (architecture).
- Do not create new files in `tasks/` without updating this `AGENTS.md` and confirming the installer's primordial logic still matches.

### Installer Contract

The installer treats `tasks/lessons.md` as a **primordial tier** artifact deployed into every target project:

- Location in installed systems: `<project>/tasks/lessons.md`
- Deploy source: `configs/project-claude/tasks/lessons.md` (verify with `bun run dev --dry-run`)
- Overwrite policy: **never** — if the file exists at the target, the installer skips it
- Backup policy: not backed up (append-only; backup would defeat the preservation guarantee)

Any change to the file's role or overwrite semantics must be reflected in `src/primordial.ts`, `src/verify.ts`, and the `IMPLEMENTATION_PLAN.md` primordial tier definition.

## Dependencies

None at runtime. This directory holds plain Markdown. No task-management tooling (no Jira CLI, no `todo.txt`, no external tracker) is wired into the repo — `lessons.md` is read by agents directly and deployed by the installer as a file copy.

<!-- MANUAL: -->
