import { defineCommand } from "citty";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { detectEnvironment } from "../../detect.js";
import { isLocalScope } from "../../scope.js";
import { verifyAll } from "../../verify.js";
import {
  selectInteractive,
  pickCategoriesForTier,
} from "./select-categories.js";
import {
  installCoreStep,
  installCategories,
  reapplyHardenedSettings,
  recordJournal,
  handleInstallFailure,
} from "./execute-installs.js";
import {
  formatEnvLine,
  renderLocalScopeSummary,
  renderInstallSummary,
  renderRestartHints,
  renderManualSteps,
} from "./summarize-results.js";
import { promptForMcpKeys } from "./mcp-keys.js";
import { log } from "../../utils.js";
import { performCleanInstall } from "../../utils/backup.js";
import { resolveInstallMode, type ResolvedInstallMode } from "../../install-mode.js";
import type { DeployMode } from "../../add-on-top.js";
import type { DetectedEnvironment } from "../../types.js";

function toDeployMode(resolved: ResolvedInstallMode): DeployMode {
  return {
    mode: resolved.mode,
    addOnTopLogPath: resolved.addOnTopLogPath,
    conflictPolicy: resolved.conflictPolicy,
    claudeDir: resolved.resolvedEnv.claudeDir,
  };
}

async function runInteractive(dryRun: boolean, envOverride?: DetectedEnvironment, deployMode?: DeployMode): Promise<void> {
  clack.intro(pc.bold(pc.cyan("yka-code")) + pc.dim(" — Setup"));

  const s = clack.spinner();
  s.start("Scanning your environment...");
  const env = envOverride ?? await detectEnvironment();
  s.stop("Environment detected");

  clack.note(formatEnvLine(env), "Detected environment");
  clack.note(
    [
      "The core layer installs the core Claude Code foundation:",
      "  • Hook scripts (pre-tool-use, post-tool-use, notification, stop)",
      "  • settings.json with hardened permissions.deny rules",
      "  • Shell RC additions (aliases, env vars)",
      "",
      pc.dim("Backups of existing files will be created before any changes."),
    ].join("\n"),
    "What the core install does",
  );

  // Don't wrap in a spinner: core may shell out to apt/brew/etc which need stdin/stdout for sudo prompts.
  log.info("Installing core (you may be prompted for sudo)...");
  const coreResults = await installCoreStep(env, dryRun, deployMode);
  log.success("Core step complete");

  if (isLocalScope(env)) {
    const report = await verifyAll(env, coreResults);
    renderLocalScopeSummary(env, report);
    clack.outro(pc.bold("Setup complete!"));
    return;
  }

  const { categories: selectedCategories, skippedComponents } = await selectInteractive();

  // No clack.spinner — third-party installers (claude-mem, snyk) print their own TUI that conflicts with terminal control.
  const categoryResults = await installCategories(env, selectedCategories, skippedComponents, dryRun, {
    onStart: (name) => log.info(`Installing ${name}...`),
    onDone: (name, failed) => failed > 0 ? log.warn(`${name} — ${failed} failed`) : log.success(`${name} — done`),
    onThrow: (name, err) => {
      log.error(`${name} — error: ${err instanceof Error ? err.message : String(err)}`);
      return {
        component: name,
        status: "failed",
        message: `Category install threw: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    },
  });

  const allResults = [...coreResults, ...categoryResults];
  await reapplyHardenedSettings(env, dryRun);

  const vs = clack.spinner();
  vs.start("Running verification...");
  const report = await verifyAll(env, allResults);
  vs.stop("Verification complete");

  renderInstallSummary(allResults, report);
  renderRestartHints(allResults);
  renderManualSteps(allResults);

  await promptForMcpKeys(env, selectedCategories);

  if (!dryRun) await recordJournal(env, "all");

  clack.outro(pc.bold("Setup complete!") + pc.dim(" Restart your terminal to activate."));
}

async function runBatch(
  env: DetectedEnvironment,
  dryRun: boolean,
  tier: string | undefined,
  verbose: boolean,
  deployMode?: DeployMode,
): Promise<void> {
  log.info(`Tier: ${tier ?? "all"}, dry-run: ${dryRun}`);
  log.info(`OS: ${env.os} (${env.arch}), shell: ${env.shell}, pkg: ${env.packageManager}`);

  const coreResults = await installCoreStep(env, dryRun, deployMode);
  if (tier === "core" || isLocalScope(env)) {
    if (isLocalScope(env)) log.info("Local install complete (category installers skipped — they're user-global).");
    else log.info("Core tier complete.");
    const report = await verifyAll(env, coreResults);
    log.info(`Verification: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped`);
    return;
  }

  const categoryResults = await installCategories(env, pickCategoriesForTier(tier), new Set(), dryRun, {
    onStart: (name) => log.info(`Installing category: ${name}`),
    onThrow: (name, err) => {
      log.error(`Category ${name} threw: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    },
  });
  if (verbose) {
    for (const r of categoryResults) {
      if (r.status === "failed") log.error(`  FAILED: ${r.component} — ${r.message}`);
      else log.success(`  ${r.component}: ${r.message}`);
    }
  }
  const allResults = [...coreResults, ...categoryResults];

  await reapplyHardenedSettings(env, dryRun);
  const report = await verifyAll(env, allResults);
  log.info(`Verification: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped`);

  if (!dryRun) await recordJournal(env, tier);
}

export default defineCommand({
  meta: {
    name: "setup",
    description: "Install the yka-code",
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
    "clean-install": {
      type: "boolean",
      description: "Backup existing Claude Code setup and install fresh",
    },
    "add-on-top": {
      type: "boolean",
      description: "Preserve existing Claude Code setup and add our components",
    },
    global: {
      type: "boolean",
      description: "Install globally in ~/.claude (recommended)",
    },
    local: {
      type: "boolean",
      description: "Install in current directory",
    },
    "yes-wipe": {
      type: "boolean",
      description: "Non-interactive confirmation for --clean-install destructive operation",
    },
    "force-overwrite": {
      type: "boolean",
      description: "In --add-on-top mode, overwrite conflicting files instead of skipping (snapshotted)",
    },
  },
  async run({ args }) {
    const dryRun = Boolean(args["dry-run"]);

    if (args["clean-install"] && args["add-on-top"]) {
      log.error("Cannot use both --clean-install and --add-on-top. Choose one.");
      process.exit(1);
    }
    if (args.global && args.local) {
      log.error("Cannot use both --global and --local. Choose one.");
      process.exit(1);
    }
    if (args.tier) {
      const validTiers = ["core", "recommended", "all"];
      if (!validTiers.includes(args.tier)) {
        log.error(`Unknown tier "${args.tier}". Valid tiers: ${validTiers.join(", ")}`);
        process.exit(1);
      }
    }

    const env = await detectEnvironment();
    // No-TTY stdin (CI, pipes, tests) would hang prompts — treat as non-interactive.
    const interactive = !args["non-interactive"] && process.stdin.isTTY === true;

    const resolved = await resolveInstallMode(
      {
        "clean-install": args["clean-install"],
        "add-on-top": args["add-on-top"],
        local: args.local,
        global: args.global,
        "yes-wipe": args["yes-wipe"],
        "force-overwrite": args["force-overwrite"],
        "non-interactive": args["non-interactive"],
      },
      env,
      { interactive, dryRun },
    );

    try {
      if (resolved.mode === "clean") {
        await performCleanInstall(resolved.resolvedEnv.claudeDir);
      }

      const deployMode = toDeployMode(resolved);

      if (!interactive || args.tier) {
        await runBatch(resolved.resolvedEnv, dryRun, args.tier, Boolean(args["non-interactive"]), deployMode);
        return;
      }

      await runInteractive(dryRun, resolved.resolvedEnv, deployMode);
    } catch (err) {
      await handleInstallFailure(err, resolved);
    }
  },
});
