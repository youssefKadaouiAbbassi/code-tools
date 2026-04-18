import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { browserWebCategory, install } from "../../src/components/browser-web.js";
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

describe("browserWebCategory shape", () => {
  test("id, name, tier, defaultEnabled", () => {
    expect(browserWebCategory.id).toBe("browser-web");
    expect(browserWebCategory.tier).toBe("recommended");
    expect(browserWebCategory.defaultEnabled).toBe(true);
  });

  test("contains playwright, crawl4ai, docfork, deepwiki (ids 8–11)", () => {
    const ids = browserWebCategory.components.map((c) => c.id);
    expect(ids).toEqual([8, 9, 10, 11]);
    expect(browserWebCategory.components.map((c) => c.name)).toEqual([
      "playwright", "crawl4ai", "docfork", "deepwiki",
    ]);
  });

  test("docfork has stdio MCP, deepwiki has http MCP", () => {
    expect(browserWebCategory.components[2].mcpConfig?.type).toBe("stdio");
    expect(browserWebCategory.components[3].mcpConfig?.type).toBe("http");
    expect(browserWebCategory.components[3].mcpConfig?.url).toBe("https://mcp.deepwiki.com/mcp");
  });

  test("crawl4ai carries warningNote", () => {
    expect(browserWebCategory.components[1].warningNote).toContain("0.8.6");
  });
});

describe("browserWeb install() dry-run", () => {
  test("returns 4 results with [dry-run] markers", async () => {
    const prev = process.env.DOCFORK_API_KEY;
    delete process.env.DOCFORK_API_KEY;
    try {
      const results = await install(env(), true);
      const names = results.map((r) => r.component);
      expect(names).toEqual(["Playwright CLI", "Crawl4AI", "Docfork", "DeepWiki"]);
      for (const r of results) {
        expect(r.status).toBe("skipped");
        expect(r.message).toContain("[dry-run]");
      }
    } finally {
      if (prev !== undefined) process.env.DOCFORK_API_KEY = prev;
    }
  });

  test("dry-run logs contain playwright + crawl4ai install hints", async () => {
    await install(env(), true);
    expect(logs.some((l) => l.includes("npm install -g playwright@latest"))).toBe(true);
    expect(logs.some((l) => l.toLowerCase().includes("crawl4ai"))).toBe(true);
  });

  test("dry-run mentions both MCP registrations", async () => {
    await install(env(), true);
    expect(logs.some((l) => l.includes("Docfork"))).toBe(true);
    expect(logs.some((l) => l.includes("DeepWiki"))).toBe(true);
  });
});
