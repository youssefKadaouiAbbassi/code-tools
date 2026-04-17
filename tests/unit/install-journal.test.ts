import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeJournal, readJournal, getJournalPath, type InstallJournal } from "../../src/install-journal.js";

const sample: InstallJournal = {
  version: "0.1.0",
  tier: "recommended",
  scope: "global",
  installedAt: "2026-04-17T14:00:00Z",
  plugins: [{ name: "feature-dev", marketplace: "claude-plugins-official" }],
  skills: ["do", "ship-feature"],
  commands: ["do.md"],
  agents: ["do-classifier.md"],
  hooks: ["pre-secrets-guard.sh"],
};

let fakeHome: string;
let originalJournalPath: string | undefined;

beforeEach(async () => {
  fakeHome = await fs.mkdtemp(join(tmpdir(), "journal-test-"));
  originalJournalPath = process.env.CODE_TOOLS_JOURNAL_PATH;
  process.env.CODE_TOOLS_JOURNAL_PATH = join(fakeHome, ".config", "code-tools", "install.json");
});

afterEach(async () => {
  if (originalJournalPath !== undefined) process.env.CODE_TOOLS_JOURNAL_PATH = originalJournalPath;
  else delete process.env.CODE_TOOLS_JOURNAL_PATH;
  await fs.rm(fakeHome, { recursive: true, force: true });
});

describe("install-journal", () => {
  test("writeJournal then readJournal roundtrips", async () => {
    await writeJournal(sample);
    const loaded = await readJournal();
    expect(loaded).toEqual(sample);
  });

  test("readJournal returns null when absent", async () => {
    const loaded = await readJournal();
    expect(loaded).toBeNull();
  });

  test("writeJournal is atomic — no temp file left after success", async () => {
    await writeJournal(sample);
    const journalDir = join(fakeHome, ".config", "code-tools");
    await fs.mkdir(journalDir, { recursive: true });
    const entries = await fs.readdir(journalDir);
    expect(entries).toContain("install.json");
    expect(entries.filter((e) => e.includes(".tmp-"))).toEqual([]);
  });

  test("readJournal returns null on corrupt JSON", async () => {
    const path = getJournalPath();
    await fs.mkdir(join(fakeHome, ".config", "code-tools"), { recursive: true });
    await fs.writeFile(path, "{not valid json");
    const loaded = await readJournal();
    expect(loaded).toBeNull();
  });

  test("writeJournal includes newline suffix", async () => {
    await writeJournal(sample);
    const raw = await fs.readFile(getJournalPath(), "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
  });
});
