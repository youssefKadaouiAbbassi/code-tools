import { describe, test, expect } from "bun:test";
import { join } from "node:path";

const SETTINGS_PATH = join(import.meta.dir, "../../configs/home-claude/settings.json");
const HOOK_PATH = join(import.meta.dir, "../../configs/hooks/pre-destructive-blocker.sh");

const settings = (await Bun.file(SETTINGS_PATH).json()) as {
  permissions?: { deny?: unknown[] };
  model?: unknown;
  effortLevel?: unknown;
};
const hookSource = await Bun.file(HOOK_PATH).text();

const denyRules: string[] = (settings.permissions?.deny ?? []) as string[];

// Commands blocked at the SETTINGS layer (literal prefix match by Claude Code's /permissions).
// These must appear as-is inside a `Bash(<command>…)` or `Read(<path>…)` deny entry.
const settingsBlocked: [string, string][] = [
  ["Bash(rm -rf /)", "rm -rf /"],
  ["Bash(git push --force", "git push --force"],
  ["Bash(terraform destroy", "terraform destroy"],
  ["Bash(npm publish", "npm publish"],
  ["Bash(shutdown", "shutdown"],
  ["Bash(curl *| sh", "curl pipe to shell"],
  ["Read(.env", ".env read"],
];

// Commands blocked at the HOOK layer (regex patterns settings can't express).
// These must appear in pre-destructive-blocker.sh.
const hookBlocked: [string, string][] = [
  ["DROP[[:space:]]+TABLE", "DROP TABLE"],
  ["DROP[[:space:]]+DATABASE", "DROP DATABASE"],
  ["TRUNCATE", "TRUNCATE TABLE"],
  ["eval", "eval()"],
  ["mkfs", "mkfs"],
  ["chmod[[:space:]]+-R[[:space:]]+777", "chmod -R 777"],
];

// Safe commands must NOT trip any deny prefix.
const settingsSafe: [string, string][] = [
  ["Bash(ls", "list files"],
  ["Bash(git status", "git status"],
  ["Bash(npm install", "npm install"],
  ["Bash(bun test", "bun test"],
];

describe("settings.json — deny layer", () => {
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

  test("model field is NOT pinned (user default is preserved)", () => {
    expect(settings.model).toBeUndefined();
  });

  test("effortLevel is set", () => {
    expect(settings.effortLevel).toBeDefined();
    expect(settings.effortLevel).not.toBeNull();
  });

  test.each(settingsBlocked)(
    "settings.json denies: %s (%s)",
    (prefix, _label) => {
      const matched = denyRules.some((rule) => rule.startsWith(prefix));
      expect(matched).toBe(true);
    }
  );

  test.each(settingsSafe)(
    "settings.json allows: %s (%s)",
    (prefix, _label) => {
      // A safe command prefix must NOT appear at the START of any deny rule
      // (CC's deny is a glob-prefix match, so "Bash(ls …" must never be a rule root).
      const matched = denyRules.some(
        (rule) => rule.startsWith(prefix) && !rule.startsWith(prefix.replace(/Bash\(/, "Bash(sudo "))
      );
      expect(matched).toBe(false);
    }
  );
});

describe("pre-destructive-blocker.sh — hook layer", () => {
  test.each(hookBlocked)(
    "hook catches: %s (%s)",
    (pattern, _label) => {
      expect(hookSource).toContain(pattern);
    }
  );

  test("hook uses current hookSpecificOutput schema (not deprecated {decision})", () => {
    expect(hookSource).toContain("hookSpecificOutput");
    expect(hookSource).toContain("permissionDecision");
    // Deprecated top-level "decision":"block" would fail CC's validator
    expect(hookSource).not.toMatch(/"decision"\s*:\s*"block"/);
  });
});
