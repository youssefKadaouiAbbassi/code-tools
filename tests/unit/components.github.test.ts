import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { githubCategory, install } from "../../src/components/github.js";
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

describe("githubCategory shape", () => {
  test("id, name, tier, defaultEnabled", () => {
    expect(githubCategory.id).toBe("github");
    expect(githubCategory.tier).toBe("recommended");
    expect(githubCategory.defaultEnabled).toBe(true);
  });

  test("contains gh, github-mcp, claude-code-action, claude-code-review (ids 16–19)", () => {
    expect(githubCategory.components.map((c) => c.id)).toEqual([16, 17, 18, 19]);
    expect(githubCategory.components.map((c) => c.name)).toEqual([
      "gh", "github-mcp", "claude-code-action", "claude-code-review",
    ]);
  });

  test("github-mcp has http MCP with Bearer auth header", () => {
    const mcp = githubCategory.components[1].mcpConfig;
    expect(mcp?.type).toBe("http");
    expect(mcp?.url).toBe("https://api.githubcopilot.com/mcp/");
    expect(mcp?.headers?.Authorization).toContain("Bearer");
  });
});

describe("github install() dry-run", () => {
  test("returns 4 results covering every component", async () => {
    const prev = process.env.GITHUB_PAT;
    delete process.env.GITHUB_PAT;
    try {
      const results = await install(env({ claudeCodeVersion: "2.1.104" }), true);
      const names = results.map((r) => r.component);
      expect(names).toContain("github-mcp");
      expect(names).toContain("Claude Code Action");
      expect(names).toContain("Claude Code Review");
      expect(results.length).toBeGreaterThanOrEqual(4);
    } finally {
      if (prev !== undefined) process.env.GITHUB_PAT = prev;
    }
  });

  test("github-mcp dry-run is 'skipped' with [dry-run] marker", async () => {
    const prev = process.env.GITHUB_PAT;
    process.env.GITHUB_PAT = "dummy-pat";
    try {
      const results = await install(env({ claudeCodeVersion: "2.1.104" }), true);
      const mcp = results.find((r) => r.component === "github-mcp");
      expect(mcp?.status).toBe("skipped");
      expect(mcp?.message).toContain("[dry-run]");
    } finally {
      if (prev === undefined) delete process.env.GITHUB_PAT; else process.env.GITHUB_PAT = prev;
    }
  });

  test("Claude Code Review gates on CC version >= 2.1.104", async () => {
    let results = await install(env({ claudeCodeVersion: "2.1.104" }), true);
    let ccr = results.find((r) => r.component === "Claude Code Review");
    expect(ccr?.status).toBe("already-installed");
    expect(ccr?.verifyPassed).toBe(true);

    results = await install(env({ claudeCodeVersion: "2.1.103" }), true);
    ccr = results.find((r) => r.component === "Claude Code Review");
    expect(ccr?.status).toBe("skipped");
    expect(ccr?.verifyPassed).toBe(false);
  });
});
