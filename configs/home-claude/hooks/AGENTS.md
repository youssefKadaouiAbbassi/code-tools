<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# configs/home-claude/hooks/

## Purpose

**Intentionally empty placeholder directory.** Its sole job is to guarantee that the deploy target `~/.claude/hooks/` exists on the user's machine before the installer copies the canonical hook scripts into it.

The actual user-scope hook scripts **do not live here**. They live in `configs/hooks/` (see `../../hooks/AGENTS.md`) and are deployed by `src/primordial.ts` into `~/.claude/hooks/` at install time. Keeping this directory under `configs/home-claude/` mirrors the target layout one-for-one, which keeps the installer's path resolution trivial.

## Key Files

| File | Status |
|------|--------|
| *(none)* | This directory is intentionally empty. `.gitkeep` is not required because the empty directory is tracked by virtue of containing this `AGENTS.md` |

If you find hook scripts (`*.sh`, `*.js`, `*.ts`) inside this directory, they are **misplaced** — move them to `configs/hooks/` and confirm `src/primordial.ts` still resolves the deploy path correctly.

## For AI Agents

### Working In `configs/home-claude/hooks/`

- **Do not add hook scripts here.** The canonical location is `configs/hooks/`. Adding scripts here breaks the installer's path contract documented in the parent `AGENTS.md` (see `../AGENTS.md`, "Subdirectories" table and "Working In `configs/home-claude/`" rule 2).
- **Do not delete this directory.** It must exist so the installer can compute `~/.claude/hooks/` as the deploy target before any hook file is copied.
- **`settings.json` hook wiring lives in `../settings.json`** (currently empty — hooks are not wired at global scope). Script bodies live in `../../hooks/`. This directory is neither.
- **Writer vs Reviewer** (root Principle 7): any structural change to this directory's role — even adding a single file — requires a separate `code-reviewer` pass. Do not self-approve.

### Hard Rules

1. **No scripts in this directory.** The installer expects it empty at source and populated only at the deploy target.
2. **No `.gitignore`, no `.gitkeep`** unless the directory would otherwise disappear from version control. The presence of `AGENTS.md` already pins it.
3. **If you need to add a new user-scope hook**, add it to `configs/hooks/`, wire it in `../settings.json`, and document it in `../../hooks/AGENTS.md`. Do not touch this directory.
4. **Backward-compatible only.** Removing this directory would make `src/primordial.ts` create `~/.claude/hooks/` on the fly, which works today but changes the install audit trail — do not change without updating `src/primordial.ts` and `src/verify.ts` in the same commit.

## Dependencies

### Runtime

| Requirement | Role | Required? |
|-------------|------|-----------|
| Filesystem directory entry | Installer's deploy-path target | **Yes** |

### Consumed By

- **`src/primordial.ts`** — resolves `~/.claude/hooks/` as the deploy target for scripts sourced from `configs/hooks/`; relies on this directory existing at the source tree to mirror the layout
- **`src/verify.ts`** — post-install check that `~/.claude/hooks/` exists and is writable

### External References

- Parent dir conventions — `../AGENTS.md` (especially the "Subdirectories" table that flags this directory as an intentional placeholder)
- Canonical hook catalog — `../../hooks/AGENTS.md`
- Global hook wiring — `../settings.json`
- Claude Code hooks docs — https://docs.claude.com/claude-code/hooks

<!-- MANUAL: -->
