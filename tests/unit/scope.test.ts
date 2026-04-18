import { describe, test, expect } from "bun:test";
import {
  resolveClaudeDir,
  rewriteEnvForScope,
  isLocalScope,
  templateDir,
} from "../../src/scope.js";
import type { DetectedEnvironment } from "../../src/types.js";

function env(overrides: Partial<DetectedEnvironment> = {}): DetectedEnvironment {
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

describe("resolveClaudeDir", () => {
  test("--local resolves to $PWD/.claude", () => {
    expect(resolveClaudeDir({ local: true }, "/work/p", "/home/u")).toBe("/work/p/.claude");
  });

  test("default (no local arg) resolves to $HOME/.claude", () => {
    expect(resolveClaudeDir({}, "/work/p", "/home/u")).toBe("/home/u/.claude");
  });

  test("local: false resolves to $HOME/.claude", () => {
    expect(resolveClaudeDir({ local: false }, "/work/p", "/home/u")).toBe("/home/u/.claude");
  });

  test("home with trailing slash still produces a single-slash join", () => {
    expect(resolveClaudeDir({}, "/work/p", "/home/u/")).toBe("/home/u/.claude");
  });

  test("cwd with trailing slash still produces a single-slash join", () => {
    expect(resolveClaudeDir({ local: true }, "/work/p/", "/home/u")).toBe("/work/p/.claude");
  });
});

describe("rewriteEnvForScope", () => {
  test("returns a new env with claudeDir overridden", () => {
    const original = env();
    const rewritten = rewriteEnvForScope(original, "/custom/.claude");
    expect(rewritten.claudeDir).toBe("/custom/.claude");
  });

  test("does not mutate the input env", () => {
    const original = env();
    const snapshot = { ...original };
    rewriteEnvForScope(original, "/custom/.claude");
    expect(original).toEqual(snapshot);
  });

  test("does not return the same object reference", () => {
    const original = env();
    const rewritten = rewriteEnvForScope(original, "/custom/.claude");
    expect(rewritten).not.toBe(original);
  });

  test("preserves shellRcPath, homeDir, and other fields", () => {
    const original = env();
    const rewritten = rewriteEnvForScope(original, "/custom/.claude");
    expect(rewritten.shellRcPath).toBe(original.shellRcPath);
    expect(rewritten.homeDir).toBe(original.homeDir);
    expect(rewritten.os).toBe(original.os);
    expect(rewritten.shell).toBe(original.shell);
    expect(rewritten.packageManager).toBe(original.packageManager);
  });
});

describe("isLocalScope", () => {
  test("false when claudeDir is $HOME/.claude", () => {
    expect(isLocalScope(env())).toBe(false);
  });

  test("true when claudeDir is $PWD/.claude outside home", () => {
    expect(isLocalScope(env({ claudeDir: "/work/project/.claude" }))).toBe(true);
  });

  test("true when claudeDir is a sibling of homeDir", () => {
    expect(
      isLocalScope(env({ homeDir: "/home/user", claudeDir: "/home/user-project/.claude" })),
    ).toBe(true);
  });

  test("false for nested project under home", () => {
    expect(
      isLocalScope(env({ claudeDir: "/home/user/projects/demo/.claude" })),
    ).toBe(false);
  });

  test("trailing slash on homeDir does not flip the verdict", () => {
    expect(
      isLocalScope(env({ homeDir: "/home/user/", claudeDir: "/home/user/.claude" })),
    ).toBe(false);
  });
});

describe("templateDir", () => {
  test("returns home-claude for global scope", () => {
    expect(templateDir(env())).toBe("home-claude");
  });

  test("returns project-claude for local scope", () => {
    expect(templateDir(env({ claudeDir: "/work/project/.claude" }))).toBe("project-claude");
  });
});
