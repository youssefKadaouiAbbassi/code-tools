---
name: setup
description: Install the Ultimate Claude Code System v12 — 40 components, 7 MCP servers, 12 principles
command: /setup
---

# Setup Skill

Launches the interactive CLI installer for the Ultimate Claude Code System v12.

## Usage

Run `/setup` to start the interactive installer. It will:

1. Scan your environment (OS, shell, package manager, existing tools)
2. Install the primordial core (settings.json, CLAUDE.md, hooks, tmux, starship, mise, just)
3. Let you choose additional categories (Code Intelligence, Browser+Web, Memory, Security, etc.)
4. Verify everything is installed correctly
5. Show a summary

## Flags

- `--non-interactive` — Skip prompts, install everything with defaults
- `--tier primordial|recommended|all` — Install a specific tier
- `--dry-run` — Show what would change without modifying the filesystem

## Running

```bash
bun run bin/setup.ts
```

Or after npm publish:

```bash
bunx @youssefKadaouiAbbassi/code-tools-setup
```
