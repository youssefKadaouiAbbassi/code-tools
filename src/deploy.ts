import { $ } from "bun";
import { join } from "node:path";
import type { InstallResult } from "./types.js";
import { copyFile, copyDir, ensureDir, log } from "./utils.js";
import { resolveWrite, type DeployMode } from "./add-on-top.js";

export type DeployKind = "skills" | "commands" | "agents" | "hooks";

export interface DeployManagedDirectoryOptions {
  component: string;
  src: string;
  dst: string;
  manifestPath: string;
  kind: DeployKind;
  entryKind: "directory" | "file";
  glob: string;
  deployMode?: DeployMode;
  dryRun: boolean;
  alwaysOverwrite?: boolean;
  onCopyEntry?: (target: string) => Promise<void>;
  onDeployComplete?: (info: { dstDir: string; deployed: string[] }) => Promise<void>;
}

const MANIFEST_VERSION = 1;

type DeployManifest = { version?: number; entries: string[] };

type Labels = { dryRun: string; staleSingular: string; success: string; result: string };

const LABELS: Record<DeployKind, Labels> = {
  skills: { dryRun: "skills", staleSingular: "skill", success: "skill(s)", result: "skills" },
  commands: { dryRun: "command(s)", staleSingular: "slash command", success: "slash command(s)", result: "user commands" },
  agents: { dryRun: "agent(s)", staleSingular: "subagent", success: "subagent(s)", result: "user agents" },
  hooks: { dryRun: "hook(s)", staleSingular: "hook", success: "hook script(s)", result: "hook scripts" },
};

async function readManifest(path: string): Promise<string[]> {
  try {
    const data = JSON.parse(await Bun.file(path).text()) as DeployManifest;
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

async function writeManifest(path: string, entries: string[]): Promise<void> {
  await Bun.write(
    path,
    JSON.stringify({ version: MANIFEST_VERSION, entries: [...entries].sort() }, null, 2) + "\n",
  );
}

async function scanSourceEntries(src: string, glob: string, kind: DeployKind): Promise<string[]> {
  const matches = await Array.fromAsync(new Bun.Glob(glob).scan({ cwd: src, onlyFiles: true }));
  if (kind === "skills") {
    return [...new Set(matches.map((rel) => rel.split("/")[0]))];
  }
  if (kind === "agents") {
    return matches.filter((f) => f.toUpperCase() !== "AGENTS.md");
  }
  return [...matches];
}

async function removeEntry(target: string, entryKind: "directory" | "file"): Promise<void> {
  const flag = entryKind === "directory" ? "-rf" : "-f";
  await $`rm ${flag} ${target}`.quiet();
}

async function copyEntry(
  source: string,
  target: string,
  entryKind: "directory" | "file",
): Promise<void> {
  if (entryKind === "directory") {
    await $`rm -rf ${target}`.quiet();
    await copyDir(source, target);
  } else {
    await copyFile(source, target);
  }
}

export async function deployManagedDirectory(
  opts: DeployManagedDirectoryOptions,
): Promise<InstallResult> {
  const { component, src, dst, manifestPath, kind, entryKind, glob, deployMode, dryRun, alwaysOverwrite, onCopyEntry, onDeployComplete } = opts;
  const labels = LABELS[kind];

  const current = await scanSourceEntries(src, glob, kind);
  const previous = await readManifest(manifestPath);
  const stale = previous.filter((name) => !current.includes(name));

  if (dryRun) {
    log.info(`[dry-run] Would deploy ${current.length} ${labels.dryRun} from ${src} to ${dst}`);
    if (stale.length > 0) {
      const pluralSuffix = stale.length > 1 ? "s" : "";
      log.info(`[dry-run] Would remove ${stale.length} stale ${labels.staleSingular}${pluralSuffix}: ${stale.join(", ")}`);
    }
    return {
      component,
      status: "skipped",
      message: `[dry-run] Would deploy ${current.length} ${labels.dryRun}, remove ${stale.length} stale`,
      verifyPassed: false,
    };
  }

  try {
    await ensureDir(dst);

    for (const name of stale) {
      await removeEntry(join(dst, name), entryKind);
    }

    const previousSet = new Set(previous);
    let skipped = 0;
    const deployedEntries: string[] = [];
    for (const name of current) {
      const target = join(dst, name);
      if (!alwaysOverwrite && !previousSet.has(name) && (await resolveWrite(target, deployMode)) === "skip") {
        skipped++;
        continue;
      }
      await copyEntry(join(src, name), target, entryKind);
      if (onCopyEntry) await onCopyEntry(target);
      deployedEntries.push(name);
    }

    await writeManifest(manifestPath, current);
    if (onDeployComplete) await onDeployComplete({ dstDir: dst, deployed: deployedEntries });

    const deployed = current.length - skipped;
    const removedMsg = stale.length > 0 ? `, removed ${stale.length} stale (${stale.join(", ")})` : "";
    const skipMsg = skipped > 0 ? `, skipped ${skipped} (user-owned collision)` : "";

    log.success(`Deployed ${deployed} ${labels.success} to ${dst}${removedMsg}${skipMsg}`);
    return {
      component,
      status: "installed",
      message: `${deployed} ${labels.result} deployed${removedMsg}${skipMsg}`,
      verifyPassed: true,
    };
  } catch (err) {
    return {
      component,
      status: "failed",
      message: `Failed to deploy ${kind}: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    };
  }
}
