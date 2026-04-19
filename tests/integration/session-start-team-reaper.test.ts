import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

const HOOK = join(
  import.meta.dir,
  "../../configs/home-claude/hooks/session-start-team-reaper.sh",
);

const jqAvailable = Bun.which("jq") !== null;

async function runReaper(fakeHome: string) {
  const proc = Bun.spawn(["bash", HOOK], {
    env: { ...process.env, HOME: fakeHome },
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}

async function seedTeam(
  home: string,
  name: string,
  opts: { paneIds: string[]; ageSeconds: number; corrupt?: boolean },
) {
  const teamDir = join(home, ".claude/teams", name);
  const taskDir = join(home, ".claude/tasks", name);
  await mkdir(teamDir, { recursive: true });
  await mkdir(taskDir, { recursive: true });
  await writeFile(join(taskDir, "task-1.json"), "{}");

  if (opts.corrupt) {
    await writeFile(join(teamDir, "config.json"), "not-json");
  } else {
    const config = {
      name,
      members: [
        { name: "team-lead", tmuxPaneId: "" },
        ...opts.paneIds.map((id, i) => ({ name: `worker-${i}`, tmuxPaneId: id })),
      ],
    };
    await writeFile(join(teamDir, "config.json"), JSON.stringify(config));
  }

  const when = (Date.now() - opts.ageSeconds * 1000) / 1000;
  await utimes(teamDir, when, when);
}

describe.skipIf(!jqAvailable)("session-start-team-reaper.sh", () => {
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), "reaper-"));
  });

  afterEach(async () => {
    await rm(fakeHome, { recursive: true, force: true });
  });

  test("reaps old team whose worker panes are all dead", async () => {
    await seedTeam(fakeHome, "orphan-old", {
      paneIds: ["%definitely-not-a-real-pane-0", "%definitely-not-a-real-pane-1"],
      ageSeconds: 48 * 3600,
    });

    const result = await runReaper(fakeHome);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(fakeHome, ".claude/teams/orphan-old"))).toBe(false);
    expect(existsSync(join(fakeHome, ".claude/tasks/orphan-old"))).toBe(false);
  });

  test("leaves fresh team alone even with dead panes", async () => {
    await seedTeam(fakeHome, "fresh-team", {
      paneIds: ["%definitely-not-a-real-pane-2"],
      ageSeconds: 60,
    });

    const result = await runReaper(fakeHome);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(fakeHome, ".claude/teams/fresh-team"))).toBe(true);
    expect(existsSync(join(fakeHome, ".claude/tasks/fresh-team"))).toBe(true);
  });

  test("reaps old team with corrupt config", async () => {
    await seedTeam(fakeHome, "corrupt-old", {
      paneIds: [],
      ageSeconds: 48 * 3600,
      corrupt: true,
    });

    const result = await runReaper(fakeHome);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(fakeHome, ".claude/teams/corrupt-old"))).toBe(false);
  });

  test("reaps old team with no worker panes tracked", async () => {
    await seedTeam(fakeHome, "lead-only-old", {
      paneIds: [],
      ageSeconds: 48 * 3600,
    });

    const result = await runReaper(fakeHome);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(fakeHome, ".claude/teams/lead-only-old"))).toBe(false);
  });

  test("no-ops when teams dir does not exist", async () => {
    const result = await runReaper(fakeHome);
    expect(result.exitCode).toBe(0);
  });

  test("honors YKA_HOOKS_BYPASS=all", async () => {
    await seedTeam(fakeHome, "orphan-old", {
      paneIds: ["%fake"],
      ageSeconds: 48 * 3600,
    });

    const proc = Bun.spawn(["bash", HOOK], {
      env: { ...process.env, HOME: fakeHome, YKA_HOOKS_BYPASS: "all" },
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    expect(existsSync(join(fakeHome, ".claude/teams/orphan-old"))).toBe(true);
  });
});
