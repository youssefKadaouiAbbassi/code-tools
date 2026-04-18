import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, chmod, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GUARD_SRC = join(import.meta.dir, "../../configs/home-claude/hooks/_hook-guard.sh");

type HarnessResult = { exitCode: number; bodyRan: boolean; stdout: string; stderr: string };

async function runHarness(opts: {
  hookName: string;
  bypassEnv?: string;
  disableFile?: string[];
  fakeHome: string;
}): Promise<HarnessResult> {
  const script = join(opts.fakeHome, "probe.sh");
  await writeFile(
    script,
    [
      "#!/usr/bin/env bash",
      `source ${JSON.stringify(GUARD_SRC)} ${JSON.stringify(opts.hookName)}`,
      "printf 'BODY_RAN'",
      "",
    ].join("\n"),
  );
  await chmod(script, 0o755);

  const env = { ...process.env, HOME: opts.fakeHome, YKA_HOOKS_BYPASS: opts.bypassEnv ?? "" };
  if (opts.disableFile !== undefined) {
    const stateDir = join(opts.fakeHome, ".claude");
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, "yka-hooks-disabled"), opts.disableFile.join("\n") + "\n");
  }

  const proc = Bun.spawn(["bash", script], { env, stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, bodyRan: stdout.includes("BODY_RAN"), stdout, stderr };
}

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "yka-hook-guard-"));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe("_hook-guard.sh — env bypass", () => {
  test("no env var set, no state file → body runs", async () => {
    const r = await runHarness({ hookName: "session-start", fakeHome: sandbox });
    expect(r.exitCode).toBe(0);
    expect(r.bodyRan).toBe(true);
  });

  test("YKA_HOOKS_BYPASS=all short-circuits every hook", async () => {
    const r = await runHarness({
      hookName: "session-start",
      bypassEnv: "all",
      fakeHome: sandbox,
    });
    expect(r.exitCode).toBe(0);
    expect(r.bodyRan).toBe(false);
  });

  test("YKA_HOOKS_BYPASS=<name> matches exact hook", async () => {
    const r = await runHarness({
      hookName: "pre-pr-gate",
      bypassEnv: "pre-pr-gate",
      fakeHome: sandbox,
    });
    expect(r.exitCode).toBe(0);
    expect(r.bodyRan).toBe(false);
  });

  test("YKA_HOOKS_BYPASS=<other> does NOT match a different hook", async () => {
    const r = await runHarness({
      hookName: "session-start",
      bypassEnv: "pre-pr-gate",
      fakeHome: sandbox,
    });
    expect(r.exitCode).toBe(0);
    expect(r.bodyRan).toBe(true);
  });

  test("comma-separated list matches any listed name", async () => {
    const r = await runHarness({
      hookName: "stop-summary",
      bypassEnv: "pre-pr-gate,stop-summary,other",
      fakeHome: sandbox,
    });
    expect(r.exitCode).toBe(0);
    expect(r.bodyRan).toBe(false);
  });
});

describe("_hook-guard.sh — state file bypass", () => {
  test("state file contains `all` → every hook skipped", async () => {
    const r = await runHarness({
      hookName: "session-start",
      disableFile: ["all"],
      fakeHome: sandbox,
    });
    expect(r.exitCode).toBe(0);
    expect(r.bodyRan).toBe(false);
  });

  test("state file lists the exact hook name → that hook skipped", async () => {
    const r = await runHarness({
      hookName: "pre-pr-gate",
      disableFile: ["pre-pr-gate"],
      fakeHome: sandbox,
    });
    expect(r.exitCode).toBe(0);
    expect(r.bodyRan).toBe(false);
  });

  test("state file with blank/comment lines does not crash; body runs", async () => {
    const r = await runHarness({
      hookName: "session-start",
      disableFile: ["# a comment", "", "   ", "other-hook"],
      fakeHome: sandbox,
    });
    expect(r.exitCode).toBe(0);
    expect(r.bodyRan).toBe(true);
  });
});

describe("_hook-guard.sh — defensive edge cases", () => {
  test("no hook name passed → guard returns silently, body runs", async () => {
    const script = join(sandbox, "no-name.sh");
    await writeFile(
      script,
      [
        "#!/usr/bin/env bash",
        `source ${JSON.stringify(GUARD_SRC)}`,
        "printf 'BODY_RAN'",
        "",
      ].join("\n"),
    );
    await chmod(script, 0o755);
    const proc = Bun.spawn(["bash", script], {
      env: { ...process.env, HOME: sandbox },
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    expect(stdout).toContain("BODY_RAN");
  });

  test("unknown hook name doesn't crash — body runs", async () => {
    const r = await runHarness({
      hookName: "some-made-up-hook-name",
      fakeHome: sandbox,
    });
    expect(r.exitCode).toBe(0);
    expect(r.bodyRan).toBe(true);
  });
});
