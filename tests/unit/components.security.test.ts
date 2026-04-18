import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { securityCategory, install } from "../../src/components/security.js";
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

describe("securityCategory shape", () => {
  test("id, name, tier, defaultEnabled", () => {
    expect(securityCategory.id).toBe("security");
    expect(securityCategory.tier).toBe("recommended");
    expect(securityCategory.defaultEnabled).toBe(true);
  });

  test("contains snyk (5) and cu (15)", () => {
    expect(securityCategory.components.map((c) => c.id)).toEqual([5, 15]);
    expect(securityCategory.components.map((c) => c.name)).toEqual(["snyk", "cu"]);
  });
});

describe("security install() dry-run", () => {
  test("returns Snyk MCP + container-use with [dry-run] markers", async () => {
    const results = await install(env(), true);
    const names = results.map((r) => r.component);
    expect(names).toEqual(["Snyk MCP", "container-use"]);
    for (const r of results) {
      expect(r.status).toBe("skipped");
      expect(r.message).toContain("[dry-run]");
    }
  });

  test("dry-run Snyk log includes npm + mcp configure", async () => {
    await install(env(), true);
    expect(logs.some((l) => l.includes("npm install -g snyk@latest"))).toBe(true);
    expect(logs.some((l) => l.includes("snyk mcp configure --tool=claude-cli"))).toBe(true);
  });

  test("dry-run container-use uses brew on brew, dagger curl otherwise", async () => {
    logs = [];
    await install(env({ packageManager: "brew" }), true);
    expect(logs.some((l) => l.includes("dagger/tap/container-use"))).toBe(true);

    logs = [];
    await install(env({ packageManager: "apt" }), true);
    expect(logs.some((l) => l.includes("dl.dagger.io/container-use/install.sh"))).toBe(true);
  });
});
