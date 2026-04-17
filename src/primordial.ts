import { $ } from "bun";
import { join } from "node:path";
import { symlink } from "node:fs/promises";
import type { DetectedEnvironment, InstallResult } from "./types.js";
import {
  copyFile,
  copyDir,
  ensureDir,
  mergeJsonFile,
  appendToShellRc,
  installBinary,
  getConfigsDir,
  fileExists,
  log,
} from "./utils.js";
import { createBackup, restoreFromPartialManifest } from "./backup.js";

export function isLocalScope(env: DetectedEnvironment): boolean {
  const home = env.homeDir.replace(/\/+$/, "");
  return !env.claudeDir.startsWith(home + "/");
}

export function templateDir(env: DetectedEnvironment): "home-claude" | "project-claude" {
  return isLocalScope(env) ? "project-claude" : "home-claude";
}

async function deploySettings(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "claude-settings";
  const targetPath = join(env.claudeDir, "settings.json");
  const sourcePath = join(getConfigsDir(), templateDir(env), "settings.json");

  if (dryRun) {
    log.info(`[dry-run] Would merge ${sourcePath} into ${targetPath}`);
    return { component, status: "skipped", message: `[dry-run] Would merge settings.json`, verifyPassed: false };
  }

  try {
    await ensureDir(env.claudeDir);
    const patch = await Bun.file(sourcePath).json() as Record<string, unknown>;
    await mergeJsonFile(targetPath, patch);
    log.success(`Merged settings.json into ${targetPath}`);
    return { component, status: "installed", message: `Settings merged into ${targetPath}`, verifyPassed: true };
  } catch (error) {
    return {
      component,
      status: "failed",
      message: `Failed to deploy settings: ${error instanceof Error ? error.message : String(error)}`,
      verifyPassed: false,
    };
  }
}

async function deployClaudeMd(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "claude-md";
  const sourcePath = join(getConfigsDir(), templateDir(env), "CLAUDE.md");
  const targetPath = join(env.claudeDir, "CLAUDE.md");
  const agentsLink = join(env.claudeDir, "AGENTS.md");
  const geminiLink = join(env.claudeDir, "GEMINI.md");

  if (dryRun) {
    log.info(`[dry-run] Would copy ${sourcePath} -> ${targetPath}`);
    log.info(`[dry-run] Would create symlinks AGENTS.md -> CLAUDE.md and GEMINI.md -> CLAUDE.md`);
    return { component, status: "skipped", message: `[dry-run] Would deploy CLAUDE.md and symlinks`, verifyPassed: false };
  }

  try {
    await ensureDir(env.claudeDir);
    await copyFile(sourcePath, targetPath);

    // Create symlinks, removing stale ones first
    for (const linkPath of [agentsLink, geminiLink]) {
      const linkExists = await fileExists(linkPath);
      if (linkExists) {
        await $`rm -f ${linkPath}`.quiet();
      }
      await symlink("CLAUDE.md", linkPath);
    }

    log.success(`Deployed CLAUDE.md with AGENTS.md and GEMINI.md symlinks`);
    return { component, status: "installed", message: `CLAUDE.md deployed with symlinks`, verifyPassed: true };
  } catch (error) {
    return {
      component,
      status: "failed",
      message: `Failed to deploy CLAUDE.md: ${error instanceof Error ? error.message : String(error)}`,
      verifyPassed: false,
    };
  }
}

const MANIFEST_NAME = ".code-tools-managed.json";

type DeployManifest = { entries: string[] };

