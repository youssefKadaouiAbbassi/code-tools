/** Tests for add-on-top write log + rollback. */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  logCreate,
  logOverwrite,
  logMerge,
  logSkip,
  rollbackAddOnTop,
} from "../../src/add-on-top.js";

let workDir: string;
let claudeDir: string;
let writelogDir: string;

beforeEach(async () => {
  workDir = await fs.mkdtemp(join(tmpdir(), "addontop-test-"));
  claudeDir = join(workDir, ".claude");
  writelogDir = join(claudeDir, ".omc-addontop-test");
  await fs.mkdir(claudeDir, { recursive: true });
  await fs.mkdir(join(writelogDir, "snapshots"), { recursive: true });
  await fs.writeFile(join(writelogDir, "writelog.jsonl"), "");
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe("write log operations", () => {
  test("logCreate appends entry", async () => {
    await logCreate(writelogDir, join(claudeDir, "new-file.txt"));
    const raw = await fs.readFile(join(writelogDir, "writelog.jsonl"), "utf-8");
    const entry = JSON.parse(raw.trim());
    expect(entry.op).toBe("create");
    expect(entry.target).toBe(join(claudeDir, "new-file.txt"));
  });

  test("logOverwrite snapshots then logs", async () => {
    const target = join(claudeDir, "existing.txt");
    await fs.writeFile(target, "original content");

    await logOverwrite(writelogDir, claudeDir, target);

    const raw = await fs.readFile(join(writelogDir, "writelog.jsonl"), "utf-8");
    const entry = JSON.parse(raw.trim());
    expect(entry.op).toBe("overwrite");
    expect(entry.target).toBe(target);

    const snapContent = await fs.readFile(entry.snapshotPath, "utf-8");
    expect(snapContent).toBe("original content");
  });

  test("logMerge records merged keys", async () => {
    const target = join(claudeDir, "settings.json");
    await fs.writeFile(target, '{"a":1}');

    await logMerge(writelogDir, claudeDir, target, ["b", "c"]);

    const raw = await fs.readFile(join(writelogDir, "writelog.jsonl"), "utf-8");
    const entry = JSON.parse(raw.trim());
    expect(entry.op).toBe("merge");
    expect(entry.mergedKeys).toEqual(["b", "c"]);
  });

  test("logSkip records reason", async () => {
    await logSkip(writelogDir, join(claudeDir, "plugin-a"), "already exists");
    const raw = await fs.readFile(join(writelogDir, "writelog.jsonl"), "utf-8");
    const entry = JSON.parse(raw.trim());
    expect(entry.op).toBe("skip");
    expect(entry.reason).toBe("already exists");
  });
});

describe("rollbackAddOnTop", () => {
  test("create → delete file on rollback", async () => {
    const target = join(claudeDir, "new.txt");
    await fs.writeFile(target, "created content");
    await logCreate(writelogDir, target);

    await rollbackAddOnTop(writelogDir);

    await expect(fs.access(target)).rejects.toThrow();
  });

  test("overwrite → restore snapshot on rollback", async () => {
    const target = join(claudeDir, "config.json");
    await fs.writeFile(target, "original");
    await logOverwrite(writelogDir, claudeDir, target);
    await fs.writeFile(target, "new");

    await rollbackAddOnTop(writelogDir);

    const content = await fs.readFile(target, "utf-8");
    expect(content).toBe("original");
  });

  test("reverse-order replay", async () => {
    const file1 = join(claudeDir, "file1.txt");
    const file2 = join(claudeDir, "file2.txt");
    await logCreate(writelogDir, file1);
    await fs.writeFile(file1, "1");
    await logCreate(writelogDir, file2);
    await fs.writeFile(file2, "2");

    await rollbackAddOnTop(writelogDir);

    await expect(fs.access(file1)).rejects.toThrow();
    await expect(fs.access(file2)).rejects.toThrow();
  });

  test("leaves rolled-back.marker sentinel", async () => {
    await logCreate(writelogDir, join(claudeDir, "x.txt"));
    await fs.writeFile(join(claudeDir, "x.txt"), "x");

    await rollbackAddOnTop(writelogDir);

    const marker = await fs.readFile(
      join(writelogDir, "rolled-back.marker"),
      "utf-8",
    );
    expect(marker.length).toBeGreaterThan(0);
  });

  test("skip entries are no-ops", async () => {
    await logSkip(writelogDir, join(claudeDir, "plugin"), "exists");
    // Should not throw
    await rollbackAddOnTop(writelogDir);
  });

  test("tolerates malformed trailing line", async () => {
    await logCreate(writelogDir, join(claudeDir, "a.txt"));
    await fs.writeFile(join(claudeDir, "a.txt"), "a");
    // Append partial/malformed line
    await fs.appendFile(
      join(writelogDir, "writelog.jsonl"),
      '{"op":"create","target":"broken\n',
    );

    await rollbackAddOnTop(writelogDir);

    await expect(fs.access(join(claudeDir, "a.txt"))).rejects.toThrow();
  });
});
