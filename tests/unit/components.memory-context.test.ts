import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { memoryContextCategory, install } from "../../src/components/memory-context.js";
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

describe("memoryContextCategory shape", () => {
  test("id, name, tier, defaultEnabled", () => {
    expect(memoryContextCategory.id).toBe("memory-context");
    expect(memoryContextCategory.tier).toBe("recommended");
    expect(memoryContextCategory.defaultEnabled).toBe(true);
  });

  test("contains claude-mem (12), context-mode (13), claude-hud (14)", () => {
    expect(memoryContextCategory.components.map((c) => c.id)).toEqual([12, 13, 14]);
    expect(memoryContextCategory.components.map((c) => c.name)).toEqual([
      "claude-mem", "context-mode", "claude-hud",
    ]);
  });

  test("context-mode has stdio MCP using npx", () => {
    const ctx = memoryContextCategory.components[1];
    expect(ctx.mcpConfig?.type).toBe("stdio");
    expect(ctx.mcpConfig?.command).toBe("npx");
    expect(ctx.mcpConfig?.args).toContain("context-mode");
  });
});

describe("memoryContext install() dry-run", () => {
  test("returns claude-mem, Claude HUD, context-mode with [dry-run] markers", async () => {
    const results = await install(env(), true);
    const names = results.map((r) => r.component).sort();
    expect(names).toEqual(["Claude HUD", "claude-mem", "context-mode"]);
    for (const r of results) {
      expect(r.status).toBe("skipped");
      expect(r.message).toContain("[dry-run]");
      expect(r.verifyPassed).toBe(false);
    }
  });

  test("dry-run logs reference claude-mem install + MCP registration", async () => {
    await install(env(), true);
    expect(logs.some((l) => l.includes("claude-mem@latest install --ide claude-code"))).toBe(true);
    expect(logs.some((l) => l.includes("context-mode"))).toBe(true);
    expect(logs.some((l) => l.includes("claude-hud"))).toBe(true);
  });
});
