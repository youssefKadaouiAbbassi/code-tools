import { describe, test, expect } from "bun:test";
import { trailofbitsCategory, install } from "../../src/components/trailofbits.js";
import type { DetectedEnvironment } from "../../src/types.js";

function env(over: Partial<DetectedEnvironment> = {}): DetectedEnvironment {
  return {
    os: "linux", arch: "x64", shell: "bash", shellRcPath: "/tmp/.bashrc",
    packageManager: "apt", homeDir: "/tmp/home", claudeDir: "/tmp/home/.claude",
    existingTools: new Map(), dockerAvailable: false, ...over,
  };
}

describe("trailofbitsCategory shape", () => {
  test("id, tier=optional, defaultEnabled=false", () => {
    expect(trailofbitsCategory.id).toBe("trailofbits");
    expect(trailofbitsCategory.tier).toBe("optional");
    expect(trailofbitsCategory.defaultEnabled).toBe(false);
  });

  test("contains 7 curated plugins with ids 300–306", () => {
    expect(trailofbitsCategory.components.length).toBe(7);
    const ids = trailofbitsCategory.components.map((c) => c.id);
    expect(ids).toEqual([300, 301, 302, 303, 304, 305, 306]);

    const names = trailofbitsCategory.components.map((c) => c.name);
    expect(names).toContain("planning-with-files");
    expect(names).toContain("openai-security-threat-model");
    expect(names).toContain("openai-pdf");
  });

  test("each component verifies via claude plugin list", () => {
    for (const c of trailofbitsCategory.components) {
      expect(c.verifyCommand).toBe("claude plugin list");
      expect(c.category).toBe("trailofbits");
    }
  });
});

describe("trailofbits install() dry-run", () => {
  test("returns one result per curated plugin, all skipped", async () => {
    const results = await install(env(), true);
    expect(results.length).toBe(trailofbitsCategory.components.length);
    for (const r of results) {
      expect(r.status).toBe("skipped");
      expect(
        r.message.includes("[dry-run]") || r.message.includes("Claude Code CLI not found"),
      ).toBe(true);
      expect(r.verifyPassed).toBe(false);
    }
  });

  test("every curated plugin name is represented", async () => {
    const results = await install(env(), true);
    const expected = trailofbitsCategory.components.map((c) => c.name);
    const returned = new Set(results.map((r) => r.component));
    for (const name of expected) {
      expect(returned.has(name)).toBe(true);
    }
  });
});
