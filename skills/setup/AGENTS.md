<!-- Generated: 2026-04-14 | Updated: 2026-04-14 -->

# skills/setup

## Purpose

Defines the `/setup` slash command for Claude Code. This skill lets Claude Code itself invoke the **Ultimate Claude Code System v12** installer (this repository's CLI) as a native slash command, so a user inside Claude Code can run `/setup` instead of dropping to a shell and typing `bunx @youssefKadaouiAbbassi/code-tools-setup`.

Parent: [`../AGENTS.md`](../AGENTS.md) (the `skills/` tree — see root [`AGENTS.md`](../../AGENTS.md) for repo-wide context).

## Key Files

| File | Description |
|------|-------------|
| `SKILL.md` | Skill manifest. YAML frontmatter declares `name: setup`, `description`, and `command: /setup`. Markdown body documents usage, flags (`--non-interactive`, `--tier`, `--dry-run`), and the `bun run bin/setup.ts` entry point. |

No other files exist in this directory — the skill is a single manifest by design.

## Contract

- `name` — must stay `setup` (matches the slash command).
- `command` — must stay `/setup` (the user-facing trigger).
- `description` — single sentence, present tense, describes what the installer does (not what the skill is).
- Body — usage steps (what the installer does interactively), flags (mirror `bin/setup.ts` CLI args), and the runnable entry point.

The manifest is consumed by Claude Code's skill loader. It is **not** executed directly; invoking `/setup` delegates to the CLI defined in [`../../bin/setup.ts`](../../bin/setup.ts).

## For AI Agents

### Working With This Skill

- **Keep `SKILL.md` in sync with `bin/setup.ts`.** When the installer adds, removes, or renames a flag, update the `## Flags` section here in the same commit. Drift between the manifest and the CLI is a user-visible bug.
- **Do not add executable code here.** This directory is documentation-only. Installer logic belongs in `src/` and `bin/`.
- **Frontmatter is YAML, not JSON.** Do not wrap values in quotes unless they contain special characters. Preserve the `---` fences.
- **`command` must start with `/`** — Claude Code's slash-command registry requires the leading slash.
- **Do not rename the directory.** Claude Code discovers skills by directory name; `setup/` is the contract.
- **Do not self-approve edits.** Per Principle 7, authoring (writer) and review (reviewer/verifier) are separate passes. Hand off to `code-reviewer` after changes.

### Adding a New Skill

If you add a sibling skill (e.g. `skills/doctor/`), it must:

1. Live in its own directory under `skills/`.
2. Contain a `SKILL.md` with the same frontmatter shape (`name`, `description`, `command`).
3. Get its own `AGENTS.md` following this template.
4. Be referenced from the parent `skills/AGENTS.md` and, if user-facing, from the root `README.md`.

## Dependencies

### Runtime (what consumes this)

- **Claude Code skill system** — loads `SKILL.md` when the user types `/setup` inside a Claude Code session.
- **`bin/setup.ts`** — the actual installer the slash command dispatches to. See [`../../bin/setup.ts`](../../bin/setup.ts) (wired via `citty`).

### Install-time (what the installer deploys)

- Bun `>= 1.2`
- Claude Code (the system being configured)
- `jq` (required by hook scripts)

See the root [`AGENTS.md`](../../AGENTS.md) § Dependencies for the full runtime matrix.

<!-- MANUAL: -->
