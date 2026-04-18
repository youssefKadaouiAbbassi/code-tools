import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deployManagedDirectory } from "../../src/deploy.js";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const MANIFEST_NAME = ".yka-code-managed.json";

let workDir: string;
let src: string;
let dst: string;
let manifestPath: string;

beforeEach(async () => {
  workDir = await fs.mkdtemp(join(tmpdir(), "deploy-managed-test-"));
  src = join(workDir, "src");
  dst = join(workDir, "dst");
  await fs.mkdir(src, { recursive: true });
  manifestPath = join(dst, MANIFEST_NAME);
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

async function seedSkills(dir: string, names: string[]): Promise<void> {
  for (const name of names) {
    await fs.mkdir(join(dir, name), { recursive: true });
    await fs.writeFile(join(dir, name, "SKILL.md"), `# ${name}\n`);
  }
}

async function seedFiles(dir: string, names: string[]): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  for (const name of names) {
    await fs.writeFile(join(dir, name), `content:${name}\n`);
  }
}

function skillsOpts(overrides: Partial<Parameters<typeof deployManagedDirectory>[0]> = {}) {
  return {
    component: "orchestration-skills",
    src,
    dst,
    manifestPath,
    kind: "skills" as const,
    entryKind: "directory" as const,
    glob: "*/SKILL.md",
    dryRun: false,
    ...overrides,
  };
}

function commandsOpts(overrides: Partial<Parameters<typeof deployManagedDirectory>[0]> = {}) {
  return {
    component: "user-commands",
    src,
    dst,
    manifestPath,
    kind: "commands" as const,
    entryKind: "file" as const,
    glob: "*.md",
    dryRun: false,
    ...overrides,
  };
}

function agentsOpts(overrides: Partial<Parameters<typeof deployManagedDirectory>[0]> = {}) {
  return {
    component: "user-agents",
    src,
    dst,
    manifestPath,
    kind: "agents" as const,
    entryKind: "file" as const,
    glob: "*.md",
    dryRun: false,
    ...overrides,
  };
}

describe("deployManagedDirectory — skills (directory entryKind)", () => {
  test("empty target: copies all entries and writes sorted manifest", async () => {
    await seedSkills(src, ["beta", "alpha", "gamma"]);

    const result = await deployManagedDirectory(skillsOpts());

    expect(result.status).toBe("installed");
    expect(result.verifyPassed).toBe(true);
    expect(await fs.readFile(join(dst, "alpha/SKILL.md"), "utf-8")).toBe("# alpha\n");
    expect(await fs.readFile(join(dst, "beta/SKILL.md"), "utf-8")).toBe("# beta\n");
    expect(await fs.readFile(join(dst, "gamma/SKILL.md"), "utf-8")).toBe("# gamma\n");

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    expect(manifest).toEqual({ version: 1, entries: ["alpha", "beta", "gamma"] });
  });

  test("manifest JSON is pretty-printed with trailing newline", async () => {
    await seedSkills(src, ["one", "two"]);

    await deployManagedDirectory(skillsOpts());

    const raw = await fs.readFile(manifestPath, "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain("  \"version\": 1");
    expect(raw).toContain("  \"entries\": [");
  });

  test("second run with one source removed: removes stale skill + manifest entry", async () => {
    await seedSkills(src, ["alpha", "beta", "gamma"]);
    await deployManagedDirectory(skillsOpts());

    await fs.rm(join(src, "beta"), { recursive: true });
    const result = await deployManagedDirectory(skillsOpts());

    expect(result.status).toBe("installed");
    expect(result.message).toContain("removed 1 stale");
    await expect(fs.access(join(dst, "beta"))).rejects.toThrow();

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    expect(manifest.entries).toEqual(["alpha", "gamma"]);
  });

  test("unchanged source: second run reports no stale", async () => {
    await seedSkills(src, ["alpha"]);
    await deployManagedDirectory(skillsOpts());
    const result = await deployManagedDirectory(skillsOpts());

    expect(result.status).toBe("installed");
    expect(result.message).not.toContain("removed");
    expect(result.message).not.toContain("stale");
  });

  test("corrupt manifest treated as empty (parity with readManifest)", async () => {
    await seedSkills(src, ["alpha"]);
    await fs.mkdir(dst, { recursive: true });
    await fs.writeFile(manifestPath, "{not valid json");

    const result = await deployManagedDirectory(skillsOpts());

    expect(result.status).toBe("installed");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    expect(manifest).toEqual({ version: 1, entries: ["alpha"] });
  });

  test("dry-run: no writes; skipped status with dry-run message", async () => {
    await seedSkills(src, ["alpha", "beta"]);

    const result = await deployManagedDirectory(skillsOpts({ dryRun: true }));

    expect(result.status).toBe("skipped");
    expect(result.verifyPassed).toBe(false);
    expect(result.message).toContain("[dry-run]");
    expect(result.message).toContain("2 skills");
    await expect(fs.access(dst)).rejects.toThrow();
  });

  test("dry-run with stale entries mentions them", async () => {
    await seedSkills(src, ["alpha", "beta"]);
    await deployManagedDirectory(skillsOpts());

    await fs.rm(join(src, "beta"), { recursive: true });
    const result = await deployManagedDirectory(skillsOpts({ dryRun: true }));

    expect(result.status).toBe("skipped");
    expect(result.message).toContain("remove 1 stale");
  });
});

describe("deployManagedDirectory — commands (file entryKind)", () => {
  test("empty target: copies all files and writes sorted manifest", async () => {
    await seedFiles(src, ["do.md", "status.md", "help.md"]);

    const result = await deployManagedDirectory(commandsOpts());

    expect(result.status).toBe("installed");
    expect(await fs.readFile(join(dst, "do.md"), "utf-8")).toBe("content:do.md\n");
    expect(await fs.readFile(join(dst, "help.md"), "utf-8")).toBe("content:help.md\n");

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    expect(manifest).toEqual({ version: 1, entries: ["do.md", "help.md", "status.md"] });
  });

  test("second run with one source removed: removes stale file + manifest entry", async () => {
    await seedFiles(src, ["a.md", "b.md"]);
    await deployManagedDirectory(commandsOpts());

    await fs.rm(join(src, "a.md"));
    await deployManagedDirectory(commandsOpts());

    await expect(fs.access(join(dst, "a.md"))).rejects.toThrow();
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    expect(manifest.entries).toEqual(["b.md"]);
  });
});

describe("deployManagedDirectory — agents kind", () => {
  test("deploys *.md files including the legacy AGENTS.md carve-out (parity with pre-refactor core.ts)", async () => {
    await seedFiles(src, ["foo.md", "bar.md"]);

    const result = await deployManagedDirectory(agentsOpts());

    expect(result.status).toBe("installed");
    expect(await fs.readFile(join(dst, "foo.md"), "utf-8")).toBe("content:foo.md\n");
    expect(await fs.readFile(join(dst, "bar.md"), "utf-8")).toBe("content:bar.md\n");

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    expect(manifest.entries).toEqual(["bar.md", "foo.md"]);
  });
});

describe("deployManagedDirectory — add-on-top semantics", () => {
  test("skip policy: existing non-managed file is preserved and counted in skipped", async () => {
    await seedFiles(src, ["a.md", "b.md"]);
    await fs.mkdir(dst, { recursive: true });
    await fs.writeFile(join(dst, "a.md"), "USER-OWNED");

    const writelogDir = join(workDir, "addontop");
    await fs.mkdir(writelogDir, { recursive: true });

    const result = await deployManagedDirectory(
      commandsOpts({
        deployMode: {
          mode: "add-on-top",
          addOnTopLogPath: writelogDir,
          conflictPolicy: "skip",
          claudeDir: workDir,
        },
      }),
    );

    expect(result.status).toBe("installed");
    expect(result.message).toContain("skipped 1");
    expect(await fs.readFile(join(dst, "a.md"), "utf-8")).toBe("USER-OWNED");
    expect(await fs.readFile(join(dst, "b.md"), "utf-8")).toBe("content:b.md\n");
  });

  test("overwrite policy: existing non-managed file is snapshotted then overwritten", async () => {
    await seedFiles(src, ["a.md"]);
    await fs.mkdir(dst, { recursive: true });
    await fs.writeFile(join(dst, "a.md"), "USER-OWNED");

    const writelogDir = join(workDir, "addontop");
    await fs.mkdir(writelogDir, { recursive: true });

    const result = await deployManagedDirectory(
      commandsOpts({
        deployMode: {
          mode: "add-on-top",
          addOnTopLogPath: writelogDir,
          conflictPolicy: "overwrite",
          claudeDir: dst,
        },
      }),
    );

    expect(result.status).toBe("installed");
    expect(result.message).not.toContain("skipped");
    expect(await fs.readFile(join(dst, "a.md"), "utf-8")).toBe("content:a.md\n");

    const writelog = await fs.readFile(join(writelogDir, "writelog.jsonl"), "utf-8");
    const entries = writelog.trim().split("\n").map((l) => JSON.parse(l));
    const overwriteEntry = entries.find((e) => e.op === "overwrite" && e.target === join(dst, "a.md"));
    expect(overwriteEntry).toBeDefined();
    const snapshot = await fs.readFile(overwriteEntry.snapshotPath, "utf-8");
    expect(snapshot).toBe("USER-OWNED");
  });

  test("previously managed entries bypass add-on-top skip check", async () => {
    await seedFiles(src, ["a.md"]);
    await deployManagedDirectory(commandsOpts());

    const writelogDir = join(workDir, "addontop");
    await fs.mkdir(writelogDir, { recursive: true });

    await fs.writeFile(join(src, "a.md"), "v2\n");
    const result = await deployManagedDirectory(
      commandsOpts({
        deployMode: {
          mode: "add-on-top",
          addOnTopLogPath: writelogDir,
          conflictPolicy: "skip",
          claudeDir: dst,
        },
      }),
    );

    expect(result.status).toBe("installed");
    expect(result.message).not.toContain("skipped");
    expect(await fs.readFile(join(dst, "a.md"), "utf-8")).toBe("v2\n");
  });
});

describe("deployManagedDirectory — fixture parity", () => {
  test("real skills tree produces a manifest matching tests/fixtures/deploy-manifest.json", async () => {
    const realSrc = join(REPO_ROOT, "skills");
    const result = await deployManagedDirectory({
      component: "orchestration-skills",
      src: realSrc,
      dst,
      manifestPath,
      kind: "skills",
      entryKind: "directory",
      glob: "*/SKILL.md",
      dryRun: false,
    });

    expect(result.status).toBe("installed");

    const manifestActual = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    const fixture = JSON.parse(
      await fs.readFile(join(REPO_ROOT, "tests", "fixtures", "deploy-manifest.json"), "utf-8"),
    );
    expect(manifestActual).toEqual(fixture);
  });
});
