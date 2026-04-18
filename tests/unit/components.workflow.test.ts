import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { workflowCategory, install } from "../../src/components/workflow.js";
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

describe("workflowCategory shape", () => {
  test("id, name, tier, defaultEnabled=false (optional)", () => {
    expect(workflowCategory.id).toBe("workflow");
    expect(workflowCategory.tier).toBe("optional");
    expect(workflowCategory.defaultEnabled).toBe(false);
  });

  test("contains composio (35) with http mcpConfig", () => {
    expect(workflowCategory.components.length).toBe(1);
    const composio = workflowCategory.components[0];
    expect(composio.id).toBe(35);
    expect(composio.name).toBe("composio");
    expect(composio.mcpConfig?.type).toBe("http");
    expect(composio.mcpConfig?.headers?.["x-api-key"]).toBe("${COMPOSIO_API_KEY}");
  });
});

describe("workflow install() dry-run", () => {
  test("returns a single Composio result with [dry-run] marker", async () => {
    const results = await install(env(), true);
    expect(results.length).toBe(1);
    const r = results[0];
    expect(r.component).toBe("Composio");
    expect(r.status).toBe("skipped");
    expect(r.message).toContain("[dry-run]");
    expect(r.verifyPassed).toBe(false);
  });

  test("dry-run log mentions Composio MCP registration", async () => {
    await install(env(), true);
    expect(logs.some((l) => l.includes("Composio"))).toBe(true);
  });
});