async function readManifest(path: string): Promise<string[]> {
  try {
    const data = JSON.parse(await Bun.file(path).text()) as DeployManifest;
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

async function writeManifest(path: string, entries: string[]): Promise<void> {
  await Bun.write(path, JSON.stringify({ entries: entries.sort() }, null, 2) + "\n");
}

async function deploySkills(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "orchestration-skills";
  const src = join(getConfigsDir(), "..", "skills");
  const dst = join(env.claudeDir, "skills");
  const manifestPath = join(dst, MANIFEST_NAME);

  const skillDirs = await Array.fromAsync(new Bun.Glob("*/SKILL.md").scan({ cwd: src, onlyFiles: true }));
  const current = [...new Set(skillDirs.map((rel) => rel.split("/")[0]))];
  const previous = await readManifest(manifestPath);
  const stale = previous.filter((name) => !current.includes(name));

  if (dryRun) {
    log.info(`[dry-run] Would deploy ${current.length} skills from ${src} to ${dst}`);
    if (stale.length > 0) log.info(`[dry-run] Would remove ${stale.length} stale skill(s): ${stale.join(", ")}`);
    return { component, status: "skipped", message: `[dry-run] Would deploy ${current.length} skills, remove ${stale.length} stale`, verifyPassed: false };
  }

  try {
    await ensureDir(dst);

    for (const name of stale) {
      await $`rm -rf ${join(dst, name)}`.quiet();
    }

    for (const name of current) {
      const skillSrc = join(src, name);
      const skillDst = join(dst, name);
      await $`rm -rf ${skillDst}`.quiet();
      await copyDir(skillSrc, skillDst);
    }

    await writeManifest(manifestPath, current);

    const removedMsg = stale.length > 0 ? `, removed ${stale.length} stale (${stale.join(", ")})` : "";
    log.success(`Deployed ${current.length} skill(s) to ${dst}${removedMsg}`);
    return { component, status: "installed", message: `${current.length} skills deployed${removedMsg}`, verifyPassed: true };
  } catch (err) {
    return {
      component,
      status: "failed",
      message: `Failed to deploy skills: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    };
  }
}

async function deployCommands(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "user-commands";
  const src = join(getConfigsDir(), "..", "commands");
  const dst = join(env.claudeDir, "commands");
  const manifestPath = join(dst, MANIFEST_NAME);

  const files = await Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: src, onlyFiles: true }));
  const current = [...files];
  const previous = await readManifest(manifestPath);
  const stale = previous.filter((name) => !current.includes(name));

  if (dryRun) {
    log.info(`[dry-run] Would deploy ${current.length} command(s) from ${src} to ${dst}`);
    if (stale.length > 0) log.info(`[dry-run] Would remove ${stale.length} stale command(s): ${stale.join(", ")}`);
    return { component, status: "skipped", message: `[dry-run] Would deploy ${current.length} commands, remove ${stale.length} stale`, verifyPassed: false };
  }

  try {
    await ensureDir(dst);

    for (const name of stale) {
      await $`rm -f ${join(dst, name)}`.quiet();
    }

    for (const name of current) {
      await copyFile(join(src, name), join(dst, name));
    }

    await writeManifest(manifestPath, current);

    const removedMsg = stale.length > 0 ? `, removed ${stale.length} stale (${stale.join(", ")})` : "";
    log.success(`Deployed ${current.length} slash command(s) to ${dst}${removedMsg}`);
    return { component, status: "installed", message: `${current.length} user commands deployed${removedMsg}`, verifyPassed: true };
  } catch (err) {
    return {
      component,
      status: "failed",
      message: `Failed to deploy commands: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    };
  }
}

async function deployAgents(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "user-agents";
  const src = join(getConfigsDir(), "..", "agents");
  const dst = join(env.claudeDir, "agents");
  const manifestPath = join(dst, MANIFEST_NAME);

  const files = await Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: src, onlyFiles: true }));
  const current = files.filter((f) => f.toUpperCase() !== "AGENTS.md");
  const previous = await readManifest(manifestPath);
  const stale = previous.filter((name) => !current.includes(name));

  if (dryRun) {
    log.info(`[dry-run] Would deploy ${current.length} agent(s) from ${src} to ${dst}`);
    if (stale.length > 0) log.info(`[dry-run] Would remove ${stale.length} stale agent(s): ${stale.join(", ")}`);
    return { component, status: "skipped", message: `[dry-run] Would deploy ${current.length} agents, remove ${stale.length} stale`, verifyPassed: false };
  }

  try {
    await ensureDir(dst);

    for (const name of stale) {
      await $`rm -f ${join(dst, name)}`.quiet();
    }

    for (const name of current) {
      await copyFile(join(src, name), join(dst, name));
    }

    await writeManifest(manifestPath, current);

    const removedMsg = stale.length > 0 ? `, removed ${stale.length} stale (${stale.join(", ")})` : "";
    log.success(`Deployed ${current.length} subagent(s) to ${dst}${removedMsg}`);
    return { component, status: "installed", message: `${current.length} user agents deployed${removedMsg}`, verifyPassed: true };
  } catch (err) {
    return {
      component,
      status: "failed",
      message: `Failed to deploy agents: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    };
  }
}

async function deployHooks(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "claude-hooks";
  const hooksSourceDir = isLocalScope(env)
    ? join(getConfigsDir(), "project-claude", "hooks")
    : join(getConfigsDir(), "hooks");
  const hooksTargetDir = join(env.claudeDir, "hooks");
  const manifestPath = join(hooksTargetDir, MANIFEST_NAME);

  const hookFiles = await Array.fromAsync(
    new Bun.Glob("*.{sh,js,ts,py}").scan({ cwd: hooksSourceDir, onlyFiles: true })
  );
  const previous = await readManifest(manifestPath);
  const stale = previous.filter((name) => !hookFiles.includes(name));

  if (dryRun) {
    log.info(`[dry-run] Would deploy ${hookFiles.length} hook(s) to ${hooksTargetDir} with chmod 700`);
    if (stale.length > 0) log.info(`[dry-run] Would remove ${stale.length} stale hook(s): ${stale.join(", ")}`);
    return { component, status: "skipped", message: `[dry-run] Would deploy ${hookFiles.length} hooks, remove ${stale.length} stale`, verifyPassed: false };
  }

  try {
    await ensureDir(hooksTargetDir);

    for (const name of stale) {
      await $`rm -f ${join(hooksTargetDir, name)}`.quiet();
    }

    for (const hookFile of hookFiles) {
      const src = join(hooksSourceDir, hookFile);
      const dest = join(hooksTargetDir, hookFile);
      await copyFile(src, dest);
      await $`chmod 700 ${dest}`.quiet();
    }
    await $`chmod 700 ${hooksTargetDir}`.quiet();
    await writeManifest(manifestPath, hookFiles);

    const settingsPath = join(env.claudeDir, "settings.json");
    const hookFilenames = new Set(hookFiles);
    const cmd = (name: string) => ({ type: "command", command: join(hooksTargetDir, name) });

    const hooksConfig: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>> = {};

    const preHooks: Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }> = [];
    if (hookFilenames.has("pre-secrets-guard.sh")) {
      preHooks.push({ hooks: [cmd("pre-secrets-guard.sh")] });
    }
    if (hookFilenames.has("pre-destructive-blocker.sh")) {
      preHooks.push({ matcher: "Bash", hooks: [cmd("pre-destructive-blocker.sh")] });
    }
    if (hookFilenames.has("pre-pr-gate.sh")) {
      preHooks.push({ matcher: "Bash", hooks: [cmd("pre-pr-gate.sh")] });
    }
    if (preHooks.length > 0) {
      hooksConfig.PreToolUse = preHooks;
    }

    const postHooks: Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }> = [];
    if (hookFilenames.has("post-lint-gate.sh")) {
      postHooks.push({ matcher: "Write|Edit|MultiEdit", hooks: [cmd("post-lint-gate.sh")] });
    }
    if (hookFilenames.has("post-edit-lint.sh")) {
      postHooks.push({ matcher: "Write|Edit|MultiEdit", hooks: [cmd("post-edit-lint.sh")] });
    }
    if (hookFilenames.has("post-bash-test.sh")) {
      postHooks.push({ matcher: "Bash", hooks: [cmd("post-bash-test.sh")] });
    }
    if (postHooks.length > 0) {
      hooksConfig.PostToolUse = postHooks;
    }

    if (hookFilenames.has("session-start.sh")) {
      hooksConfig.SessionStart = [{ hooks: [cmd("session-start.sh")] }];
    }
    if (hookFilenames.has("session-end.sh")) {
      hooksConfig.SessionEnd = [{ hooks: [cmd("session-end.sh")] }];
    }
    const stopHooks: Array<{ hooks: Array<{ type: string; command: string }> }> = [];
    if (hookFilenames.has("stop-summary.sh")) {
      stopHooks.push({ hooks: [cmd("stop-summary.sh")] });
    }
    if (hookFilenames.has("stop-research-check.sh")) {
      stopHooks.push({ hooks: [cmd("stop-research-check.sh")] });
    }
    if (stopHooks.length > 0) {
      hooksConfig.Stop = stopHooks;
    }
    if (hookFilenames.has("pre-compact.sh")) {
      hooksConfig.PreCompact = [{ hooks: [cmd("pre-compact.sh")] }];
    }
    if (hookFilenames.has("post-compact.sh")) {
      hooksConfig.PostCompact = [{ hooks: [cmd("post-compact.sh")] }];
    }
    if (hookFilenames.has("stop-failure.sh")) {
      hooksConfig.StopFailure = [{ hooks: [cmd("stop-failure.sh")] }];
    }
    if (hookFilenames.has("permission-denied.sh")) {
      hooksConfig.PermissionDenied = [{ hooks: [cmd("permission-denied.sh")] }];
    }
    if (hookFilenames.has("cwd-changed.sh")) {
      hooksConfig.CwdChanged = [{ hooks: [cmd("cwd-changed.sh")] }];
    }
    if (hookFilenames.has("elicitation.sh")) {
      hooksConfig.Elicitation = [{ hooks: [cmd("elicitation.sh")] }];
    }
    if (hookFilenames.has("file-changed.sh")) {
      hooksConfig.FileChanged = [
        { matcher: "\\.env|\\.env\\.local|\\.mcp\\.json|settings\\.local\\.json", hooks: [cmd("file-changed.sh")] },
      ];
    }
    if (hookFilenames.has("task-created.sh")) {
      hooksConfig.TaskCreated = [{ hooks: [cmd("task-created.sh")] }];
    }
    if (hookFilenames.has("task-completed.sh")) {
      hooksConfig.TaskCompleted = [{ hooks: [cmd("task-completed.sh")] }];
    }
    if (hookFilenames.has("teammate-idle.sh")) {
      hooksConfig.TeammateIdle = [{ hooks: [cmd("teammate-idle.sh")] }];
    }

    await mergeJsonFile(settingsPath, { hooks: hooksConfig });

    log.success(`Deployed ${hookFiles.length} hook scripts and wired them into settings.json`);
    return { component, status: "installed", message: `${hookFiles.length} hook scripts deployed and wired`, verifyPassed: true };
  } catch (error) {
    return {
      component,
      status: "failed",
      message: `Failed to deploy hooks: ${error instanceof Error ? error.message : String(error)}`,
      verifyPassed: false,
    };
  }
}

async function installJq(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  return installBinary(
    {
      name: "jq",
      displayName: "jq",
      brew: "brew install jq",
      apt: "sudo apt-get install -y jq",
      pacman: "sudo pacman -S --noconfirm jq",
      dnf: "sudo dnf install -y jq",
    },
    env,
    dryRun
  );
}

async function installTmux(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "tmux";
  const tmuxConfSource = join(getConfigsDir(), "tmux.conf");
  const tmuxConfTarget = join(env.homeDir, ".tmux.conf");

  const binResult = await installBinary(
    {
      name: "tmux",
      displayName: "tmux",
      brew: "brew install tmux",
      apt: "sudo apt-get install -y tmux",
      pacman: "sudo pacman -S --noconfirm tmux",
      dnf: "sudo dnf install -y tmux",
    },
    env,
    dryRun
  );

  if (dryRun) {
    log.info(`[dry-run] Would copy ${tmuxConfSource} -> ${tmuxConfTarget}`);
    return { ...binResult, component };
  }

  // Deploy config regardless of whether tmux was just installed or already present
  try {
    await copyFile(tmuxConfSource, tmuxConfTarget);
    log.success(`Deployed tmux.conf to ${tmuxConfTarget}`);
  } catch (error) {
    return {
      component,
      status: "failed",
      message: `tmux binary ok but failed to deploy config: ${error instanceof Error ? error.message : String(error)}`,
      verifyPassed: false,
    };
  }

  return { ...binResult, component };
}

async function installStarship(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "starship";
  const starshipConfSource = join(getConfigsDir(), "starship.toml");
  const starshipConfTarget = join(env.homeDir, ".config", "starship.toml");

  const pkg =
    env.packageManager === "brew"
      ? {
          name: "starship",
          displayName: "starship",
          brew: "brew install starship",
        }
      : {
          name: "starship",
          displayName: "starship",
          curl: "curl -sS https://starship.rs/install.sh | sh -s -- -y",
        };

  const binResult = await installBinary(pkg, env, dryRun);

  if (dryRun) {
    log.info(`[dry-run] Would copy ${starshipConfSource} -> ${starshipConfTarget}`);
    log.info(`[dry-run] Would append starship init to ${env.shellRcPath}`);
    return { ...binResult, component };
  }

  try {
    await ensureDir(join(env.homeDir, ".config"));
    await copyFile(starshipConfSource, starshipConfTarget);
    log.success(`Deployed starship.toml to ${starshipConfTarget}`);
  } catch (error) {
    return {
      component,
      status: "failed",
      message: `starship binary ok but failed to deploy config: ${error instanceof Error ? error.message : String(error)}`,
      verifyPassed: false,
    };
  }

  await appendToShellRc(env, [`eval "$(starship init ${env.shell})"`], "starship");

  return { ...binResult, component };
}

async function installMise(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "mise";

  if (dryRun) {
    log.info(`[dry-run] Would install mise via curl https://mise.run | sh`);
    log.info(`[dry-run] Would append mise activate to ${env.shellRcPath}`);
    return { component, status: "skipped", message: `[dry-run] Would install mise`, verifyPassed: false };
  }

  const result = await installBinary(
    {
      name: "mise",
      displayName: "mise",
      curl: "curl https://mise.run | sh",
    },
    env,
    dryRun
  );

  if (result.status === "installed" || result.status === "already-installed") {
    await appendToShellRc(env, [`eval "$(mise activate ${env.shell})"`], "mise");
  }

  return { ...result, component };
}

