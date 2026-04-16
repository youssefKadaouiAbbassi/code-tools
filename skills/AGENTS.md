<!-- Generated: 2026-04-14 | Updated: 2026-04-14 -->

# skills/

## Purpose

Skill definitions for the Claude Code skill system. A **skill** is a self-contained capability exposed to Claude Code as a slash command — declared by a `SKILL.md` front-matter manifest plus any supporting files in its directory. Skills here ship with the installer so that the installed Claude Code environment can invoke `code-tools` workflows (such as running the installer itself) via slash commands.

Parent context: `../AGENTS.md` (root repository contract).

## Key Files

| File | Description |
|------|-------------|
| `setup/SKILL.md` | `/setup` skill — launches the interactive installer from inside Claude Code. Declares flags (`--non-interactive`, `--tier`, `--dry-run`) and entry command (`bun run bin/setup.ts`) |

Each skill lives in its own directory with a `SKILL.md` manifest. The manifest uses YAML front-matter with at minimum `name`, `description`, and `command` fields, followed by markdown body documenting usage.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `setup/` | The `/setup` skill — wraps the installer (`bin/setup.ts`) as a Claude Code slash command. See `setup/AGENTS.md` if present, otherwise `setup/SKILL.md` is the contract |

## For AI Agents

### Skill Definition Format

Every skill directory must contain a `SKILL.md` with YAML front-matter:

```yaml
---
name: <slug>
description: <one-line summary shown in skill catalog>
command: /<slash-command>
---
```

The markdown body documents: what the skill does, usage examples, flags/arguments, and the underlying command it runs.

### Adding A New Skill

1. Create `skills/<skill-name>/SKILL.md` with the front-matter above.
2. Keep the `description` to one line — it is surfaced in Claude Code's skill picker.
3. If the skill shells out, point to the real entry point in this repo (e.g. `bun run bin/setup.ts`) rather than duplicating logic.
4. If the installer should deploy the skill into the target `~/.claude/skills/`, wire that copy in the appropriate component under `src/components/` and add a `verify()` branch in `src/verify.ts`.
5. Add the skill to the installer's skill list so users know what they get.

### Working On Existing Skills

- **Do not invent skills.** Only document skills that actually exist in this directory.
- **Do not duplicate installer logic** inside `SKILL.md`. The manifest is a thin wrapper — the real work lives in `bin/` and `src/`.
- **Keep flags in sync** with the actual CLI (`bin/setup.ts`). If you add a flag to the installer, update `setup/SKILL.md` in the same change.
- **Skills are read-only contracts for the user.** Treat `SKILL.md` like public API documentation.

### Writer vs Reviewer

Author skill changes here; hand the approval pass to `code-reviewer` or `verifier` in a separate lane. Do not self-approve in the same context.

## Dependencies

- **Claude Code skill system** — host runtime that discovers skills via the `SKILL.md` manifest and exposes them as slash commands.
- **Installer entry points** (`bin/setup.ts`, `bunx @youssefKadaouiAbbassi/code-tools-setup`) — skills delegate to these; they are not reimplemented inside skill files.
- **Bun** `>= 1.2` — required by any skill that invokes `bun run ...`.

<!-- MANUAL: -->
