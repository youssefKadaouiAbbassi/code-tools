import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { ensureDir, fileExists, copyFile, writeFile, readFile, log } from "./utils.js";
const BACKUP_ROOT = join(homedir(), ".claude-backup");
export async function createBackup(files) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = join(BACKUP_ROOT, timestamp);
    ensureDir(backupDir);
    const entries = [];
    for (const original of files) {
        if (!fileExists(original))
            continue;
        const relative = original.replace(homedir(), "").replace(/^\//, "");
        const backup = join(backupDir, relative);
        ensureDir(dirname(backup));
        copyFile(original, backup);
        entries.push({ original, backup });
    }
    const manifest = {
        timestamp,
        backupDir,
        files: entries,
    };
    writeFile(join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    log.success(`Backup created: ${backupDir} (${entries.length} files)`);
    return manifest;
}
export function listBackups() {
    if (!fileExists(BACKUP_ROOT))
        return [];
    const dirs = readdirSync(BACKUP_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    const manifests = [];
    for (const dir of dirs) {
        const manifestPath = join(BACKUP_ROOT, dir, "manifest.json");
        if (!fileExists(manifestPath))
            continue;
        try {
            const data = JSON.parse(readFile(manifestPath));
            manifests.push(data);
        }
        catch {
            // Corrupted manifest — skip
        }
    }
    return manifests;
}
export function getLatestBackup() {
    const backups = listBackups();
    return backups.length > 0 ? backups[backups.length - 1] : null;
}
//# sourceMappingURL=backup.js.map