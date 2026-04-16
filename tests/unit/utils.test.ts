import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  commandExists,
  mergeJsonFile,
  appendToShellRc,
  readJson,
  writeJson,
  copyFile,
  getConfigsDir,
} from "../../src/utils.js";
import type { DetectedEnvironment } from "../../src/types.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "code-tools-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// Helper: build a minimal DetectedEnvironment pointing shellRcPath at a temp file
function makeEnv(rcPath: string): DetectedEnvironment {
  return {
    os: "linux",
    arch: "x64",
    shell: "bash",
    shellRcPath: rcPath,
    packageManager: "apt",
    homeDir: tmpDir,
    claudeDir: join(tmpDir, ".claude"),
    existingTools: new Map(),
    dockerAvailable: false,
  };
}

describe("commandExists", () => {
  test("returns true for a known binary (ls)", () => {
    expect(commandExists("ls")).toBe(true);
  });

  test("returns false for a nonexistent binary", () => {
    expect(commandExists("nonexistent-xyz-binary-abc")).toBe(false);
  });
});

describe("mergeJsonFile", () => {
  test("array union for deny rules — no duplicates, preserves custom rules", async () => {
    const target = join(tmpDir, "settings.json");
    const existing = {
      permissions: { deny: ["rm -rf /", "custom-user-rule"] },
    };
    await writeJson(target, existing);

    const patch = {
      permissions: { deny: ["new-rule-1", "rm -rf /", "new-rule-2"] },
    };
    await mergeJsonFile(target, patch);

    const result = await readJson<{ permissions: { deny: string[] } }>(target);
    const deny = result.permissions.deny;

    // No duplicates
    const unique = new Set(deny);
    expect(unique.size).toBe(deny.length);

    // Both old and new rules present
    expect(deny).toContain("rm -rf /");
    expect(deny).toContain("custom-user-rule");
    expect(deny).toContain("new-rule-1");
    expect(deny).toContain("new-rule-2");
  });

  test("mcpServers per-key replace — preserves existing, adds new, no deep merge", async () => {
    const target = join(tmpDir, "settings.json");
    const existing = {
      mcpServers: {
        "my-custom-mcp": { type: "stdio", command: "my-tool" },
      },
    };
    await writeJson(target, existing);

    const patch = {
      mcpServers: {
        "new-server": { type: "stdio", command: "new-cmd", args: ["--flag"] },
      },
    };
    await mergeJsonFile(target, patch);

    const result = await readJson<{ mcpServers: Record<string, unknown> }>(target);
    const servers = result.mcpServers;

    // Existing user MCP preserved
    expect(servers["my-custom-mcp"]).toBeDefined();
    // New server added
    expect(servers["new-server"]).toBeDefined();
    expect((servers["new-server"] as Record<string, unknown>).command).toBe("new-cmd");
  });

  test("scalar overwrite — replaces old model value", async () => {
    const target = join(tmpDir, "settings.json");
    await writeJson(target, { model: "old-model" });

    await mergeJsonFile(target, { model: "new-model" });

    const result = await readJson<{ model: string }>(target);
    expect(result.model).toBe("new-model");
  });

  test("creates file when it does not exist", async () => {
    const target = join(tmpDir, "new-settings.json");
    await mergeJsonFile(target, { key: "value" });

    const result = await readJson<{ key: string }>(target);
    expect(result.key).toBe("value");
  });
});

describe("appendToShellRc", () => {
  test("idempotent — block appears exactly once after two calls", async () => {
    const rcPath = join(tmpDir, ".bashrc");
    await writeFile(rcPath, "# existing content\n");
    const env = makeEnv(rcPath);

    await appendToShellRc(env, ['export FOO="bar"'], "my-section");
    await appendToShellRc(env, ['export FOO="bar"'], "my-section");

    const content = await Bun.file(rcPath).text();
    const startCount = (content.match(/# code-tools-managed start:my-section/g) ?? []).length;
    expect(startCount).toBe(1);
  });

  test("updates existing block — lines A replaced by lines B", async () => {
    const rcPath = join(tmpDir, ".bashrc");
    await writeFile(rcPath, "# existing\n");
    const env = makeEnv(rcPath);

    await appendToShellRc(env, ['export OLD="yes"'], "my-section");
    await appendToShellRc(env, ['export NEW="yes"'], "my-section");

    const content = await Bun.file(rcPath).text();
    expect(content).toContain('export NEW="yes"');
    expect(content).not.toContain('export OLD="yes"');
  });
});

describe("readJson / writeJson", () => {
  test("roundtrip — written object equals read object", async () => {
    const path = join(tmpDir, "data.json");
    const data = { name: "test", value: 42, nested: { arr: [1, 2, 3] } };

    await writeJson(path, data);
    const result = await readJson(path);

    expect(result).toEqual(data);
  });
});

describe("copyFile", () => {
  test("copies file contents correctly", async () => {
    const src = join(tmpDir, "source.txt");
    const dest = join(tmpDir, "dest.txt");
    await writeFile(src, "hello world");

    await copyFile(src, dest);

    const content = await Bun.file(dest).text();
    expect(content).toBe("hello world");
  });
});

describe("getConfigsDir", () => {
  test("returns a path ending in /configs", () => {
    const dir = getConfigsDir();
    expect(dir.endsWith("/configs")).toBe(true);
  });
});
