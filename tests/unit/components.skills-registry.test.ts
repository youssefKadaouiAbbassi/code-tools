import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { skillsRegistryCategory, install } from "../../src/components/skills-registry.js";
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

describe("skillsRegistryCategory shape", () => {
  test("id, name, tier, defaultEnabled", () => {
    expect(skillsRegistryCategory.id).toBe("skills-registry");
    expect(skillsRegistryCategory.tier).toBe("recommended");
    expect(skillsRegistryCategory.defaultEnabled).toBe(true);
  });

  test("exposes single bundle component with id 50", () => {
    expect(skillsRegistryCategory.components.length).toBe(1);
    expect(skillsRegistryCategory.components[0].id).toBe(50);
    expect(skillsRegistryCategory.components[0].name).toBe("skills.sh-bundle");
    expect(skillsRegistryCategory.components[0].verifyCommand).toContain("find-skills");
  });
});

describe("skillsRegistry install() dry-run", () => {
  test("with npx present, emits 4 per-package skipped results with [dry-run] markers", async () => {
    if (Bun.which("npx") === null) return;
    const results = await install(env(), true);
    expect(results.length).toBe(4);
    for (const r of results) {
      expect(r.component.startsWith("skills.sh:")).toBe(true);
      expect(r.status).toBe("skipped");
      expect(r.message).toContain("[dry-run]");
    }
  });

  test("dry-run logs mention the skills.sh source packages", async () => {
    if (Bun.which("npx") === null) return;
    await install(env(), true);
    expect(logs.some((l) => l.includes("vercel-labs/skills"))).toBe(true);
    expect(logs.some((l) => l.includes("juliusbrussee/caveman"))).toBe(true);
    expect(logs.some((l) => l.includes("forrestchang/andrej-karpathy-skills"))).toBe(true);
    expect(logs.some((l) => l.includes("microsoft/playwright-cli"))).toBe(true);
  });
});
