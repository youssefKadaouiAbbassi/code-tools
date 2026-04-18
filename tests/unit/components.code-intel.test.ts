import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { codeIntelCategory, install } from "../../src/components/code-intel.js";
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

describe("codeIntelCategory shape", () => {
  test("has id, name, tier, defaultEnabled", () => {
    expect(codeIntelCategory.id).toBe("code-intel");
    expect(codeIntelCategory.name).toBe("Code Intelligence");
    expect(codeIntelCategory.tier).toBe("recommended");
    expect(codeIntelCategory.defaultEnabled).toBe(true);
  });

  test("contains serena-agent (id 6) and ast-grep (id 7)", () => {
    const ids = codeIntelCategory.components.map((c) => c.id);
    expect(ids).toEqual([6, 7]);
    expect(codeIntelCategory.components[0].name).toBe("serena-agent");
    expect(codeIntelCategory.components[1].name).toBe("ast-grep");
  });

  test("serena has stdio mcpConfig", () => {
    expect(codeIntelCategory.components[0].mcpConfig?.type).toBe("stdio");
    expect(codeIntelCategory.components[0].mcpConfig?.command).toBe("serena");
  });
});

describe("codeIntel install() dry-run", () => {
  test("returns Serena + ast-grep results with [dry-run] messages", async () => {
    const results = await install(env(), true);
    expect(results.length).toBeGreaterThanOrEqual(2);

    const serena = results.find((r) => r.component === "Serena");
    expect(serena?.status).toBe("skipped");
    expect(serena?.message).toContain("[dry-run]");
    expect(serena?.verifyPassed).toBe(false);

    const astGrep = results.find((r) => r.component === "ast-grep");
    expect(astGrep?.status).toBe("skipped");
    expect(astGrep?.message).toContain("[dry-run]");
  });

  test("constructs the Serena install shell command in the dry-run log", async () => {
    await install(env(), true);
    const serenaLog = logs.find((l) => l.includes("uv tool install -p 3.13 serena-agent@latest --prerelease=allow"));
    expect(serenaLog).toBeDefined();
  });

  test("honors packageManager for ast-grep dry-run command (brew vs cargo)", async () => {
    logs = [];
    await install(env({ packageManager: "brew" }), true);
    expect(logs.some((l) => l.includes("brew upgrade ast-grep") || l.includes("brew install ast-grep"))).toBe(true);

    logs = [];
    await install(env({ packageManager: "apt" }), true);
    expect(logs.some((l) => l.includes("cargo install ast-grep"))).toBe(true);
  });
});
