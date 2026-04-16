import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createBackup, listBackups, getLatestBackup, restoreFromPartialManifest } from "../../src/backup.js";

let tmpDir: string;

// backup.ts captures BACKUP_BASE = join(Bun.env.HOME, ".claude-backup") at module
// load time, so we cannot redirect it per-test. Instead we use a unique tmpDir
// only for source files; backups land in the real ~/.claude-backup.
// We clean up the specific backup dirs we create using the timestamps from manifests.

const createdBackupDirs: string[] = [];
const REAL_BACKUP_BASE = join(Bun.env.HOME ?? "~", ".claude-backup");

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "code-tools-backup-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  // Clean up backup dirs we created during this test
  for (const dir of createdBackupDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("createBackup", () => {
  test("creates backup dir with manifest.json listing correct files", async () => {
    // Create source files
    const file1 = join(tmpDir, "file1.txt");
    const file2 = join(tmpDir, "file2.txt");
    await writeFile(file1, "content one");
    await writeFile(file2, "content two");

    const manifest = await createBackup([file1, file2]);
    createdBackupDirs.push(join(REAL_BACKUP_BASE, manifest.timestamp));

    expect(manifest.entries.length).toBe(2);
    expect(manifest.entries.map((e) => e.originalPath)).toContain(file1);
    expect(manifest.entries.map((e) => e.originalPath)).toContain(file2);
    expect(typeof manifest.timestamp).toBe("string");

    // Manifest file exists on disk at the path recorded in the entries
    const manifestFile = Bun.file(
      join(REAL_BACKUP_BASE, manifest.timestamp, "manifest.json")
    );
    expect(await manifestFile.exists()).toBe(true);
  });

  test("skips non-existing files — only existing files appear in manifest", async () => {
    const existing = join(tmpDir, "exists.txt");
    const missing = join(tmpDir, "missing.txt");
    await writeFile(existing, "I exist");

    const manifest = await createBackup([existing, missing]);
    createdBackupDirs.push(join(REAL_BACKUP_BASE, manifest.timestamp));

    expect(manifest.entries.length).toBe(1);
    expect(manifest.entries[0].originalPath).toBe(existing);
  });
});

describe("restoreFromPartialManifest", () => {
  test("restores deleted files with correct content", async () => {
    const file1 = join(tmpDir, "restore-me.txt");
    await writeFile(file1, "original content");

    const manifest = await createBackup([file1]);
    createdBackupDirs.push(join(REAL_BACKUP_BASE, manifest.timestamp));

    // Delete the original
    await rm(file1, { force: true });
    expect(await Bun.file(file1).exists()).toBe(false);

    // Restore
    await restoreFromPartialManifest(manifest);

    expect(await Bun.file(file1).exists()).toBe(true);
    const restoredContent = await readFile(file1, "utf8");
    expect(restoredContent).toBe("original content");
  });
});

describe("listBackups", () => {
  test("returns both backups sorted by timestamp", async () => {
    const fileA = join(tmpDir, "a.txt");
    const fileB = join(tmpDir, "b.txt");
    await writeFile(fileA, "aaa");
    await writeFile(fileB, "bbb");

    // Create two backups — wait >1s to ensure different second-resolution timestamps
    const m1 = await createBackup([fileA]);
    createdBackupDirs.push(join(REAL_BACKUP_BASE, m1.timestamp));
    await new Promise((r) => setTimeout(r, 1100));
    const m2 = await createBackup([fileB]);
    createdBackupDirs.push(join(REAL_BACKUP_BASE, m2.timestamp));

    const backups = await listBackups();

    expect(backups.length).toBeGreaterThanOrEqual(2);

    const timestamps = backups.map((b) => b.timestamp);
    expect(timestamps).toContain(m1.timestamp);
    expect(timestamps).toContain(m2.timestamp);

    // Sorted ascending
    const idx1 = timestamps.indexOf(m1.timestamp);
    const idx2 = timestamps.indexOf(m2.timestamp);
    expect(idx1).toBeLessThan(idx2);
  });
});

describe("getLatestBackup", () => {
  test("returns a backup at least as recent as the last one we created", async () => {
    const fileA = join(tmpDir, "latest-a.txt");
    const fileB = join(tmpDir, "latest-b.txt");
    await writeFile(fileA, "aaa");
    await writeFile(fileB, "bbb");

    const m1 = await createBackup([fileA]);
    createdBackupDirs.push(join(REAL_BACKUP_BASE, m1.timestamp));
    await new Promise((r) => setTimeout(r, 1100));
    const latest = await createBackup([fileB]);
    createdBackupDirs.push(join(REAL_BACKUP_BASE, latest.timestamp));

    const result = await getLatestBackup();

    expect(result).not.toBeNull();
    // The result should be at least as recent as our second backup (timestamps sort lexicographically)
    expect(result!.timestamp >= latest.timestamp).toBe(true);
    // m1 must be older than latest
    expect(m1.timestamp < latest.timestamp).toBe(true);
  });
});
