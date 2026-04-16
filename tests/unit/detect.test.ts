import { describe, test, expect } from "bun:test";
import {
  detectOS,
  detectShell,
  detectPackageManager,
  detectDocker,
  detectExistingTools,
  detectEnvironment,
} from "../../src/detect.js";

describe("detectOS", () => {
  test("returns 'macos' or 'linux' matching process.platform", () => {
    const { os, arch } = detectOS();

    const expected = process.platform === "darwin" ? "macos" : "linux";
    expect(os).toBe(expected);

    expect(["arm64", "x64"]).toContain(arch);
  });
});

describe("detectShell", () => {
  test("returns a valid Shell type based on SHELL env var", () => {
    const { shell, rcPath } = detectShell();

    expect(["zsh", "bash", "fish"]).toContain(shell);
    expect(typeof rcPath).toBe("string");
    expect(rcPath.length).toBeGreaterThan(0);
  });
});

describe("detectPackageManager", () => {
  test("detects at least one package manager on the current system", async () => {
    const pm = await detectPackageManager();
    expect(["brew", "apt", "pacman", "dnf"]).toContain(pm);
  });
});

describe("detectDocker", () => {
  test("returns boolean without throwing", async () => {
    const result = await detectDocker();
    expect(typeof result).toBe("boolean");
  });
});

describe("detectExistingTools", () => {
  test("detects ls and git but not a fake binary", async () => {
    const tools = await detectExistingTools(["ls", "git", "nonexistent-xyz"]);

    expect(tools.has("ls")).toBe(true);
    expect(tools.has("git")).toBe(true);
    expect(tools.has("nonexistent-xyz")).toBe(false);
  });

  test("returns empty map for empty input", async () => {
    const tools = await detectExistingTools([]);
    expect(tools.size).toBe(0);
  });
});

describe("detectEnvironment", () => {
  test("returns object with all required fields", async () => {
    const env = await detectEnvironment();

    expect(env).toHaveProperty("os");
    expect(env).toHaveProperty("shell");
    expect(env).toHaveProperty("packageManager");
    expect(env).toHaveProperty("homeDir");
    expect(env).toHaveProperty("claudeDir");

    expect(["macos", "linux"]).toContain(env.os);
    expect(["zsh", "bash", "fish"]).toContain(env.shell);
    expect(["brew", "apt", "pacman", "dnf"]).toContain(env.packageManager);
    expect(typeof env.homeDir).toBe("string");
    expect(env.claudeDir).toBe(`${env.homeDir}/.claude`);
    expect(env.existingTools).toBeInstanceOf(Map);
    expect(typeof env.dockerAvailable).toBe("boolean");
  });
});
