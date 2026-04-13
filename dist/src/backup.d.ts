import type { BackupManifest } from "./types.js";
export declare function createBackup(files: string[]): Promise<BackupManifest>;
export declare function listBackups(): BackupManifest[];
export declare function getLatestBackup(): BackupManifest | null;
