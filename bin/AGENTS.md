<!-- Generated: 2026-04-14 | Updated: 2026-04-14 -->

# bin/

Parent: [`../AGENTS.md`](../AGENTS.md)

## Purpose

CLI executable entry points for `@youssefKadaouiAbbassi/code-tools-setup`. This directory contains the thin dispatcher layer that `package.json` exposes via the `bin` field and that `bunx` invokes. All business logic lives in `../src/`; files here only parse arguments and delegate to the command modules in `../src/commands/`.

## Key Files

| File | Role |
|------|------|
| `setup.ts` | Single executable entry point. Defines the root `citty` command (flags: `--non-interactive`, `--tier`, `--dry-run`, `--verbose`), registers three lazy-loaded subcommands (`setup`, `status`, `restore`), and falls through to the `setup` subcommand when no subcommand is passed. |

Resolution path:

```
package.json "bin"                    -> ./bin/setup.ts
bunx @youssefKadaouiAbbassi/...-setup -> bin/setup.ts
bun run dev / bun run start           -> bin/setup.ts
bun run build                         -> compiles bin/setup.ts to dist/code-tools-setup
```

## Invocation

Verified commands:

```bash
# Help (root + any subcommand via --help)
bun run bin/setup.ts --help
bun run bin/setup.ts setup --help

# Default (no subcommand) = setup
bun run bin/setup.ts

# Subcommands
bun run bin/setup.ts setup
bun run bin/setup.ts status
bun run bin/setup.ts restore

# Flags
bun run bin/setup.ts --non-interactive
bun run bin/setup.ts --tier=recommended
bun run bin/setup.ts --dry-run --verbose
```

## For AI Agents

### Working In This Directory

- **Keep `bin/` thin.** `setup.ts` must remain a dispatcher. New logic, prompts, filesystem work, and install steps belong in `../src/` (usually `../src/commands/` or `../src/components/`), never here.
- **Subcommands are lazy-imported.** Every entry in `subCommands` uses `() => import(...).then(m => m.default)` so bunx startup stays fast and unused code paths never load. Follow the same pattern when registering new subcommands.
- **Shebang is required.** `#!/usr/bin/env bun` must be the first line — `npm`/`bun` use it when the package is installed globally and the file is invoked directly.
- **Entry is declared in `package.json`.** The `bin` field maps `code-tools-setup` -> `./bin/setup.ts`. Renaming the file requires updating `package.json`, `scripts.dev`, `scripts.start`, `scripts.build`, `scripts.build:npm`, and the `bootstrap.sh` / README invocation examples.
- **Default command is `setup`.** The root `run()` delegates to `src/commands/setup.js` so `bunx @youssefKadaouiAbbassi/code-tools-setup` (no subcommand) installs. Do not change this without a deprecation plan.
- **Import from compiled paths.** Dynamic imports use the `.js` extension (`../src/commands/setup.js`) — this is correct under `tsconfig`'s `ESNext`/`bun-types` setup because Bun resolves `.js` specifiers to the neighboring `.ts` source. Do not switch to `.ts` specifiers; it breaks the compiled `bun build --compile` artifact.
- **Stack is locked.** CLI parsing is `citty`. Do not swap in `commander`, `yargs`, or `cac`. Prompts, colors, and JSON merging stay in their assigned libraries (see parent `AGENTS.md`).

### Hard Rules

1. **No side effects at import time.** Top level may declare the command and call `runMain` — it may not read the filesystem, spawn processes, or prompt. All such work happens inside subcommand `run()` handlers in `../src/commands/`.
2. **Exit codes matter.** `citty`'s `runMain` handles exits; do not wrap it in `try/catch` that swallows non-zero exits. CI relies on them.
3. **Flags are declared once.** Root-level flags (`--non-interactive`, `--tier`, `--dry-run`, `--verbose`) are the contract. Subcommand-specific flags must be added to the subcommand's `args`, not the root.
4. **No `console.log` for user output.** User-facing output goes through `@clack/prompts` (notes, spinners, logs) inside the command modules. `bin/setup.ts` itself should produce no output beyond what `citty` emits.

### Verification After Changes

```bash
bun run bin/setup.ts --help           # root help renders
bun run bin/setup.ts setup --help     # each subcommand help renders
bun run bin/setup.ts --dry-run        # default command dispatch works
bun run build                         # standalone binary compiles
bun test tests/e2e                    # e2e CLI tests still pass
```

Also run `lsp_diagnostics` on `bin/setup.ts` after any edit.

## Dependencies

### Direct (runtime)

| Package | Why |
|---------|-----|
| `citty` `^0.2` | Command/subcommand definition, argument parsing, `runMain`, `runCommand` |

### Transitive at dispatch time

`bin/setup.ts` dynamically imports:

- `../src/commands/setup.ts` — full install flow
- `../src/commands/status.ts` — installed/missing component report
- `../src/commands/restore.ts` — restore from `~/.claude-backup/{timestamp}/`

These pull in `@clack/prompts`, `picocolors`, `deepmerge-ts`, and the `src/components/*` installers — but only when the matching subcommand is invoked.

### External runtime

- **Bun** `>= 1.2` — required to execute `bin/setup.ts` directly (shebang uses `env bun`).
- Compiled artifact (`bun build --compile`) is self-contained and does not require Bun on the target machine.

<!-- MANUAL: -->
