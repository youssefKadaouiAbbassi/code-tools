import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ccPluginsCategory, install } from "../../src/components/cc-plugins.js";
import { CORE_PLUGINS } from "../../src/packages.js";
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

describe("ccPluginsCategory shape", () => {
  test("id, name, tier, defaultEnabled", () => {
    expect(ccPluginsCategory.id).toBe("cc-plugins");
    expect(ccPluginsCategory.tier).toBe("recommended");
    expect(ccPluginsCategory.defaultEnabled).toBe(true);
  });

  test("CORE_PLUGINS includes the 10 Anthropic-maintained plugin names", () => {
    expect(CORE_PLUGINS.length).toBe(10);
    expect(CORE_PLUGINS).toContain("feature-dev");
    expect(CORE_PLUGINS).toContain("code-review");
    expect(CORE_PLUGINS).toContain("pr-review-toolkit");
    expect(CORE_PLUGINS).toContain("skill-creator");
  });

  test("each synthesized component carries id >= 200 and cc-plugins category", () => {
    for (const c of ccPluginsCategory.components) {
      expect(c.id).toBeGreaterThanOrEqual(200);
      expect(c.category).toBe("cc-plugins");
      expect(c.verifyCommand).toBe("claude plugin list");
    }
  });
});

describe("ccPlugins install() dry-run", () => {
  test("returns one result per plugin (either [dry-run] or claude-not-found)", async () => {
    const results = await install(env(), true);
    expect(results.length).toBeGreaterThanOrEqual(CORE_PLUGINS.length);
    for (const r of results) {
      expect(r.status).toBe("skipped");
      expect(
        r.message.includes("[dry-run]") || r.message.includes("Claude Code CLI not found"),
      ).toBe(true);
    }
  });

  test("every CORE_PLUGIN is represented in the result set", async () => {
    const results = await install(env(), true);
    const names = new Set(results.map((r) => r.component));
    for (const plugin of CORE_PLUGINS) {
      expect(names.has(plugin)).toBe(true);
    }
  });
});
