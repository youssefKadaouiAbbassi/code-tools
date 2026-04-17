import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performCleanInstall } from "../../src/utils/backup.js";

let claudeDir: string;

beforeEach(async () => {
  const tmp = await fs.mkdtemp(join(tmpdir(), "clean-install-test-"));
  claudeDir = join(tmp, ".claude");
  await fs.mkdir(claudeDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(claudeDir, { recursive: true, force: true });
});

async function seedDir(dir: string, files: Record<string, string>): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name);
    await fs.mkdir(join(full, ".."), { recursive: true });
    await fs.writeFile(full, content);
  }
}

describe("performCleanInstall manifest-awareness", () => {
  test("preserves user-owned skills when no managed manifest", async () => {
    const skillsDir = join(claudeDir, "skills");
    await seedDir(skillsDir, { "custom-skill/SKILL.md": "user-owned" });

    await performCleanInstall(claudeDir);

    const preserved = await fs.readFile(join(skillsDir, "custom-skill/SKILL.md"), "utf-8");
    expect(preserved).toBe("user-owned");
  });

  test("removes only managed skills when manifest present", async () => {
    const skillsDir = join(claudeDir, "skills");
    await seedDir(skillsDir, {
      "ours/SKILL.md": "managed",
      "user-theirs/SKILL.md": "user-owned",
    });
    await fs.writeFile(
      join(skillsDir, ".code-tools-managed.json"),
      JSON.stringify({ version: 1, entries: ["ours"] }),
    );

    await performCleanInstall(claudeDir);

    expect(fs.access(join(skillsDir, "ours"))).rejects.toThrow();
    const userContent = await fs.readFile(join(skillsDir, "user-theirs/SKILL.md"), "utf-8");
    expect(userContent).toBe("user-owned");
  });

  test("removes manifest file itself after removing managed entries", async () => {
    const hooksDir = join(claudeDir, "hooks");
    await seedDir(hooksDir, { "ours.sh": "#!/bin/bash" });
    await fs.writeFile(
      join(hooksDir, ".code-tools-managed.json"),
      JSON.stringify({ version: 1, entries: ["ours.sh"] }),
    );

    await performCleanInstall(claudeDir);

    expect(fs.access(join(hooksDir, ".code-tools-managed.json"))).rejects.toThrow();
  });
});
