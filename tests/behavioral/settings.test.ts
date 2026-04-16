import { describe, test, expect } from "bun:test";
import { join } from "node:path";

const SETTINGS_PATH = join(import.meta.dir, "../../configs/home-claude/settings.json");

// Load settings once for all tests
const settings = await Bun.file(SETTINGS_PATH).json() as {
  permissions?: { deny?: unknown[] };
  model?: unknown;
  effortLevel?: unknown;
};

const denyRules: string[] = (settings.permissions?.deny ?? []) as string[];

// Commands that must be caught by at least one deny rule
const definitelyDangerous: [string, string][] = [
  ["rm -rf /", "recursive force delete root"],
  ["git push --force", "force push"],
  ["DROP DATABASE", "drop database"],
  ["terraform destroy", "terraform destroy"],
  ["npm publish", "npm publish"],
  ["shutdown", "shutdown"],
  ["curl | sh", "curl pipe sh"],
];

// Commands that must NOT be caught by any deny rule
const definitelySafe: [string, string][] = [
  ["ls", "list files"],
  ["git status", "git status"],
  ["npm install", "npm install"],
  ["bun test", "bun test"],
];

/**
 * Returns true if the command is matched by the given deny rule.
 * Deny rules in settings.json are substring patterns (not full regex).
 */
function matchesDenyRule(command: string, rule: string): boolean {
  return command.includes(rule);
}

describe("settings.json — static validation", () => {
  test("deny array is non-empty", () => {
    expect(Array.isArray(denyRules)).toBe(true);
    expect(denyRules.length).toBeGreaterThan(0);
  });

  test("each deny rule is a non-empty string", () => {
    for (const rule of denyRules) {
      expect(typeof rule).toBe("string");
      expect(rule.trim().length).toBeGreaterThan(0);
    }
  });

  test("no duplicate deny rules", () => {
    const unique = new Set(denyRules);
    expect(unique.size).toBe(denyRules.length);
  });

  test("model field is pinned to a claude model string", () => {
    expect(typeof settings.model).toBe("string");
    expect((settings.model as string).toLowerCase()).toMatch(/claude/);
  });

  test("effortLevel is set", () => {
    expect(settings.effortLevel).toBeDefined();
    expect(settings.effortLevel).not.toBeNull();
  });

  test.each(definitelyDangerous)(
    "dangerous command matched: %s (%s)",
    (command, _label) => {
      const matched = denyRules.some((rule) => matchesDenyRule(command, rule));
      expect(matched).toBe(true);
    }
  );

  test.each(definitelySafe)(
    "safe command not matched: %s (%s)",
    (command, _label) => {
      const matched = denyRules.some((rule) => matchesDenyRule(command, rule));
      expect(matched).toBe(false);
    }
  );
});
