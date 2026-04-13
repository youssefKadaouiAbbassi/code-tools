import { dirname } from "node:path";
import { copyFile, ensureDir, fileExists, log } from "./utils.js";
import { getLatestBackup } from "./backup.js";
export async function restore(manifest) {
    const target = manifest ?? getLatestBackup();
    if (!target) {
        log.error("No backup found to restore.");
        return;
    }
    log.info(`Restoring from backup: ${target.backupDir}`);
    log.info(`Timestamp: ${target.timestamp}`);
    log.info(`Files to restore: ${target.files.length}`);
    let restored = 0;
    let skipped = 0;
    for (const entry of target.files) {
        if (!fileExists(entry.backup)) {
            log.warn(`Backup file missing, skipping: ${entry.backup}`);
            skipped++;
            continue;
        }
        ensureDir(dirname(entry.original));
        copyFile(entry.backup, entry.original);
        restored++;
    }
    log.success(`Restore complete: ${restored} files restored, ${skipped} skipped`);
}
//# sourceMappingURL=restore.js.map