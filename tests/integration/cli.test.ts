import { describe, test, expect } from "bun:test";
import { $ } from "bun";

const SETUP_BIN = new URL("../../bin/setup.ts", import.meta.url).pathname;

describe("CLI integration", () => {
  test("--help shows usage", async () => {
    const result = await $`bun run ${SETUP_BIN} --help`.text();
    expect(result).toContain("code-tools-setup");
    expect(result).toContain("--non-interactive");
    expect(result).toContain("--dry-run");
    expect(result).toContain("setup");
    expect(result).toContain("status");
    expect(result).toContain("restore");
  });

  test("--non-interactive --dry-run runs without prompts", async () => {
    const result =
      await $`bun run ${SETUP_BIN} --non-interactive --dry-run`.text();
    expect(result).toContain("[dry-run]");
  });

  test("--tier primordial --dry-run installs only core", async () => {
    const result =
      await $`bun run ${SETUP_BIN} --tier primordial --dry-run`.text();
    expect(result).toContain("primordial");
  });

  test("status subcommand runs", async () => {
    const proc = Bun.spawn(["bun", "run", SETUP_BIN, "status"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });

  test("restore subcommand runs", async () => {
    const proc = Bun.spawn(["bun", "run", SETUP_BIN, "restore"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    // May exit 0 or with message about no backups — just shouldn't crash
    expect([0, 1]).toContain(exitCode);
  });
});
