import { join } from "node:path";
import { readFileSync } from "node:fs";
import { $ } from "bun";
import { installCore } from "../../core.js";
import { isLocalScope } from "../../scope.js";
import { installCategory } from "../../components/index.js";
import { log, mergeJsonFile, getConfigsDir } from "../../utils.js";
import { writeJournal } from "../../install-journal.js";
import { CORE_PLUGINS } from "../../packages.js";
import type { DeployMode } from "../../add-on-top.js";
import type { DetectedEnvironment, InstallResult, ComponentCategory } from "../../types.js";

export interface ExecuteInstallsResult {
  coreResults: InstallResult[];
  categoryResults: InstallResult[];
  allResults: InstallResult[];
}

export async function installCoreStep(
  env: DetectedEnvironment,
  dryRun: boolean,
  deployMode: DeployMode | undefined,
): Promise<InstallResult[]> {
  return installCore(env, dryRun, deployMode);
}

export interface CategoryLoopHooks {
  onStart?: (name: string) => void;
  onDone?: (name: string, failedCount: number) => void;
  onThrow?: (name: string, err: unknown) => InstallResult | undefined;
}

export async function installCategories(
  env: DetectedEnvironment,
  categories: ComponentCategory[],
  skippedComponents: Set<number>,
  dryRun: boolean,
  hooks: CategoryLoopHooks = {},
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const cat of categories) {
    hooks.onStart?.(cat.name);
    try {
      const catResults = await installCategory(cat, env, dryRun, skippedComponents);
      results.push(...catResults);
      const failed = catResults.filter((r) => r.status === "failed").length;
      hooks.onDone?.(cat.name, failed);
    } catch (err) {
      const extra = hooks.onThrow?.(cat.name, err);
      if (extra) results.push(extra);
    }
  }
  return results;
}

export async function reapplyHardenedSettings(env: DetectedEnvironment, dryRun: boolean): Promise<void> {
  if (dryRun) return;
  const homeNormalized = env.homeDir.replace(/\/+$/, "");
  const scope = env.claudeDir.startsWith(homeNormalized + "/") ? "home-claude" : "project-claude";
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

export async function recordJournal(env: DetectedEnvironment, tier: string | undefined): Promise<void> {
  const pkgPath = join(getConfigsDir(), "..", "package.json");
  let version = "0.0.0";
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    if (typeof pkg.version === "string") version = pkg.version;
  } catch {}

  const readDirManifest = async (dir: string): Promise<string[]> => {
    try {
      const m = JSON.parse(await Bun.file(join(env.claudeDir, dir, ".yka-code-managed.json")).text()) as { entries?: string[] };
      return m.entries ?? [];
    } catch { return []; }
  };

  let actuallyInstalled: string[] = [];
  try {
    const listed = await $`claude plugin list`.quiet().nothrow().text();
    actuallyInstalled = CORE_PLUGINS.filter((name) => listed.includes(name));
  } catch {
    actuallyInstalled = [];
  }

  await writeJournal({
    version,
    tier: (tier === "core" || tier === "recommended" || tier === "all") ? tier : "recommended",
    scope: isLocalScope(env) ? "local" : "global",
    installedAt: new Date().toISOString(),
    plugins: actuallyInstalled.map((name) => ({ name, marketplace: "claude-plugins-official" })),
    skills: await readDirManifest("skills"),
    commands: await readDirManifest("commands"),
    agents: await readDirManifest("agents"),
    hooks: await readDirManifest("hooks"),
  });
}
