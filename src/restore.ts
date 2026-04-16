/** Unified restore entry point. Handles both layouts:
 *  - Legacy per-file manifest (src/backup.ts) at ~/.claude-backup/<ts>/
 *  - Full-tree backup (src/utils/backup.ts) at ~/.claude-backup-<ts>/
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { select, confirm, intro, outro, cancel, isCancel } from "@clack/prompts";
import { listBackups, restoreFromPartialManifest } from "./backup.js";
import { restoreFromBackup as restoreFullTree } from "./utils/backup.js";
import type { BackupManifest } from "./types.js";

type UtilsManifest = {
  timestamp: string;
  targetDir?: string;
  mcpServers?: string[];
  plugins?: string[];
  skills?: string[];
};

type UnifiedBackup =
  | { layout: "legacy"; manifest: BackupManifest; path: string }
  | { layout: "full-tree"; manifest: UtilsManifest; path: string };

async function listFullTreeBackups(): Promise<{ path: string; manifest: UtilsManifest }[]> {
  const home = homedir();
  const results: { path: string; manifest: UtilsManifest }[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(home);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.startsWith(".claude-backup-")) continue;
    const backupPath = join(home, entry);
    const manifestPath = join(backupPath, "manifest.json");
    try {
      const raw = await fs.readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(raw) as UtilsManifest;
      results.push({ path: backupPath, manifest });
    } catch {
      // skip malformed or missing
    }
  }

  results.sort((a, b) => a.manifest.timestamp.localeCompare(b.manifest.timestamp));
  return results;
}

async function listAllBackups(): Promise<UnifiedBackup[]> {
  const legacy = await listBackups();
  const fullTree = await listFullTreeBackups();
  const unified: UnifiedBackup[] = [];

  for (const m of legacy) {
    unified.push({ layout: "legacy", manifest: m, path: m.timestamp });
  }
  for (const { path, manifest } of fullTree) {
    unified.push({ layout: "full-tree", manifest, path });
  }

  unified.sort((a, b) => a.manifest.timestamp.localeCompare(b.manifest.timestamp));
  return unified;
}

export async function listAvailableBackups(): Promise<
  { path: string; timestamp: string; layout: string; detail: string }[]
> {
  const all = await listAllBackups();
  return all.map((b) => {
    if (b.layout === "legacy") {
      return {
        path: b.path,
        timestamp: b.manifest.timestamp,
        layout: "legacy",
        detail: `${b.manifest.entries.length} files`,
      };
    }
    const size =
      (b.manifest.plugins?.length ?? 0) +
      (b.manifest.skills?.length ?? 0) +
      (b.manifest.mcpServers?.length ?? 0);
    return {
      path: b.path,
      timestamp: b.manifest.timestamp,
      layout: "full-tree",
      detail: `${size} items${b.manifest.targetDir ? ` → ${b.manifest.targetDir}` : ""}`,
    };
  });
}

export async function confirmRestore(): Promise<boolean> {
  const result = await confirm({
    message: "Are you sure you want to restore? This will overwrite existing files.",
  });

  if (isCancel(result)) {
    return false;
  }

  return result as boolean;
}

async function resolveLegacyTargetDir(manifest: UtilsManifest, interactive: boolean): Promise<string | null> {
  if (manifest.targetDir) return manifest.targetDir;

  console.error(
    `Warning: backup manifest predates targetDir field. Defaulting to ~/.claude.`,
  );

  if (!interactive) {
    // Non-interactive: require explicit flag (not wired here — caller should pass explicitly)
    return join(homedir(), ".claude");
  }

  const confirmed = await confirm({
    message: `Restore this legacy backup to ${join(homedir(), ".claude")}?`,
  });
  if (isCancel(confirmed) || !confirmed) return null;
  return join(homedir(), ".claude");
}

export async function runRestore(backupPath?: string): Promise<void> {
  intro("Code-Tools Restore");

  const backups = await listAllBackups();

  if (backups.length === 0) {
    outro("No backups found. Nothing to restore.");
    return;
  }

  let target: UnifiedBackup | undefined;

  if (backupPath) {
    target = backups.find(
      (b) =>
        b.path === backupPath ||
        b.manifest.timestamp === backupPath ||
        b.path.endsWith(backupPath),
    );

    if (!target) {
      outro(`No backup found matching: ${backupPath}`);
      return;
    }
  } else {
    const choices = backups.map((b) => {
      if (b.layout === "legacy") {
        return {
          value: b.path,
          label: `[legacy]    ${b.manifest.timestamp}  (${b.manifest.entries.length} files)`,
        };
      }
      return {
        value: b.path,
        label: `[full-tree] ${b.manifest.timestamp}${b.manifest.targetDir ? `  → ${b.manifest.targetDir}` : ""}`,
      };
    });

    const selected = await select({
      message: "Select a backup to restore:",
      options: choices,
    });

    if (isCancel(selected)) {
      cancel("Restore cancelled.");
      return;
    }

    target = backups.find((b) => b.path === selected);
  }

  if (!target) {
    outro("Could not locate the selected backup.");
    return;
  }

  const confirmed = await confirmRestore();
  if (!confirmed) {
    cancel("Restore cancelled.");
    return;
  }

  try {
    if (target.layout === "legacy") {
      await restoreFromPartialManifest(target.manifest);
      outro(
        `Restored ${target.manifest.entries.length} file${target.manifest.entries.length !== 1 ? "s" : ""} from legacy backup ${target.manifest.timestamp}.`,
      );
    } else {
      const targetDir = await resolveLegacyTargetDir(target.manifest, true);
      if (!targetDir) {
        cancel("Restore cancelled.");
        return;
      }
      await restoreFullTree(target.path, targetDir);
      outro(`Restored full-tree backup ${target.manifest.timestamp} to ${targetDir}.`);
    }
  } catch (error) {
    outro(
      `Restore failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}
