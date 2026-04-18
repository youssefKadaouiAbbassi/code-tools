import { defineCommand } from "citty";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { detectEnvironment } from "../detect.js";
import { isLocalScope } from "../scope.js";
import { verifyAll } from "../verify.js";
import {
  selectInteractive,
  pickCategoriesForTier,
} from "./setup/select-categories.js";
import {
  installCoreStep,
  installCategories,
  reapplyHardenedSettings,
  recordJournal,
} from "./setup/execute-installs.js";
import {
  log,
  promptForMissingEnvVars,
  loadSecretsFromFile,
  saveSecretsToFile,
  getSecretsFilePath,
  appendToShellRc,
} from "../utils.js";
import { performCleanInstall, restoreFromBackup } from "../utils/backup.js";
import { resolveInstallMode, type ResolvedInstallMode } from "../install-mode.js";
import { rollbackAddOnTop, type DeployMode } from "../add-on-top.js";
import type { DetectedEnvironment } from "../types.js";

function toDeployMode(resolved: ResolvedInstallMode): DeployMode {
  return {
    mode: resolved.mode,
    addOnTopLogPath: resolved.addOnTopLogPath,
    conflictPolicy: resolved.conflictPolicy,
    claudeDir: resolved.resolvedEnv.claudeDir,
  };
}

// MCP servers that require API keys, in order of likelihood
const MCP_ENV_VARS: { key: string; description: string }[] = [
  { key: "DOCFORK_API_KEY", description: "Docfork documentation MCP server" },
  { key: "GITHUB_PAT", description: "GitHub MCP server" },
  { key: "COMPOSIO_API_KEY", description: "Composio workflow MCP (ak_... from app.composio.dev)" },
];

function formatEnvLine(env: DetectedEnvironment): string {
  const osLabel =
    env.os === "macos"
      ? `macOS (${env.arch})`
      : `Linux${env.linuxDistro ? ` / ${env.linuxDistro}` : ""} (${env.arch})`;

  const lines: string[] = [
    `OS:              ${osLabel}`,
    `Shell:           ${env.shell}`,
    `Package manager: ${env.packageManager}`,
    `Claude Code:     ${env.claudeCodeVersion ? `${env.claudeCodeVersion} ${pc.green("✓")}` : pc.yellow("not found")}`,
    `Docker:          ${env.dockerAvailable ? pc.green("available ✓") : pc.yellow("not available")}`,
    `Bun:             ${env.bunVersion ? `${env.bunVersion} ${pc.green("✓")}` : pc.yellow("not found")}`,
  ];

  return lines.join("\n");
}

