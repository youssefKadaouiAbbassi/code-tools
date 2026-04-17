---
plugin: code-tools
name: worktree-task
description: One-worktree-per-task workflow using `EnterWorktree` / `ExitWorktree`. Activate when the user asks to work on a feature/fix in isolation, mentions "parallel branches", "keep master clean", "don't touch the current working tree", or when `/do:ship-feature` is about to start a net-new feature. Also activate when multiple concurrent tasks are running and their file edits could collide.
---

# Worktree-first task isolation

Claude Code's `EnterWorktree` / `ExitWorktree` tools let a session switch into an isolated git worktree for the duration of a task. Unlike plain `git worktree add`, the session's cwd, cache, and auto-memory all move with it — changes never leak into the main tree, and concurrent teammates can work the same repo without stomping each other.

## When to enter a worktree

| Trigger | Worktree? |
|---|---|
| Net-new feature (`/do:ship-feature` kicking off) | **Yes** — default. One task, one worktree. |
| Bug fix that touches ≥3 files | **Yes** — fewer merge surprises. |
| Multiple agents running in parallel on the same repo | **Yes, per agent**. Prevents cross-contamination. |
| Single-file typo / doc tweak | No. Worktree overhead > value. |
| Refactor that spans most of `src/` | No — branch directly; worktree adds friction without isolation gain. |
| Reading / exploring without edits | No. |

## Entry recipe

1. **Pick a branch name** — short, kebab-case, prefixed by type: `feat-rate-limiter`, `fix-auth-timeout`, `chore-weekly-sweep`.
2. **Call `EnterWorktree`** with the branch name. Claude Code creates `<repo>/.worktrees/<branch>` (or respects `worktree.symlinkDirectories` / `worktree.sparsePaths`) and switches cwd in.
3. **If the `WorktreeCreate` hook is installed**, it fires post-switch — use it to seed `.envrc` with scrubbed secrets, skip `node_modules` hydration, etc.
4. **Work the task** — every Edit/Write/Bash now lands in the worktree. The main tree stays untouched.
5. **Commit as you go.** The worktree has its own index; commits land on its branch.

## Exit recipe

- **Task complete + merged**: call `ExitWorktree`. Claude switches back to the main tree. If the PR was squash-merged, the worktree may be auto-cleaned (CC v2.1.105 cleanup-on-squash-merge behavior).
- **Task abandoned**: `ExitWorktree`, then `git worktree remove .worktrees/<branch> --force` and delete the branch (`git branch -D <branch>`).
- **Pausing to switch tasks**: `ExitWorktree` is idempotent — you can re-enter later with `EnterWorktree({ path: ".worktrees/<branch>" })` (v2.1.105+).

## Pairing with parallel subagents

When `/do` dispatches multiple subagents (e.g. feature-dev's code-explorer + code-architect in parallel), each subagent should own its own worktree. Pattern:

1. Parent session enters `feat-X` worktree.
2. Parent spawns subagent A with `isolation: "worktree"` → runs in `.worktrees/feat-X-agent-A`.
3. Parent spawns subagent B likewise.
4. On agent completion, parent merges the sub-worktrees back into `feat-X` via git, then `ExitWorktree` on the subs.

This avoids the classic failure mode where two agents both edit `types.ts` and the second silently overwrites the first.

## Hooks worth having

- **`WorktreeCreate`** — seed sanitized env into the new tree (`.envrc`, `.mcp.json` replica without live tokens).
- **`WorktreeRemove`** — shred `.env.local`, archive final diff to session log before tree is gone.

Both hooks are supported from v2.1.74+. Install them only once worktree-first is the default pattern for the project — otherwise they rarely fire.

## Hard rules

- **One task, one worktree.** Don't reuse a `feat-X` worktree for `feat-Y` just because it's warm.
- **Always `ExitWorktree` before closing the session.** Stale cwd in a removed worktree breaks the next `--resume`.
- **Don't commit to `master` from within a worktree.** `HEAD` points at the worktree's branch; verify with `git branch --show-current` before commit.
- **Sparse-checkout for monorepos.** Set `worktree.sparsePaths` in `settings.json` to skip `node_modules`/`target`/`dist` in secondary trees — massive disk + hydration win.

## Anti-patterns

- **Worktree-then-immediate-commit-to-main.** If you end up merging by copying files back, the worktree didn't earn its keep.
- **Forgetting `ExitWorktree`** — subsequent commands run in stale cwd; cache lookups fail mysteriously.
- **Worktree for read-only tasks.** Use it for edits, not exploration.

## Chains to

- `ship-feature` — worktree per feature is the default entry.
- `fix-bug` — worktree per multi-file fix.
- `release-cut` — release branches always live in their own worktree.
