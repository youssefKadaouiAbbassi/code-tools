/** Tests for install-mode orchestrator scope resolution. */
import { describe, test, expect } from "bun:test";
import { resolveClaudeDir, rewriteEnvForScope } from "../../src/install-mode.js";
import type { DetectedEnvironment } from "../../src/types.js";

const fakeEnv: DetectedEnvironment = {
  os: "linux",
  arch: "x64",
  shell: "bash",
  shellRcPath: "/home/user/.bashrc",
  packageManager: "apt",
  homeDir: "/home/user",
  claudeDir: "/home/user/.claude",
  existingTools: new Map(),
  dockerAvailable: false,
};

describe("resolveClaudeDir", () => {
  test("--local resolves to $PWD/.claude", () => {
    const dir = resolveClaudeDir({ local: true }, "/work/project", "/home/user");
    expect(dir).toBe("/work/project/.claude");
  });

  test("default resolves to $HOME/.claude", () => {
    const dir = resolveClaudeDir({ local: false }, "/work/project", "/home/user");
    expect(dir).toBe("/home/user/.claude");
  });

  test("no local arg resolves to $HOME/.claude", () => {
    const dir = resolveClaudeDir({}, "/work/project", "/home/user");
    expect(dir).toBe("/home/user/.claude");
  });
});

describe("rewriteEnvForScope", () => {
  test("returns new env with claudeDir overridden", () => {
    const rewritten = rewriteEnvForScope(fakeEnv, "/custom/.claude");
    expect(rewritten.claudeDir).toBe("/custom/.claude");
  });

  test("does not mutate original env", () => {
    const original = { ...fakeEnv };
    rewriteEnvForScope(fakeEnv, "/custom/.claude");
    expect(fakeEnv).toEqual(original);
  });

  test("preserves other env fields", () => {
    const rewritten = rewriteEnvForScope(fakeEnv, "/custom/.claude");
    expect(rewritten.os).toBe(fakeEnv.os);
    expect(rewritten.shell).toBe(fakeEnv.shell);
    expect(rewritten.homeDir).toBe(fakeEnv.homeDir);
  });
});
