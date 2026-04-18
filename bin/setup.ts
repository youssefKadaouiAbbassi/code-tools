#!/usr/bin/env bun
import { defineCommand, runMain, runCommand } from "citty";

const main = defineCommand({
  meta: {
    name: "yka-code-setup",
    version: "0.1.0",
    description:
      "Interactive CLI installer for the yka-code",
  },
  args: {
    "non-interactive": {
      type: "boolean",
      description: "Skip prompts, install everything with defaults",
    },
    tier: {
      type: "string",
      description: "Install tier: core, recommended, all",
    },
    "dry-run": {
      type: "boolean",
      description: "Show what would change without modifying the filesystem",
    },
    verbose: {
      type: "boolean",
      alias: "v",
      description: "Verbose output",
    },
    "clean-install": {
      type: "boolean",
      description: "Backup existing Claude Code setup and install fresh (recommended for first-time users)",
    },
    "add-on-top": {
      type: "boolean",
      description: "Preserve existing Claude Code setup and add our components alongside",
    },
    global: {
      type: "boolean",
      description: "Install globally in ~/.claude (recommended)",
    },
    local: {
      type: "boolean",
      description: "Install in current directory instead of globally",
    },
    "yes-wipe": {
      type: "boolean",
      description: "Non-interactive confirmation for --clean-install",
    },
    "force-overwrite": {
      type: "boolean",
      description: "In --add-on-top mode, overwrite conflicts (snapshotted)",
    },
  },
  subCommands: {
    setup: () => import("../src/commands/setup/index.js").then((m) => m.default),
    status: () => import("../src/commands/status.js").then((m) => m.default),
    restore: () => import("../src/commands/restore.js").then((m) => m.default),
    update: () => import("../src/commands/update.js").then((m) => m.default),
    hooks: () => import("../src/commands/hooks.js").then((m) => m.default),
  },
  async run({ rawArgs }) {
    const subcommandNames = ["setup", "status", "restore", "update", "hooks"];
    const firstNonFlag = rawArgs.find((a) => !a.startsWith("-"));
    if (firstNonFlag && subcommandNames.includes(firstNonFlag)) {
      // Subcommand was matched and already executed by citty — do nothing.
      return;
    }
    const setupCmd = await import("../src/commands/setup/index.js").then(
      (m) => m.default
    );
    await runCommand(setupCmd, { rawArgs });
  },
});

runMain(main);
