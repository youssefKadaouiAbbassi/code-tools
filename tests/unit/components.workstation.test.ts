import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { workstationCategory, install } from "../../src/components/workstation.js";
import type { DetectedEnvironment } from "../../src/types.js";

function env(over: Partial<DetectedEnvironment> = {}): DetectedEnvironment {
  return {
    os: "linux", arch: "x64", shell: "bash", shellRcPath: "/tmp/.bashrc",
    packageManager: "apt", homeDir: "/tmp/home", claudeDir: "/tmp/home/.claude",
    existingTools: new Map(), dockerAvailable: false, ...over,
  };
}

let logs: string[] = [];
const origLog = console.log;
beforeEach(() => { logs = []; console.log = (...args: unknown[]) => logs.push(args.map(String).join(" ")); });
afterEach(() => { console.log = origLog; });

describe("workstationCategory shape", () => {
  test("id, name, tier, defaultEnabled", () => {
    expect(workstationCategory.id).toBe("workstation");
    expect(workstationCategory.tier).toBe("recommended");
    expect(workstationCategory.defaultEnabled).toBe(true);
  });

  test("contains ghostty (36), tmux (37), chezmoi (39), age (41)", () => {
    expect(workstationCategory.components.map((c) => c.id)).toEqual([36, 37, 39, 41]);
    expect(workstationCategory.components.map((c) => c.name)).toEqual([
      "ghostty", "tmux", "chezmoi", "age",
    ]);
  });

  test("ghostty, chezmoi, age require userPrompt", () => {
    expect(workstationCategory.components[0].userPrompt).toBe(true);
    expect(workstationCategory.components[2].userPrompt).toBe(true);
    expect(workstationCategory.components[3].userPrompt).toBe(true);
  });
});

describe("workstation install() dry-run", () => {
  test("returns 4 results with the expected component names", async () => {
    const results = await install(env(), true);
    const names = results.map((r) => r.component);
    expect(names).toContain("Ghostty");
    expect(names).toContain("tmux");
    expect(names).toContain("chezmoi");
    expect(names).toContain("age");
    expect(results.length).toBe(4);
  });

  test("honors skippedComponents set", async () => {
    const skipped = new Set([36, 39, 41]);
    const results = await install(env(), true, skipped);
    const ghostty = results.find((r) => r.component === "Ghostty");
    const chezmoi = results.find((r) => r.component === "chezmoi");
    const age = results.find((r) => r.component === "age");
    expect(ghostty?.status).toBe("skipped");
    expect(ghostty?.message).toContain("skipped by user choice");
    expect(chezmoi?.message).toContain("skipped by user choice");
    expect(age?.message).toContain("skipped by user choice");
  });

  test("every result carries the required InstallResult fields", async () => {
    const results = await install(env(), true);
    for (const r of results) {
      expect(typeof r.component).toBe("string");
      expect(["installed", "skipped", "failed", "already-installed"]).toContain(r.status);
      expect(typeof r.message).toBe("string");
      expect(typeof r.verifyPassed).toBe("boolean");
    }
  });
});
