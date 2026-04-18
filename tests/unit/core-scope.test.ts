import { describe, test, expect } from "bun:test";
import { isLocalScope, templateDir } from "../../src/scope.js";
import type { DetectedEnvironment } from "../../src/types.js";

function env(overrides: Partial<DetectedEnvironment>): DetectedEnvironment {
  return {
    os: "linux",
    arch: "x64",
    shell: "bash",
    shellRcPath: "/home/user/.bashrc",
    packageManager: "apt",
    homeDir: "/home/user",
    claudeDir: "/home/user/.claude",
    existingTools: new Map(),
    dockerAvailable: false,
    ...overrides,
  };
}

describe("isLocalScope", () => {
  test("false when claudeDir is $HOME/.claude", () => {
    expect(isLocalScope(env({}))).toBe(false);
  });

  test("true when claudeDir is $PWD/.claude outside home", () => {
    expect(isLocalScope(env({ claudeDir: "/work/project/.claude" }))).toBe(true);
  });

  test("true when claudeDir is a sibling of homeDir", () => {
    expect(isLocalScope(env({ homeDir: "/home/user", claudeDir: "/home/user-project/.claude" }))).toBe(true);
  });

  test("false for nested project under home", () => {
    expect(isLocalScope(env({ claudeDir: "/home/user/projects/demo/.claude" }))).toBe(false);
  });

  test("handles trailing slash on homeDir correctly", () => {
    expect(isLocalScope(env({ homeDir: "/home/user/", claudeDir: "/home/user/.claude" }))).toBe(false);
  });
});

describe("templateDir", () => {
  test("returns home-claude for global scope", () => {
    expect(templateDir(env({}))).toBe("home-claude");
  });

  test("returns project-claude for local scope", () => {
    expect(templateDir(env({ claudeDir: "/work/project/.claude" }))).toBe("project-claude");
  });
});