async function installJust(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  return installBinary(
    {
      name: "just",
      displayName: "just",
      brew: "brew install just",
      apt: "sudo apt-get install -y just",
      pacman: "sudo pacman -S --noconfirm just",
      dnf: "sudo dnf install -y just",
      curl: "curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin",
    },
    env,
    dryRun
  );
}

async function addGitAliases(_env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "git-aliases";
  const aliases: Array<[string, string]> = [
    ["wt", "worktree"],
    ["wta", "worktree add"],
    ["wtl", "worktree list"],
    ["wtr", "worktree remove"],
  ];

  if (dryRun) {
    for (const [alias, value] of aliases) {
      log.info(`[dry-run] Would run: git config --global alias.${alias} "${value}"`);
    }
    return { component, status: "skipped", message: `[dry-run] Would add 4 git worktree aliases`, verifyPassed: false };
  }

  try {
    for (const [alias, value] of aliases) {
      await $`git config --global alias.${alias} ${value}`.quiet();
    }
    log.success(`Added git worktree aliases: wt, wta, wtl, wtr`);
    return { component, status: "installed", message: `Git aliases wt, wta, wtl, wtr configured`, verifyPassed: true };
  } catch (error) {
    return {
      component,
      status: "failed",
      message: `Failed to add git aliases: ${error instanceof Error ? error.message : String(error)}`,
      verifyPassed: false,
    };
  }
}

