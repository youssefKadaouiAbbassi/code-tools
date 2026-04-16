/** Add-on-top write log: append-only JSONL audit trail enabling rollback.
 *  Schema per plan Phase 2.5.
 */
import { promises as fs } from "fs";
import { join, dirname, relative } from "path";
import { log } from "./utils.js";

export type WriteLogEntry =
  | { op: "create"; target: string; timestamp: string }
  | { op: "overwrite"; target: string; snapshotPath: string; timestamp: string }
  | { op: "merge"; target: string; snapshotPath: string; mergedKeys: string[]; timestamp: string }
  | { op: "skip"; target: string; reason: string; timestamp: string };

export interface AddOnTopManifest {
  timestamp: string;
  claudeDir: string;
  conflictPolicy: "skip" | "overwrite";
}

function nowIso(): string {
  return new Date().toISOString();
}

async function appendEntry(writelogDir: string, entry: WriteLogEntry): Promise<void> {
  const logPath = join(writelogDir, "writelog.jsonl");
  const line = JSON.stringify(entry) + "\n";
  await fs.appendFile(logPath, line, "utf-8");
}

async function snapshotFile(
  writelogDir: string,
  claudeDir: string,
  target: string,
): Promise<string> {
  const rel = relative(claudeDir, target);
  const snapshotPath = join(writelogDir, "snapshots", rel);
  await fs.mkdir(dirname(snapshotPath), { recursive: true });
  await fs.copyFile(target, snapshotPath);
  return snapshotPath;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Record a create operation (new file written, no prior existence).
 */
export async function logCreate(
  writelogDir: string,
  target: string,
): Promise<void> {
  await appendEntry(writelogDir, { op: "create", target, timestamp: nowIso() });
}

/**
 * Record an overwrite operation with a pre-write snapshot.
 * Caller must call this BEFORE writing.
 */
export async function logOverwrite(
  writelogDir: string,
  claudeDir: string,
  target: string,
): Promise<void> {
  const snapshotPath = await snapshotFile(writelogDir, claudeDir, target);
  await appendEntry(writelogDir, {
    op: "overwrite",
    target,
    snapshotPath,
    timestamp: nowIso(),
  });
}

/**
 * Record a merge operation with a pre-merge snapshot and merged key list.
 * Caller must call this BEFORE merging.
 */
export async function logMerge(
  writelogDir: string,
  claudeDir: string,
  target: string,
  mergedKeys: string[],
): Promise<void> {
  const snapshotPath = await snapshotFile(writelogDir, claudeDir, target);
  await appendEntry(writelogDir, {
    op: "merge",
    target,
    snapshotPath,
    mergedKeys,
    timestamp: nowIso(),
  });
}

/**
 * Record a skip operation (file existed, conflict policy = skip).
 */
export async function logSkip(
  writelogDir: string,
  target: string,
  reason: string,
): Promise<void> {
  await appendEntry(writelogDir, {
    op: "skip",
    target,
    reason,
    timestamp: nowIso(),
  });
}

/**
 * Read writelog entries from JSONL, tolerating a partial last line.
 */
async function readEntries(writelogDir: string): Promise<WriteLogEntry[]> {
  const logPath = join(writelogDir, "writelog.jsonl");
  const raw = await fs.readFile(logPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const entries: WriteLogEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as WriteLogEntry);
    } catch {
      log.warn(`Skipping malformed writelog line: ${line.slice(0, 80)}`);
    }
  }
  return entries;
}

/**
 * Reverse-order replay of writelog to undo an add-on-top install.
 * Best-effort per-entry: failures are logged but don't abort rollback.
 */
export async function rollbackAddOnTop(writelogDirPath: string): Promise<void> {
  const entries = await readEntries(writelogDirPath);

  log.info(`Rolling back add-on-top install (${entries.length} entries)...`);

  // Replay in reverse
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    try {
      switch (entry.op) {
        case "create": {
          if (await fileExists(entry.target)) {
            await fs.rm(entry.target, { force: true, recursive: true });
          }
          break;
        }
        case "overwrite":
        case "merge": {
          if (await fileExists(entry.snapshotPath)) {
            await fs.mkdir(dirname(entry.target), { recursive: true });
            await fs.copyFile(entry.snapshotPath, entry.target);
          }
          break;
        }
        case "skip":
          // no-op
          break;
      }
    } catch (err) {
      log.warn(
        `Failed to rollback ${entry.op} on ${entry.target}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Leave sentinel marker
  try {
    await fs.writeFile(
      join(writelogDirPath, "rolled-back.marker"),
      new Date().toISOString(),
    );
  } catch {
    // ignore
  }

  log.info("✓ Add-on-top rollback complete.");
}