async function runInteractive(dryRun: boolean, envOverride?: DetectedEnvironment, deployMode?: DeployMode): Promise<void> {
  clack.intro(
    pc.bold(pc.cyan("yka-code")) + pc.dim(" — Setup")
  );

  // --- 1. Environment scan ---
  const s = clack.spinner();
  s.start("Scanning your environment...");
  const env = envOverride ?? await detectEnvironment();
  s.stop("Environment detected");

  // --- 2. Show detected environment ---
  clack.note(formatEnvLine(env), "Detected environment");

  // --- 3. Explain core ---
  clack.note(
    [
      "The core layer installs the core Claude Code foundation:",
      "  • Hook scripts (pre-tool-use, post-tool-use, notification, stop)",
      "  • settings.json with hardened permissions.deny rules",
      "  • Shell RC additions (aliases, env vars)",
      "",
      pc.dim("Backups of existing files will be created before any changes."),
    ].join("\n"),
    "What the core install does"
  );

  // --- 4. Core install ---
  // Don't wrap in a spinner: core may shell out to package managers (apt/brew/etc)
  // which need stdin/stdout for sudo prompts and progress output.
  log.info("Installing core core (you may be prompted for sudo)...");
  const coreResults = await installCoreStep(env, dryRun, deployMode);
  log.success("Core core step complete");

  if (isLocalScope(env)) {
    const report = await verifyAll(env, coreResults);
    clack.note(
      `Project-scope install complete in ${env.claudeDir}.\nCategory installers skipped — MCPs/binaries belong at user scope.\nRun without --local to install those globally.`,
      "Local install complete",
    );
    clack.note(
      `Verification: ${pc.green(String(report.passed))} passed, ${report.failed > 0 ? pc.red(String(report.failed)) : pc.dim("0")} failed`,
      "Summary",
    );
    clack.outro(pc.bold("Setup complete!"));
    return;
  }

  const { categories: selectedCategories, skippedComponents } = await selectInteractive();

  // --- 6. Install selected categories ---
  // Don't wrap in clack.spinner — third-party installers (claude-mem, snyk, etc.)
  // print their own progress / TUI which conflicts with the spinner's terminal control.
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

  // --- 6.5. Re-apply hardened settings (some third-party installs reset deny rules) ---
  await reapplyHardenedSettings(env, dryRun);

  // --- 7. Verification ---
  const vs = clack.spinner();
  vs.start("Running verification...");
  const report = await verifyAll(env, allResults);
  vs.stop("Verification complete");

  // --- 8. Summary ---
  const installed = allResults.filter((r) => r.status === "installed" || r.status === "already-installed").length;
  const skipped = allResults.filter((r) => r.status === "skipped").length;
  const failed = allResults.filter((r) => r.status === "failed");

  const summaryLines: string[] = [
    `Installed: ${pc.green(String(installed))} components`,
    `Skipped:   ${pc.dim(String(skipped))}`,
    `Failed:    ${failed.length > 0 ? pc.red(String(failed.length)) : pc.dim("0")}`,
  ];

  if (failed.length > 0) {
    summaryLines.push("", "Failed components:");
    for (const f of failed) {
      summaryLines.push(`  ${pc.red("•")} ${f.component}: ${pc.dim(f.message)}`);
    }
  }

  summaryLines.push(
    "",
    `Verification: ${pc.green(String(report.passed))} passed, ${report.failed > 0 ? pc.red(String(report.failed)) : pc.dim("0")} failed`
  );

  clack.note(summaryLines.join("\n"), "Installation summary");

  // --- 8.5. Restart hints (any installed component that needs Claude Code restart) ---
  const claudeHudResult = allResults.find(r => r.component === "Claude HUD");
  if (claudeHudResult && (claudeHudResult.status === "installed" || claudeHudResult.status === "already-installed")) {
    clack.note(
      `${pc.bold("Claude HUD")} is wired into your statusline. ${pc.dim("Quit and relaunch Claude Code to see it.")}`,
      "ℹ️  Restart needed",
    );
  }

  // --- 8.6. Manual steps summary ---
  // Collect components whose install is complete on our side but require a one-time
  // user action (download a GUI app, pick a channel plugin, authenticate a SaaS, etc.).
  // Messages here should be copy-pasteable commands or URLs — not long explanations.
  const manualSteps: { name: string; action: string }[] = [];

  for (const r of allResults) {
    if (r.component === "Claude Code Action") {
      manualSteps.push({
        name: "Claude Code Action",
        action: "Add `uses: anthropics/claude-code-action@v1` to a workflow in .github/workflows/ of any repo you want reviewed",
      });
    }
  }

  if (manualSteps.length > 0) {
    clack.note(
      manualSteps.map((s) => `${pc.cyan("•")} ${pc.bold(s.name)}\n  ${s.action}`).join("\n\n"),
      "📝 Manual steps remaining",
    );
  }

  // --- 9. Post-install MCP key checklist ---
  // Show only if we installed categories that need API keys
  const installedCategoryIds = new Set(selectedCategories.map((c) => c.id));
  const needsKeys = MCP_ENV_VARS.filter(({ key }) => {
    if (key === "DOCFORK_API_KEY") return installedCategoryIds.has("browser-web");
    if (key === "GITHUB_PAT") return installedCategoryIds.has("github");
    if (key === "COMPOSIO_API_KEY") return installedCategoryIds.has("workflow");
    return false;
  });

  if (needsKeys.length > 0) {
    // Load any previously saved keys so we don't re-prompt for them
    const secretsPath = getSecretsFilePath(env.homeDir);
    const savedSecrets = await loadSecretsFromFile(secretsPath);

    // What's truly missing = not in env AND not in saved file
    const missing = needsKeys.filter(({ key }) => !process.env[key] && !savedSecrets[key]);
    const alreadyKnown = needsKeys.filter(({ key }) => process.env[key] || savedSecrets[key]);

    if (alreadyKnown.length > 0) {
      clack.note(
        [
          "Already configured (from environment or ~/.config/yka-code/secrets.env):",
          ...alreadyKnown.map(({ key, description }) => `  ${pc.green("✓")} ${pc.bold(key)}  ${pc.dim(`(${description})`)}`),
        ].join("\n"),
        "API keys on file",
      );
    }

    if (missing.length > 0) {
      const keyLines = [
        "To activate these MCP servers, provide these API keys:",
        ...missing.map(({ key, description }) => `  ${pc.cyan("-")} ${pc.bold(key)}  ${pc.dim(`(${description})`)}`),
        "",
        pc.dim("Saved to ~/.config/yka-code/secrets.env (chmod 600) and sourced from your shell rc."),
      ];
      clack.note(keyLines.join("\n"), "Required API keys");

      const setupKeys = await clack.confirm({
        message: "Enter the missing API keys now?",
        initialValue: true,
      });

      if (!clack.isCancel(setupKeys) && setupKeys) {
        const newTokens = await promptForMissingEnvVars(missing, true, savedSecrets);

        if (Object.keys(newTokens).length > 0) {
          try {
            await saveSecretsToFile(secretsPath, newTokens);
            // Wire shell rc to source the secrets file (idempotent via marker).
            await appendToShellRc(
              env,
              [
                `[ -f "${secretsPath}" ] && source "${secretsPath}"`,
              ],
              "secrets",
            );
            log.success(`Saved ${Object.keys(newTokens).length} key(s) to ${secretsPath}`);
            log.info(`Reload your shell to activate: ${pc.cyan(`source ${env.shellRcPath}`)}`);
          } catch (err) {
            log.error(`Failed to save secrets: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    } else {
      log.success("All required API keys are already configured — nothing to prompt for.");
    }
  }

  if (!dryRun) await recordJournal(env, "all");

  clack.outro(
    pc.bold("Setup complete!") + pc.dim(" Restart your terminal to activate.")
  );
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

    // Validate mutually exclusive options
    if (args["clean-install"] && args["add-on-top"]) {
      log.error("Cannot use both --clean-install and --add-on-top. Choose one.");
      process.exit(1);
    }

    if (args.global && args.local) {
      log.error("Cannot use both --global and --local. Choose one.");
      process.exit(1);
    }

    // Validate tier if provided
    if (args.tier) {
      const validTiers = ["core", "recommended", "all"];
      if (!validTiers.includes(args.tier)) {
        log.error(`Unknown tier "${args.tier}". Valid tiers: ${validTiers.join(", ")}`);
        process.exit(1);
      }
    }

    // --- Resolve install mode + scope (Phase 2 orchestrator) ---
    const env = await detectEnvironment();
    // No-TTY stdin (CI, pipes, tests) means prompts would hang. Treat as non-interactive.
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

    // --- Two-layer recoverable install wrapper (Phase 3) ---
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
      log.error(`Install failed: ${err instanceof Error ? err.message : String(err)}`);
      if (resolved.backupPath) {
        log.info("Attempting automatic rollback from full-tree backup...");
        try {
          await restoreFromBackup(resolved.backupPath, resolved.resolvedEnv.claudeDir);
          log.info("✓ Rollback complete. Original state restored.");
          process.exit(1);
        } catch (rollbackErr) {
          log.error(`Rollback failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`);
          log.error(`Manual recovery: run ${resolved.backupPath}/restore.sh`);
          process.exit(2);
        }
      } else if (resolved.addOnTopLogPath) {
        log.info("Attempting add-on-top rollback via write log...");
        try {
          await rollbackAddOnTop(resolved.addOnTopLogPath);
          log.info("✓ Add-on-top rollback complete.");
          process.exit(1);
        } catch (rollbackErr) {
          log.error(`Add-on-top rollback failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`);
          log.error(`Write log location: ${resolved.addOnTopLogPath}`);
          process.exit(2);
        }
      }
      process.exit(1);
    }
  },
});
