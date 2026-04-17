import { defineCommand } from "citty";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { detectEnvironment } from "../detect.js";
import { installPrimordial, isLocalScope } from "../primordial.js";
import { verifyAll } from "../verify.js";
import {
  RECOMMENDED_CATEGORIES,
  OPTIONAL_CATEGORIES,
  ALL_CATEGORIES,
  installCategory,
} from "../components/index.js";
import { join } from "path";
import {
  log,
  mergeJsonFile,
  getConfigsDir,
  promptForMissingEnvVars,
  loadSecretsFromFile,
  saveSecretsToFile,
  getSecretsFilePath,
  appendToShellRc,
} from "../utils.js";
import { performCleanInstall, restoreFromBackup } from "../utils/backup.js";
import { resolveInstallMode } from "../install-mode.js";
import { rollbackAddOnTop } from "../add-on-top.js";
import type { DetectedEnvironment, InstallResult, ComponentCategory } from "../types.js";

// Third-party installers can overwrite permissions.deny; re-apply ours last.
async function reapplyHardenedSettings(env: DetectedEnvironment, dryRun: boolean): Promise<void> {
  if (dryRun) return;
  const scope = env.claudeDir.startsWith(env.homeDir + "/") ? "home-claude" : "project-claude";
  const sourcePath = join(getConfigsDir(), scope, "settings.json");
  const targetPath = join(env.claudeDir, "settings.json");
  try {
    const patch = await Bun.file(sourcePath).json() as Record<string, unknown>;
    await mergeJsonFile(targetPath, patch);
    log.info("Re-applied hardened settings.json (deny rules + env vars)");
  } catch (err) {
    log.warn(`Could not re-apply hardened settings: ${err instanceof Error ? err.message : String(err)}`);
  }
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

function handleCancel(): never {
  clack.cancel("Setup cancelled.");
  process.exit(0);
}

async function runInteractive(dryRun: boolean, envOverride?: DetectedEnvironment): Promise<void> {
  clack.intro(
    pc.bold(pc.cyan("Ultimate Claude Code System v12")) + pc.dim(" — Setup")
  );

  // --- 1. Environment scan ---
  const s = clack.spinner();
  s.start("Scanning your environment...");
  const env = envOverride ?? await detectEnvironment();
  s.stop("Environment detected");

  // --- 2. Show detected environment ---
  clack.note(formatEnvLine(env), "Detected environment");

  // --- 3. Explain primordial ---
  clack.note(
    [
      "The primordial layer installs the core Claude Code foundation:",
      "  • Hook scripts (pre-tool-use, post-tool-use, notification, stop)",
      "  • settings.json with hardened permissions.deny rules",
      "  • Shell RC additions (aliases, env vars)",
      "",
      pc.dim("Backups of existing files will be created before any changes."),
    ].join("\n"),
    "What the core install does"
  );

  // --- 4. Primordial install ---
  // Don't wrap in a spinner: primordial may shell out to package managers (apt/brew/etc)
  // which need stdin/stdout for sudo prompts and progress output.
  log.info("Installing primordial core (you may be prompted for sudo)...");
  const primordialResults = await installPrimordial(env, dryRun);
  log.success("Primordial core step complete");

  if (isLocalScope(env)) {
    const report = await verifyAll(env, primordialResults);
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

  // --- 5. Two-section batch choice flow ---
  const selectedCategories: ComponentCategory[] = [];
  const skippedComponents = new Set<number>(); // Track components user doesn't want

  // --- SECTION 1: System Tools Batch Choice ---
  const systemComponents = [
    { id: 36, name: "Ghostty", description: "Fast, feature-rich GPU-accelerated terminal emulator" },
    { id: 39, name: "chezmoi", description: "Dotfile manager with templating and encryption" },
    { id: 41, name: "age", description: "Simple, modern file encryption tool" },
  ];

  clack.note(
    [
      "Optional system tools (not directly Claude Code related):",
      "",
      ...systemComponents.map(c => `  • ${pc.bold(c.name)} — ${c.description}`),
    ].join("\n"),
    "🛠️  System Tools"
  );

  const systemChoice = await clack.select({
    message: "Install these system tools?",
    options: [
      { value: "all", label: "Install all", hint: "recommended" },
      { value: "pick", label: "Let me pick", hint: "choose individually" },
      { value: "none", label: "Skip all", hint: "don't install any" },
    ],
    initialValue: "all",
  });

  if (clack.isCancel(systemChoice)) handleCancel();

  if (systemChoice === "all") {
    // Install all system tools - don't skip any
    const workstationCat = RECOMMENDED_CATEGORIES.find(cat => cat.id === "workstation");
    if (workstationCat) selectedCategories.push(workstationCat);
  } else if (systemChoice === "pick") {
    // Individual choice for each system tool
    for (const component of systemComponents) {
      const install = await clack.confirm({
        message: `Install ${pc.bold(component.name)}?\n  ${pc.dim(component.description)}`,
        initialValue: false,
      });
      if (clack.isCancel(install)) handleCancel();

      if (!install) {
        skippedComponents.add(component.id);
      }
    }

    // Include workstation category if any system tools were selected
    const selectedSystemTools = systemComponents.filter(c => !skippedComponents.has(c.id));
    if (selectedSystemTools.length > 0) {
      const workstationCat = RECOMMENDED_CATEGORIES.find(cat => cat.id === "workstation");
      if (workstationCat) selectedCategories.push(workstationCat);
    }
  } else {
    // Skip all system tools
    systemComponents.forEach(c => skippedComponents.add(c.id));
  }

  // --- SECTION 2: Claude Code Functionality Batch Choice ---
  const claudeCategories = RECOMMENDED_CATEGORIES.filter(cat => cat.id !== "workstation");

  clack.note(
    [
      "Claude Code functionality categories:",
      "",
      ...claudeCategories.map(c => `  • ${pc.bold(c.name)} — ${c.description}`),
      "",
      "Optional categories:",
      ...OPTIONAL_CATEGORIES.map(c => `  • ${pc.bold(c.name)} — ${c.description}`),
    ].join("\n"),
    "🎯 Claude Code Features"
  );

  const claudeChoice = await clack.select({
    message: "Install Claude Code functionality?",
    options: [
      { value: "all", label: "Everything", hint: "recommended - install all features" },
      { value: "recommended", label: "Recommended only", hint: "skip optional categories" },
      { value: "pick", label: "Let me pick", hint: "choose categories individually" },
      { value: "none", label: "Skip all", hint: "just system tools + core" },
    ],
    initialValue: "all",
  });

  if (clack.isCancel(claudeChoice)) handleCancel();

  if (claudeChoice === "all") {
    selectedCategories.push(...claudeCategories, ...OPTIONAL_CATEGORIES);
  } else if (claudeChoice === "recommended") {
    selectedCategories.push(...claudeCategories);
  } else if (claudeChoice === "pick") {
    // Individual choice for recommended categories
    for (const cat of claudeCategories) {
      const install = await clack.confirm({
        message: `${pc.bold(cat.name)}\n  ${pc.dim(cat.description)}`,
        initialValue: true,
      });
      if (clack.isCancel(install)) handleCancel();
      if (install) selectedCategories.push(cat);
    }

    // Individual choice for optional categories
    for (const cat of OPTIONAL_CATEGORIES) {
      const install = await clack.confirm({
        message: `${pc.bold(cat.name)}\n  ${pc.dim(cat.description)}`,
        initialValue: false,
      });
      if (clack.isCancel(install)) handleCancel();
      if (install) selectedCategories.push(cat);
    }
  }
  // else: none - skip all Claude Code functionality

  // --- 6. Install selected categories ---
  const categoryResults: InstallResult[] = [];

  for (const cat of selectedCategories) {
    // Don't wrap in clack.spinner — third-party installers (claude-mem, snyk, etc.)
    // print their own progress / TUI which conflicts with the spinner's terminal control.
    log.info(`Installing ${cat.name}...`);
    try {
      const results = await installCategory(cat, env, dryRun, skippedComponents);
      categoryResults.push(...results);
      const failed = results.filter((r) => r.status === "failed").length;
      if (failed > 0) {
        log.warn(`${cat.name} — ${failed} failed`);
      } else {
        log.success(`${cat.name} — done`);
      }
    } catch (err) {
      log.error(`${cat.name} — error: ${err instanceof Error ? err.message : String(err)}`);
      categoryResults.push({
        component: cat.name,
        status: "failed",
        message: `Category install threw: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      });
    }
  }

  const allResults = [...primordialResults, ...categoryResults];

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
    if (r.component === "Multica" && r.status === "installed") {
      manualSteps.push({
        name: "Multica",
        action: "Run `multica setup` to authenticate and start the agent daemon",
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
          "Already configured (from environment or ~/.config/code-tools/secrets.env):",
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
        pc.dim("Saved to ~/.config/code-tools/secrets.env (chmod 600) and sourced from your shell rc."),
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

  clack.outro(
    pc.bold("Setup complete!") + pc.dim(" Restart your terminal to activate.")
  );
}

function pickCategories(tier?: string): ComponentCategory[] {
  if (tier === "recommended") return RECOMMENDED_CATEGORIES;
  if (tier === "all" || !tier) return ALL_CATEGORIES;
  return [];
}

async function runBatch(
  env: DetectedEnvironment,
  dryRun: boolean,
  tier: string | undefined,
  verbose: boolean,
): Promise<void> {
  log.info(`Tier: ${tier ?? "all"}, dry-run: ${dryRun}`);
  log.info(`OS: ${env.os} (${env.arch}), shell: ${env.shell}, pkg: ${env.packageManager}`);

  const primordialResults = await installPrimordial(env, dryRun);
  if (tier === "primordial" || isLocalScope(env)) {
    if (isLocalScope(env)) log.info("Local install complete (category installers skipped — they're user-global).");
    else log.info("Primordial tier complete.");
    const report = await verifyAll(env, primordialResults);
    log.info(`Verification: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped`);
    return;
  }

  const allResults = [...primordialResults];
  for (const cat of pickCategories(tier)) {
    log.info(`Installing category: ${cat.name}`);
    try {
      const results = await installCategory(cat, env, dryRun, new Set());
      allResults.push(...results);
      if (verbose) {
        for (const r of results) {
          if (r.status === "failed") log.error(`  FAILED: ${r.component} — ${r.message}`);
          else log.success(`  ${r.component}: ${r.message}`);
        }
      }
    } catch (err) {
      log.error(`Category ${cat.name} threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await reapplyHardenedSettings(env, dryRun);
  const report = await verifyAll(env, allResults);
  log.info(`Verification: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped`);

  if (!dryRun) await recordJournal(env, tier);
}

async function recordJournal(env: DetectedEnvironment, tier: string | undefined): Promise<void> {
  const { writeJournal } = await import("../install-journal.js");
  const { readFileSync } = await import("node:fs");
  const pkgPath = join(getConfigsDir(), "..", "package.json");
  let version = "0.0.0";
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    if (typeof pkg.version === "string") version = pkg.version;
  } catch {}

  const readDirManifest = async (dir: string): Promise<string[]> => {
    try {
      const m = JSON.parse(await Bun.file(join(env.claudeDir, dir, ".code-tools-managed.json")).text()) as { entries?: string[] };
      return m.entries ?? [];
    } catch { return []; }
  };

  const { CORE_PLUGINS } = await import("../components/cc-plugins.js");

  await writeJournal({
    version,
    tier: (tier === "primordial" || tier === "recommended" || tier === "all") ? tier : "recommended",
    scope: isLocalScope(env) ? "local" : "global",
    installedAt: new Date().toISOString(),
    plugins: CORE_PLUGINS.map((name) => ({ name, marketplace: "claude-plugins-official" })),
    skills: await readDirManifest("skills"),
    commands: await readDirManifest("commands"),
    agents: await readDirManifest("agents"),
    hooks: await readDirManifest("hooks"),
  });
}

export default defineCommand({
  meta: {
    name: "setup",
    description: "Install the Ultimate Claude Code System v12",
  },
  args: {
    "non-interactive": {
      type: "boolean",
      description: "Skip prompts, install everything with defaults",
    },
    tier: {
      type: "string",
      description: "Install tier: primordial, recommended, all",
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
      const validTiers = ["primordial", "recommended", "all"];
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
      { interactive },
    );

    // --- Two-layer recoverable install wrapper (Phase 3) ---
    try {
      if (resolved.mode === "clean") {
        await performCleanInstall(resolved.resolvedEnv.claudeDir);
      }

      if (!interactive || args.tier) {
        await runBatch(resolved.resolvedEnv, dryRun, args.tier, Boolean(args["non-interactive"]));
        return;
      }

      await runInteractive(dryRun, resolved.resolvedEnv);
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
