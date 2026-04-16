/** Per-file manifest backup used by primordial.ts. Layout: ~/.claude-backup/<ts>/<rel-path>. */
import { mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { BackupManifest, BackupEntry } from "./types.js";
import { ensureDir } from "./utils.js";

const BACKUP_BASE = join(Bun.env.HOME ?? "~", ".claude-backup");

function formatTimestamp(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const YYYY = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const DD = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${YYYY}${MM}${DD}-${HH}${mm}${ss}`;
}

function backupDirForTimestamp(timestamp: string): string {
  return join(BACKUP_BASE, timestamp);
}

export async function createBackup(paths: string[]): Promise<BackupManifest> {
  const timestamp = formatTimestamp(new Date());
  const backupDir = backupDirForTimestamp(timestamp);
  await ensureDir(backupDir);

  const entries: BackupEntry[] = [];

  for (const originalPath of paths) {
    const fileRef = Bun.file(originalPath);
    if (!(await fileRef.exists())) continue;

    // Preserve path structure: strip leading "/" and join into backupDir
    const relativePath = originalPath.startsWith("/")
      ? originalPath.slice(1)
      : originalPath;
    const backupPath = join(backupDir, relativePath);

    await ensureDir(dirname(backupPath));
    await Bun.write(backupPath, Bun.file(originalPath));

    entries.push({ originalPath, backupPath, timestamp });
  }

  const manifest: BackupManifest = { timestamp, entries };
  const manifestPath = join(backupDir, "manifest.json");
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  return manifest;
}

export async function listBackups(): Promise<BackupManifest[]> {
  await ensureDir(BACKUP_BASE);

  let dirs: string[];
  try {
    dirs = await readdir(BACKUP_BASE);
  } catch {
    return [];
  }

  const manifests: BackupManifest[] = [];

  for (const dir of dirs) {
    const manifestPath = join(BACKUP_BASE, dir, "manifest.json");
    const manifestFile = Bun.file(manifestPath);
    if (!(await manifestFile.exists())) continue;

    try {
      const manifest = await manifestFile.json() as BackupManifest;
      manifests.push(manifest);
    } catch {
      // skip malformed manifests
    }
  }

  manifests.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return manifests;
}

export async function getLatestBackup(): Promise<BackupManifest | null> {
  const all = await listBackups();
  return all.length > 0 ? all[all.length - 1] : null;
}

export async function backupIfExists(filePath: string, manifest: BackupManifest): Promise<void> {
  const fileRef = Bun.file(filePath);
  if (!(await fileRef.exists())) return;

  const backupDir = backupDirForTimestamp(manifest.timestamp);
  const relativePath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  const backupPath = join(backupDir, relativePath);

  await ensureDir(dirname(backupPath));
  await Bun.write(backupPath, Bun.file(filePath));

  manifest.entries.push({ originalPath: filePath, backupPath, timestamp: manifest.timestamp });

  const manifestPath = join(backupDir, "manifest.json");
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

export async function restoreFromPartialManifest(manifest: BackupManifest): Promise<void> {
  for (const entry of manifest.entries) {
    const backupFile = Bun.file(entry.backupPath);
    if (!(await backupFile.exists())) continue;

    await ensureDir(dirname(entry.originalPath));
    await Bun.write(entry.originalPath, backupFile);
  }
}
