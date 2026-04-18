import { defineCommand, runCommand } from "citty";
import { $ } from "bun";
import pc from "picocolors";
import { join } from "node:path";
import { homedir } from "node:os";
import { detectEnvironment } from "../detect.js";
import { readJournal, diffJournals, type InstallJournal } from "../install-journal.js";
import { commandExists, log, fileExists } from "../utils.js";

type InstallSource = "git-clone" | "npm-global" | "npx" | "unknown";

async function detectInstallSource(): Promise<{ source: InstallSource; hint: string }> {
  const repoRoot = join(import.meta.dir, "..", "..");
  if (await fileExists(join(repoRoot, ".git"))) {
    return { source: "git-clone", hint: `cd ${repoRoot} && git pull && bun install` };
  }

  const exec = process.execPath;
  if (exec.includes("/_npx/") || exec.includes(`${homedir()}/.npm/_npx/`)) {
    return { source: "npx", hint: "re-invoke via `npx @youssefKadaouiAbbassi/yka-code-setup@latest update`" };
  }

  if (exec.includes("/dist/") || import.meta.dir.includes("/dist/")) {
    return { source: "unknown", hint: "this is a compiled binary — download the newer release from GitHub, or run `npm i -g @youssefKadaouiAbbassi/yka-code-setup@latest`" };
  }

  if (commandExists("npm")) {
    const ls = await $`npm ls -g --depth=0 --json`.quiet().nothrow();
    if (ls.exitCode === 0 && ls.text().includes("@youssefKadaouiAbbassi/yka-code-setup")) {
      return { source: "npm-global", hint: "npm i -g @youssefKadaouiAbbassi/yka-code-setup@latest" };
    }
  }

  return { source: "unknown", hint: "reinstall manually — source of this binary could not be determined" };
}

async function refreshSource(source: InstallSource, hint: string, skipRefresh: boolean): Promise<boolean> {
  if (skipRefresh) {
    log.info(`Skipping source refresh (--skip-refresh). Using current binary.`);
    return true;
  }

  if (source === "git-clone") {
    const repoRoot = join(import.meta.dir, "..", "..");
    log.info(`Pulling latest from git clone at ${repoRoot}`);
    const pull = await $`sh -c ${`cd ${repoRoot} && git pull --ff-only`}`.nothrow();
    if (pull.exitCode !== 0) {
      log.warn(`git pull exited ${pull.exitCode}; continuing with current tree`);
    }
    return true;
  }

  if (source === "npm-global") {
    log.info(`Updating global install: ${hint}`);
    const r = await $`sh -c ${hint}`.nothrow();
    if (r.exitCode !== 0) {
      log.error(`Global update failed (exit ${r.exitCode}). Try: ${hint}`);
      return false;
    }
    return true;
  }

  if (source === "npx") {
    log.warn(`Detected npx invocation. Re-run directly for fresh code: ${hint}`);
    return true;
  }

  log.warn(`Unknown install source. Skipping refresh. Hint: ${hint}`);
  return true;
}

function printDiff(diff: ReturnType<typeof diffJournals>): void {
  const lines: string[] = [];
  const fmt = (label: string, items: string[]) => {
    if (items.length === 0) return;
    lines.push(`  ${pc.bold(label)}: ${items.join(", ")}`);
  };
  fmt(pc.green("+ skills"), diff.addedSkills);
  fmt(pc.red("- skills"), diff.removedSkills);
  fmt(pc.green("+ commands"), diff.addedCommands);
  fmt(pc.red("- commands"), diff.removedCommands);
  fmt(pc.green("+ agents"), diff.addedAgents);
  fmt(pc.red("- agents"), diff.removedAgents);
  fmt(pc.green("+ hooks"), diff.addedHooks);
  fmt(pc.red("- hooks"), diff.removedHooks);
  fmt(pc.green("+ plugins"), diff.addedPlugins.map((p) => `${p.name}@${p.marketplace}`));
  fmt(pc.red("- plugins"), diff.removedPlugins.map((p) => `${p.name}@${p.marketplace}`));
  if (lines.length === 0) {
    log.info("No set changes since last install.");
  } else {
    log.info("Changes since last install:");
    for (const l of lines) console.log(l);
  }
}

async function uninstallStalePlugins(removed: { name: string; marketplace: string }[]): Promise<void> {
  if (removed.length === 0) return;
  if (!commandExists("claude")) {
    log.warn(`Claude Code CLI not found; skipping plugin uninstall of ${removed.length} stale plugin(s)`);
    return;
  }
  for (const pl of removed) {
    log.info(`Uninstalling stale plugin: ${pl.name}@${pl.marketplace}`);
    const r = await $`claude plugin uninstall ${pl.name}@${pl.marketplace}`.nothrow();
    if (r.exitCode !== 0) {
      log.warn(`claude plugin uninstall ${pl.name}@${pl.marketplace} exited ${r.exitCode}`);
    }
  }
}

export default defineCommand({
  meta: {
    name: "update",
    description: "Refresh source, replay setup with saved tier, clean stale entries, report diff",
  },
  args: {
    "skip-refresh": {
      type: "boolean",
      description: "Skip source-of-binary refresh (git pull / npm i -g); just replay setup",
    },
    "dry-run": {
      type: "boolean",
      description: "Show what would change without modifying the filesystem",
    },
    tier: {
      type: "string",
      description: "Override tier (default: value from previous install)",
    },
    verbose: {
      type: "boolean",
      alias: "v",
      description: "Verbose output",
    },
  },
  async run({ args }) {
    const dryRun = !!args["dry-run"];
    const skipRefresh = !!args["skip-refresh"];
    const verbose = !!args.verbose;

    const prev = await readJournal();
    if (prev) {
      log.info(`Previous install: v${prev.version} (${prev.tier}, ${prev.scope}) at ${prev.installedAt}`);
    } else {
      log.warn(`No previous install journal found. Treating as first install with default tier.`);
    }

    const { source, hint } = await detectInstallSource();
    log.info(`Install source: ${source}`);
    const refreshed = await refreshSource(source, hint, skipRefresh);
    if (!refreshed) {
      log.error("Aborting update: source refresh failed.");
      process.exit(1);
    }

    const tier = (args.tier as string | undefined) ?? prev?.tier ?? "recommended";
    log.info(`Replaying setup with tier=${tier}${dryRun ? " (dry-run)" : ""}`);

    const setupCmd = await import("./setup/index.js").then((m) => m.default);
    const rawArgs: string[] = ["--non-interactive", "--tier", tier];
    if (dryRun) rawArgs.push("--dry-run");
    if (verbose) rawArgs.push("--verbose");
    await runCommand(setupCmd, { rawArgs });

    if (dryRun) return;

    const next: InstallJournal | null = await readJournal();
    if (!next) {
      log.warn("No journal written after setup — unable to compute diff.");
      return;
    }
    const diff = diffJournals(prev, next);
    printDiff(diff);
    await uninstallStalePlugins(diff.removedPlugins);

    const env = await detectEnvironment();
    log.success(`Update complete → v${next.version} (${next.tier}, ${next.scope}) at ${env.claudeDir}`);
  },
});
