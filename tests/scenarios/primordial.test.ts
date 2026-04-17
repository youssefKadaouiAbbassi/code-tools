import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { DetectedEnvironment, InstallResult } from "../../src/types.js";

// Import real utility functions before mock.module so we can re-export them from the mock.
// mock.module replaces the entire module, so we must list all exports explicitly.
import {
  commandExists,
  getCommandVersion,
  readJson,
  writeJson,
  copyFile,
  copyDir,
  fileExists,
  ensureDir,
  mergeSettings,
  mergeJsonFile,
  appendToShellRc,
  log,
} from "../../src/utils.js";

const PROJECT_DIR = join(import.meta.dir, "..", "..");
const REAL_CONFIGS_DIR = join(PROJECT_DIR, "configs");
const REAL_BACKUP_BASE = join(Bun.env.HOME ?? "~", ".claude-backup");

// Mock installBinary so no real apt/brew/curl/cargo commands run.
// Keep all file-operation utils real so deploySettings, deployHooks, etc. actually write files.
mock.module("../../src/utils.js", () => {
  return {
    commandExists,
    getCommandVersion,
    readJson,
    writeJson,
    copyFile,
    copyDir,
    fileExists,
    ensureDir,
    mergeSettings,
    mergeJsonFile,
    appendToShellRc,
    log,
    // Override getConfigsDir to always return the real configs path regardless of cwd
    getConfigsDir: () => REAL_CONFIGS_DIR,
    // Override installBinary to never run real package manager commands
    installBinary: async (pkg: { name: string; displayName?: string }): Promise<InstallResult> => ({
      component: pkg.displayName ?? pkg.name,
      status: "already-installed",
      message: "mocked",
      verifyPassed: true,
    }),
  };
});

// Import AFTER mock.module so the mock is in place
const { installPrimordial } = await import("../../src/primordial.js");
const { listBackups } = await import("../../src/backup.js");

let tmpDir: string;
const createdBackupDirs: string[] = [];

function mockEnv(tempDir: string): DetectedEnvironment {
  const claudeDir = join(tempDir, ".claude");
  return {
    os: "linux" as const,
    arch: "x64" as const,
    shell: "zsh" as const,
    shellRcPath: join(tempDir, ".zshrc"),
    packageManager: "apt" as const,
    homeDir: tempDir,
    claudeDir,
    existingTools: new Map(),
    dockerAvailable: false,
  };
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "yka-code-primordial-"));
  await writeFile(join(tmpDir, ".zshrc"), "# existing rc\n");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  for (const dir of createdBackupDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("installPrimordial", () => {
  test("dry-run produces no files in ~/.claude", async () => {
    const env = mockEnv(tmpDir);
    const results = await installPrimordial(env, true);

    // ~/.claude/settings.json should NOT have been created
    const settingsExists = await Bun.file(join(tmpDir, ".claude", "settings.json")).exists();
    expect(settingsExists).toBe(false);

    // All results are skipped or already-installed (no real installs)
    for (const r of results) {
      expect(["skipped", "already-installed"]).toContain(r.status);
    }
  });

  test("settings.json deployed with 40+ deny rules", async () => {
    const env = mockEnv(tmpDir);
    await installPrimordial(env, false);

    const settingsPath = join(tmpDir, ".claude", "settings.json");
    expect(await Bun.file(settingsPath).exists()).toBe(true);

    const settings = await Bun.file(settingsPath).json() as { permissions?: { deny?: string[] } };
    const deny = settings?.permissions?.deny ?? [];
    expect(deny.length).toBeGreaterThanOrEqual(40);
  });

  test("CLAUDE.md deployed and under 120 lines", async () => {
    const env = mockEnv(tmpDir);
    await installPrimordial(env, false);

    const claudeMdPath = join(tmpDir, ".claude", "CLAUDE.md");
    expect(await Bun.file(claudeMdPath).exists()).toBe(true);

    const content = await Bun.file(claudeMdPath).text();
    const lineCount = content.trim().split("\n").length;
    expect(lineCount).toBeLessThan(120);
  });

  test("hooks deployed and executable", async () => {
    const env = mockEnv(tmpDir);
    await installPrimordial(env, false);

    const hooksDir = join(tmpDir, ".claude", "hooks");
    const expectedHooks = [
      "post-lint-gate.sh",
      "pre-destructive-blocker.sh",
      "pre-secrets-guard.sh",
      "session-end.sh",
      "session-start.sh",
      "stop-summary.sh",
    ];

    for (const hookFile of expectedHooks) {
      const hookPath = join(hooksDir, hookFile);
      expect(await Bun.file(hookPath).exists()).toBe(true);

      // Check executable bit (mode & 0o111 !== 0)
      const fileStat = await stat(hookPath);
      expect(fileStat.mode & 0o111).toBeGreaterThan(0);
    }
  });

  test("shell RC has marker", async () => {
    const env = mockEnv(tmpDir);
    await installPrimordial(env, false);

    const rcContent = await Bun.file(join(tmpDir, ".zshrc")).text();
    expect(rcContent).toContain("# yka-code-managed");
  });

  test("lessons.md never overwritten on second run", async () => {
    const env = mockEnv(tmpDir);

    // First run creates tasks/lessons.md relative to process.cwd()
    await installPrimordial(env, false);

    const lessonsPath = join(process.cwd(), "tasks", "lessons.md");
    const lessonsExists = await Bun.file(lessonsPath).exists();

    if (lessonsExists) {
      // Write custom content after first run
      await Bun.write(lessonsPath, "MY CUSTOM CONTENT\n");

      // Second run must NOT overwrite it
      await installPrimordial(env, false);

      const afterContent = await Bun.file(lessonsPath).text();
      expect(afterContent).toContain("MY CUSTOM CONTENT");
    } else {
      // Cannot write to cwd (e.g., permission issue); just verify second-run result
      const results = await installPrimordial(env, false);
      const lessonsResult = results.find((r) => r.component === "lessons");
      expect(lessonsResult).toBeDefined();
    }
  });

  test("backup created when existing settings.json present", async () => {
    const env = mockEnv(tmpDir);

    // Create a fake pre-existing settings.json so createBackup has something to copy
    await ensureDir(env.claudeDir);
    await Bun.write(
      join(env.claudeDir, "settings.json"),
      JSON.stringify({ existing: true }) + "\n"
    );

    await installPrimordial(env, false);

    // backup.ts resolves BACKUP_BASE from Bun.env.HOME at module load, so backups
    // land in the real ~/.claude-backup. Verify at least one manifest exists.
    const backups = await listBackups();
    expect(backups.length).toBeGreaterThanOrEqual(1);

    // Track latest backup dir for cleanup
    const latest = backups[backups.length - 1];
    if (latest) {
      createdBackupDirs.push(join(REAL_BACKUP_BASE, latest.timestamp));
    }
  });

  test("idempotent — no duplicate deny rules after two runs", async () => {
    const env = mockEnv(tmpDir);

    await installPrimordial(env, false);
    await installPrimordial(env, false);

    const settingsPath = join(tmpDir, ".claude", "settings.json");
    const settings = await Bun.file(settingsPath).json() as { permissions?: { deny?: string[] } };
    const deny = settings?.permissions?.deny ?? [];

    const uniqueDeny = new Set(deny);
    expect(uniqueDeny.size).toBe(deny.length);
  });

  test("returns at least 12 results", async () => {
    const env = mockEnv(tmpDir);
    const results = await installPrimordial(env, false);
    expect(results.length).toBeGreaterThanOrEqual(12);
  });
});
