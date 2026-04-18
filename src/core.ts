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
  getConfigsDir,
  fileExists,
  log,
} from "./utils.js";
import { installBinary, DEV_CLI_PACKAGES } from "./packages.js";
import { createBackup, restoreFromPartialManifest } from "./backup.js";
import { resolveWrite, resolveMerge, type DeployMode } from "./add-on-top.js";
import { buildHooksConfig } from "./hook-registry.js";
import { isLocalScope, templateDir } from "./scope.js";

async function deploySettings(env: DetectedEnvironment, dryRun: boolean, deployMode?: DeployMode): Promise<InstallResult> {
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
    await resolveMerge(targetPath, Object.keys(patch), deployMode);
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

async function deployClaudeMd(env: DetectedEnvironment, dryRun: boolean, deployMode?: DeployMode): Promise<InstallResult> {
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

    if (await resolveWrite(targetPath, deployMode) === "skip") {
      log.info(`Skipped CLAUDE.md (add-on-top: target exists)`);
      return { component, status: "skipped", message: `CLAUDE.md preserved`, verifyPassed: true };
    }
    await copyFile(sourcePath, targetPath);

    for (const linkPath of [agentsLink, geminiLink]) {
      if (await resolveWrite(linkPath, deployMode) === "skip") continue;
      if (await fileExists(linkPath)) await $`rm -f ${linkPath}`.quiet();
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

const MANIFEST_NAME = ".yka-code-managed.json";
const MANIFEST_VERSION = 1;

type DeployManifest = { version?: number; entries: string[] };

async function readManifest(path: string): Promise<string[]> {
  try {
    const data = JSON.parse(await Bun.file(path).text()) as DeployManifest;
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

async function writeManifest(path: string, entries: string[]): Promise<void> {
  await Bun.write(path, JSON.stringify({ version: MANIFEST_VERSION, entries: entries.sort() }, null, 2) + "\n");
}

async function deploySkills(env: DetectedEnvironment, dryRun: boolean, deployMode?: DeployMode): Promise<InstallResult> {
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

    const previousSet = new Set(previous);
    let skipped = 0;
    for (const name of current) {
      const skillDst = join(dst, name);
      if (!previousSet.has(name) && await resolveWrite(skillDst, deployMode) === "skip") {
        skipped++;
        continue;
      }
      await $`rm -rf ${skillDst}`.quiet();
      await copyDir(join(src, name), skillDst);
    }

    await writeManifest(manifestPath, current.filter((n) => previousSet.has(n) || skipped === 0));

    const removedMsg = stale.length > 0 ? `, removed ${stale.length} stale (${stale.join(", ")})` : "";
    const skipMsg = skipped > 0 ? `, skipped ${skipped} (user-owned collision)` : "";
    log.success(`Deployed ${current.length - skipped} skill(s) to ${dst}${removedMsg}${skipMsg}`);
    return { component, status: "installed", message: `${current.length - skipped} skills deployed${removedMsg}${skipMsg}`, verifyPassed: true };
  } catch (err) {
    return {
      component,
      status: "failed",
      message: `Failed to deploy skills: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    };
  }
}

async function deployCommands(env: DetectedEnvironment, dryRun: boolean, deployMode?: DeployMode): Promise<InstallResult> {
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

    const previousSet = new Set(previous);
    let skipped = 0;
    for (const name of current) {
      const target = join(dst, name);
      if (!previousSet.has(name) && await resolveWrite(target, deployMode) === "skip") {
        skipped++;
        continue;
      }
      await copyFile(join(src, name), target);
    }

    await writeManifest(manifestPath, current);

    const removedMsg = stale.length > 0 ? `, removed ${stale.length} stale (${stale.join(", ")})` : "";
    const skipMsg = skipped > 0 ? `, skipped ${skipped} (user-owned collision)` : "";
    log.success(`Deployed ${current.length - skipped} slash command(s) to ${dst}${removedMsg}${skipMsg}`);
    return { component, status: "installed", message: `${current.length - skipped} user commands deployed${removedMsg}${skipMsg}`, verifyPassed: true };
  } catch (err) {
    return {
      component,
      status: "failed",
      message: `Failed to deploy commands: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    };
  }
}

async function deployAgents(env: DetectedEnvironment, dryRun: boolean, deployMode?: DeployMode): Promise<InstallResult> {
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

    const previousSet = new Set(previous);
    let skipped = 0;
    for (const name of current) {
      const target = join(dst, name);
      if (!previousSet.has(name) && await resolveWrite(target, deployMode) === "skip") {
        skipped++;
        continue;
      }
      await copyFile(join(src, name), target);
    }

    await writeManifest(manifestPath, current);

    const removedMsg = stale.length > 0 ? `, removed ${stale.length} stale (${stale.join(", ")})` : "";
    const skipMsg = skipped > 0 ? `, skipped ${skipped} (user-owned collision)` : "";
    log.success(`Deployed ${current.length - skipped} subagent(s) to ${dst}${removedMsg}${skipMsg}`);
    return { component, status: "installed", message: `${current.length - skipped} user agents deployed${removedMsg}${skipMsg}`, verifyPassed: true };
  } catch (err) {
    return {
      component,
      status: "failed",
      message: `Failed to deploy agents: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    };
  }
}

async function deployHooks(env: DetectedEnvironment, dryRun: boolean, deployMode?: DeployMode): Promise<InstallResult> {
  const component = "claude-hooks";
  const hooksSourceDir = isLocalScope(env)
    ? join(getConfigsDir(), "project-claude", "hooks")
    : join(getConfigsDir(), "home-claude", "hooks");
  const hooksTargetDir = join(env.claudeDir, "hooks");
  const manifestPath = join(hooksTargetDir, MANIFEST_NAME);

  const hookFiles = await Array.fromAsync(
    new Bun.Glob("*.{sh,js,ts,py}").scan({ cwd: hooksSourceDir, onlyFiles: true })
  );
  const previous = await readManifest(manifestPath);
  const stale = previous.filter((name) => !hookFiles.includes(name));

  if (dryRun) {
    log.info(`[dry-run] Would deploy ${hookFiles.length} hook(s) to ${hooksTargetDir} with chmod 755`);
    if (stale.length > 0) log.info(`[dry-run] Would remove ${stale.length} stale hook(s): ${stale.join(", ")}`);
    return { component, status: "skipped", message: `[dry-run] Would deploy ${hookFiles.length} hooks, remove ${stale.length} stale`, verifyPassed: false };
  }

  try {
    await ensureDir(hooksTargetDir);

    for (const name of stale) {
      await $`rm -f ${join(hooksTargetDir, name)}`.quiet();
    }

    const previousHookSet = new Set(previous);
    let skippedHooks = 0;
    for (const hookFile of hookFiles) {
      const src = join(hooksSourceDir, hookFile);
      const dest = join(hooksTargetDir, hookFile);
      if (!previousHookSet.has(hookFile) && await resolveWrite(dest, deployMode) === "skip") {
        skippedHooks++;
        continue;
      }
      await copyFile(src, dest);
      await $`chmod 755 ${dest}`.quiet();
    }
    await $`chmod 755 ${hooksTargetDir}`.quiet();
    await writeManifest(manifestPath, hookFiles);

    const settingsPath = join(env.claudeDir, "settings.json");
    const hookFilenames = new Set(hookFiles);

    const hooksConfig = buildHooksConfig(
      (file) => ({ type: "command", command: join(hooksTargetDir, file) }),
      { filter: (file) => hookFilenames.has(file) },
    );

    await resolveMerge(settingsPath, ["hooks"], deployMode);
    await mergeJsonFile(settingsPath, { hooks: hooksConfig });

    const skipMsg = skippedHooks > 0 ? `, skipped ${skippedHooks} (user-owned collision)` : "";
    log.success(`Deployed ${hookFiles.length - skippedHooks} hook scripts and wired them into settings.json${skipMsg}`);
    return { component, status: "installed", message: `${hookFiles.length - skippedHooks} hook scripts deployed and wired${skipMsg}`, verifyPassed: true };
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
          curl: "curl --connect-timeout 15 --max-time 120 -sS https://starship.rs/install.sh | sh -s -- -y",
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
      curl: "curl --connect-timeout 15 --max-time 120 https://mise.run | sh",
    },
    env,
    dryRun
  );

  if (result.status === "installed" || result.status === "already-installed") {
    await appendToShellRc(
      env,
      [
        `export PATH="$HOME/.local/share/mise/shims:$PATH"`,
        `eval "$(mise activate ${env.shell})"`,
      ],
      "mise",
    );
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
      curl: "curl --connect-timeout 15 --max-time 120 --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin",
    },
    env,
    dryRun
  );
}

async function installDevCliBaseline(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const pkg of DEV_CLI_PACKAGES) {
    results.push(await installBinary(pkg, env, dryRun));
  }
  return results;
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
  const component = "claude-code-env";
  const lines = [
    "export CLAUDE_CODE_ENABLE_TELEMETRY=1",
    "export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1",
  ];

  if (dryRun) {
    log.info(`[dry-run] Would append Claude Code env vars to ${env.shellRcPath}`);
    return { component, status: "skipped", message: `[dry-run] Would set Claude Code env vars (telemetry, agent teams)`, verifyPassed: false };
  }

  try {
    await appendToShellRc(env, lines, "claude-code-env");
    log.success(`Claude Code env vars added to ${env.shellRcPath}`);
    return { component, status: "installed", message: `Telemetry + agent-teams env vars added`, verifyPassed: true };
  } catch (error) {
    return {
      component,
      status: "failed",
      message: `Failed to set Claude Code env vars: ${error instanceof Error ? error.message : String(error)}`,
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

export async function installCore(
  env: DetectedEnvironment,
  dryRun: boolean,
  deployMode?: DeployMode,
): Promise<InstallResult[]> {
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
    results.push(await deploySettings(env, dryRun, deployMode));
    results.push(await deployClaudeMd(env, dryRun, deployMode));
    results.push(await deployHooks(env, dryRun, deployMode));
    if (!local) {
      results.push(await deploySkills(env, dryRun, deployMode));
      results.push(await deployCommands(env, dryRun, deployMode));
      results.push(await deployAgents(env, dryRun, deployMode));
      results.push(await installJq(env, dryRun));
      results.push(await installTmux(env, dryRun));
      results.push(await installStarship(env, dryRun));
      results.push(await installMise(env, dryRun));
      results.push(await installJust(env, dryRun));
      results.push(...(await installDevCliBaseline(env, dryRun)));
      results.push(await addGitAliases(env, dryRun));
      results.push(await enableTelemetry(env, dryRun));
      results.push(await setCavemanDefaultMode(env, dryRun));
    }
    results.push(await createLessons(env, dryRun));
    return results;
  } catch (error) {
    log.error("Core install failed, restoring backup...");
    await restoreFromPartialManifest(backup);
    throw error;
  }
}
