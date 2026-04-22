import { $ } from "bun";
import { join } from "node:path";
import { symlink } from "node:fs/promises";
import type { DetectedEnvironment, InstallResult } from "./types.js";
import {
  copyFile,
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
import { deployManagedDirectory, type DeployKind } from "./deploy.js";

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

type ManagedTreeSpec = {
  component: string;
  kind: DeployKind;
  dir: string;
  entryKind: "directory" | "file";
  glob: string;
};

const MANAGED_TREES: ManagedTreeSpec[] = [
  { component: "orchestration-skills", kind: "skills", dir: "skills", entryKind: "directory", glob: "*/SKILL.md" },
  { component: "user-agents", kind: "agents", dir: "agents", entryKind: "file", glob: "*.md" },
];

function deployManagedTree(
  spec: ManagedTreeSpec,
  env: DetectedEnvironment,
  dryRun: boolean,
  deployMode?: DeployMode,
): Promise<InstallResult> {
  const dst = join(env.claudeDir, spec.dir);
  return deployManagedDirectory({
    component: spec.component,
    src: join(getConfigsDir(), "..", spec.dir),
    dst,
    manifestPath: join(dst, MANIFEST_NAME),
    kind: spec.kind,
    entryKind: spec.entryKind,
    glob: spec.glob,
    deployMode,
    dryRun,
  });
}

function deployHooks(env: DetectedEnvironment, dryRun: boolean, deployMode?: DeployMode): Promise<InstallResult> {
  const dst = join(env.claudeDir, "hooks");
  return deployManagedDirectory({
    component: "claude-hooks",
    src: join(getConfigsDir(), templateDir(env), "hooks"),
    dst,
    manifestPath: join(dst, MANIFEST_NAME),
    kind: "hooks",
    entryKind: "file",
    glob: "*.{sh,js,ts,py}",
    deployMode,
    dryRun,
    alwaysOverwrite: true,
    onCopyEntry: async (target) => { await $`chmod 755 ${target}`.quiet(); },
    onDeployComplete: async ({ dstDir, deployed }) => {
      await $`chmod 755 ${dstDir}`.quiet();
      const settingsPath = join(env.claudeDir, "settings.json");
      const deployedSet = new Set(deployed);
      const hooksConfig = buildHooksConfig(
        (file) => ({ type: "command", command: join(dstDir, file) }),
        { filter: (file) => deployedSet.has(file) },
      );
      await resolveMerge(settingsPath, ["hooks"], deployMode);
      await mergeJsonFile(settingsPath, { hooks: hooksConfig });
    },
  });
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
  return installBinary(
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
}

async function ensureTmuxFocusEvents(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult> {
  const component = "tmux-focus-events";
  const tmuxConf = join(env.homeDir, ".tmux.conf");
  const MARKER = "# yka-code-managed";
  const section = "tmux-focus-events";
  const block = `${MARKER} start:${section}\nset -g focus-events on\n${MARKER} end:${section}\n`;

  if (dryRun) {
    const exists = await fileExists(tmuxConf);
    log.info(`[dry-run] Would ensure 'set -g focus-events on' in ${tmuxConf}${exists ? " (file exists, append if missing)" : " (file missing, create)"}`);
    return { component, status: "skipped", message: "[dry-run]", verifyPassed: false };
  }

  let content = "";
  if (await fileExists(tmuxConf)) {
    content = await Bun.file(tmuxConf).text();
  }

  if (/^\s*set\s+-g\s+focus-events\s+on\b/m.test(content)) {
    return { component, status: "skipped", message: "focus-events already set", verifyPassed: true };
  }

  if (content.includes(`${MARKER} start:${section}`)) {
    return { component, status: "skipped", message: "managed block already present", verifyPassed: true };
  }

  const next = content.endsWith("\n") || content === "" ? content + "\n" + block : content + "\n\n" + block;
  await Bun.write(tmuxConf, next);
  return { component, status: "installed", message: `Appended 'set -g focus-events on' to ${tmuxConf}`, verifyPassed: true };
}

async function installDevCliBaseline(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const pkg of DEV_CLI_PACKAGES) {
    results.push(await installBinary(pkg, env, dryRun));
  }
  return results;
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
        env.shellRcPath,
      ];

  const backup = await createBackup(backupPaths);
  const results: InstallResult[] = [];

  try {
    results.push(await deploySettings(env, dryRun, deployMode));
    results.push(await deployClaudeMd(env, dryRun, deployMode));
    results.push(await deployHooks(env, dryRun, deployMode));
    if (!local) {
      for (const spec of MANAGED_TREES) {
        results.push(await deployManagedTree(spec, env, dryRun, deployMode));
      }
      results.push(await installJq(env, dryRun));
      results.push(await installTmux(env, dryRun));
      results.push(await ensureTmuxFocusEvents(env, dryRun));
      results.push(...(await installDevCliBaseline(env, dryRun)));
      results.push(await enableTelemetry(env, dryRun));
    }
    results.push(await createLessons(env, dryRun));
    return results;
  } catch (error) {
    log.error("Core install failed, restoring backup...");
    await restoreFromPartialManifest(backup);
    throw error;
  }
}