async function enableTelemetry(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "telemetry";
  const lines = [
    "export CLAUDE_CODE_ENABLE_TELEMETRY=1",
    "export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1",
    "export CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1",
  ];

  if (dryRun) {
    log.info(`[dry-run] Would append telemetry env vars to ${env.shellRcPath}`);
    return { component, status: "skipped", message: `[dry-run] Would enable telemetry env vars`, verifyPassed: false };
  }

  try {
    await appendToShellRc(env, lines, "claude-telemetry");
    log.success(`Telemetry env vars added to ${env.shellRcPath}`);
    return { component, status: "installed", message: `Telemetry env vars added to shell rc`, verifyPassed: true };
  } catch (error) {
    return {
      component,
      status: "failed",
      message: `Failed to enable telemetry: ${error instanceof Error ? error.message : String(error)}`,
      verifyPassed: false,
    };
  }
}

async function setCavemanDefaultMode(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "caveman-default-mode";
  const lines = ["export CAVEMAN_DEFAULT_MODE=full"];

  if (dryRun) {
    log.info(`[dry-run] Would append CAVEMAN_DEFAULT_MODE=full to ${env.shellRcPath}`);
    return { component, status: "skipped", message: `[dry-run] Would set caveman default mode`, verifyPassed: false };
  }

  try {
    await appendToShellRc(env, lines, "caveman");
    log.success(`CAVEMAN_DEFAULT_MODE=full added to ${env.shellRcPath}`);
    return { component, status: "installed", message: `caveman default mode set to 'full'`, verifyPassed: true };
  } catch (error) {
    return {
      component,
      status: "failed",
      message: `Failed to set caveman default: ${error instanceof Error ? error.message : String(error)}`,
      verifyPassed: false,
    };
  }
}

