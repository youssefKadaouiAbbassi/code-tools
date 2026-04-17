import { describe, test, expect } from "bun:test";
import { join } from "node:path";

const PROJECT_DIR = join(import.meta.dir, "..", "..");

function runCli(...args: string[]) {
  const result = Bun.spawnSync(["bun", "run", "bin/setup.ts", ...args], {
    cwd: PROJECT_DIR,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: process.env.HOME },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("CLI flows", () => {
  test("--help shows commands and flags", () => {
    const { exitCode, stdout, stderr } = runCli("--help");
    const output = stdout + stderr;

    expect(exitCode).toBe(0);
    expect(output).toContain("--non-interactive");
    expect(output).toContain("--dry-run");
    expect(output).toContain("--tier");
    expect(output).toMatch(/setup|status|restore/);
  });

  test("--non-interactive --dry-run completes with exit code 0", () => {
    const { exitCode, stdout, stderr } = runCli("--non-interactive", "--dry-run");
    const output = stdout + stderr;

    expect(exitCode).toBe(0);
    expect(output).toContain("[dry-run]");
  });

  test("--tier primordial --dry-run exits 0 and mentions primordial actions", () => {
    const { exitCode, stdout, stderr } = runCli("--tier", "primordial", "--dry-run");
    const output = stdout + stderr;

    expect(exitCode).toBe(0);
    // primordial tier logs "Primordial tier complete." or dry-run messages
    expect(output.toLowerCase()).toMatch(/primordial|dry-run|would/i);
  });

  test("--tier all --dry-run exits 0 and mentions category installs", () => {
    const { exitCode, stdout, stderr } = runCli("--tier", "all", "--dry-run");
    const output = stdout + stderr;

    expect(exitCode).toBe(0);
    // runTier with "all" installs ALL_CATEGORIES and logs "Installing category:"
    expect(output).toMatch(/category|install|dry-run/i);
  });

  test("status subcommand exits cleanly", () => {
    const { exitCode } = runCli("status");
    expect(exitCode).toBe(0);
  });

  test("restore subcommand exits cleanly (0 or 1 with no-backups message)", () => {
    const { exitCode, stdout, stderr } = runCli("restore");
    const output = stdout + stderr;

    // Either succeeds (0) or fails gracefully with a "no backups" message
    const isClean =
      exitCode === 0 ||
      (exitCode === 1 && output.toLowerCase().match(/no backup|no backups/));
    expect(isClean).toBeTruthy();
  });

  test("--help contains version 0.1.0", () => {
    const { stdout, stderr } = runCli("--help");
    const output = stdout + stderr;

    expect(output).toContain("0.1.0");
  });
});