async function createLessons(_env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "lessons";
  const lessonsPath = join(process.cwd(), "tasks", "lessons.md");

  if (dryRun) {
    log.info(`[dry-run] Would create ${lessonsPath} if it does not exist`);
    return { component, status: "skipped", message: `[dry-run] Would create tasks/lessons.md if absent`, verifyPassed: false };
  }

  if (await fileExists(lessonsPath)) {
    return { component, status: "already-installed", message: `tasks/lessons.md already exists, not overwriting`, verifyPassed: true };
  }

  try {
    await ensureDir(join(process.cwd(), "tasks"));
    await Bun.write(lessonsPath, "# Lessons\n");
    log.success(`Created tasks/lessons.md`);
    return { component, status: "installed", message: `tasks/lessons.md created`, verifyPassed: true };
  } catch (error) {
    return {
      component,
      status: "failed",
      message: `Failed to create lessons.md: ${error instanceof Error ? error.message : String(error)}`,
      verifyPassed: false,
    };
  }
}

// --- Main export ---

export async function installPrimordial(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const local = isLocalScope(env);

  const backupPaths = local
    ? [join(env.claudeDir, "settings.json"), join(env.claudeDir, "CLAUDE.md")]
    : [
        join(env.claudeDir, "settings.json"),
        join(env.claudeDir, "CLAUDE.md"),
        join(env.homeDir, ".tmux.conf"),
        join(env.homeDir, ".config", "starship.toml"),
        env.shellRcPath,
      ];

  const backup = await createBackup(backupPaths);
  const results: InstallResult[] = [];

  try {
    results.push(await deploySettings(env, dryRun));
    results.push(await deployClaudeMd(env, dryRun));
    results.push(await deployHooks(env, dryRun));
    if (!local) {
      results.push(await deploySkills(env, dryRun));
      results.push(await deployCommands(env, dryRun));
      results.push(await deployAgents(env, dryRun));
      results.push(await installJq(env, dryRun));
      results.push(await installTmux(env, dryRun));
      results.push(await installStarship(env, dryRun));
      results.push(await installMise(env, dryRun));
      results.push(await installJust(env, dryRun));
      results.push(await addGitAliases(env, dryRun));
      results.push(await enableTelemetry(env, dryRun));
      results.push(await setCavemanDefaultMode(env, dryRun));
    }
    results.push(await createLessons(env, dryRun));
    return results;
  } catch (error) {
    log.error("Primordial install failed, restoring backup...");
    await restoreFromPartialManifest(backup);
    throw error;
  }
}
