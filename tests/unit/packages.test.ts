import { describe, test, expect } from "bun:test";
import {
  CORE_PLUGINS,
  DEV_CLI_PACKAGES,
  LAZYGIT_CURL,
  SOPS_CURL,
  GITLEAKS_CURL,
} from "../../src/packages.js";
import type { DetectedEnvironment } from "../../src/types.js";

function env(over: Partial<DetectedEnvironment> = {}): DetectedEnvironment {
  return {
    os: "linux", arch: "x64", shell: "bash", shellRcPath: "/tmp/.bashrc",
    packageManager: "apt", homeDir: "/tmp/home", claudeDir: "/tmp/home/.claude",
    existingTools: new Map(), dockerAvailable: false, ...over,
  };
}

describe("CORE_PLUGINS", () => {
  test("has 10 Anthropic-maintained plugin names", () => {
    expect(CORE_PLUGINS.length).toBe(10);
    expect(CORE_PLUGINS).toContain("feature-dev");
    expect(CORE_PLUGINS).toContain("code-review");
    expect(CORE_PLUGINS).toContain("pr-review-toolkit");
    expect(CORE_PLUGINS).toContain("commit-commands");
    expect(CORE_PLUGINS).toContain("claude-code-setup");
    expect(CORE_PLUGINS).toContain("claude-md-management");
    expect(CORE_PLUGINS).toContain("frontend-design");
    expect(CORE_PLUGINS).toContain("skill-creator");
    expect(CORE_PLUGINS).toContain("session-report");
    expect(CORE_PLUGINS).toContain("plugin-dev");
  });

  test("entries are unique non-empty strings", () => {
    const seen = new Set<string>();
    for (const name of CORE_PLUGINS) {
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
      expect(seen.has(name)).toBe(false);
      seen.add(name);
    }
  });
});

describe("DEV_CLI_PACKAGES", () => {
  test("is non-empty and every entry has name + displayName", () => {
    expect(DEV_CLI_PACKAGES.length).toBeGreaterThan(0);
    for (const pkg of DEV_CLI_PACKAGES) {
      expect(typeof pkg.name).toBe("string");
      expect(pkg.name.length).toBeGreaterThan(0);
      expect(typeof pkg.displayName).toBe("string");
      expect(pkg.displayName.length).toBeGreaterThan(0);
    }
  });

  test("every entry has at least one install method", () => {
    for (const pkg of DEV_CLI_PACKAGES) {
      const methods = [pkg.brew, pkg.apt, pkg.pacman, pkg.dnf, pkg.npm, pkg.cargo, pkg.pip, pkg.curl, pkg.manual];
      const defined = methods.filter((m) => typeof m === "string" && m.length > 0);
      expect(defined.length).toBeGreaterThan(0);
    }
  });

  test("includes the 2026 baseline CLIs", () => {
    const names = DEV_CLI_PACKAGES.map((p) => p.name);
    expect(names).toContain("rg");
    expect(names).toContain("fd");
    expect(names).toContain("fzf");
    expect(names).toContain("bat");
    expect(names).toContain("uv");
    expect(names).toContain("bun");
    expect(names).toContain("lazygit");
    expect(names).toContain("sops");
    expect(names).toContain("gitleaks");
  });

  test("lazygit/sops/gitleaks curl scripts match the named exports", () => {
    const lazygit = DEV_CLI_PACKAGES.find((p) => p.name === "lazygit");
    const sops = DEV_CLI_PACKAGES.find((p) => p.name === "sops");
    const gitleaks = DEV_CLI_PACKAGES.find((p) => p.name === "gitleaks");
    expect(lazygit?.curl).toBe(LAZYGIT_CURL);
    expect(sops?.curl).toBe(SOPS_CURL);
    expect(gitleaks?.curl).toBe(GITLEAKS_CURL);
  });
});

describe("curl install scripts", () => {
  test("LAZYGIT_CURL references the lazygit release asset", () => {
    expect(LAZYGIT_CURL.length).toBeGreaterThan(0);
    expect(LAZYGIT_CURL).toContain("jesseduffield/lazygit");
    expect(LAZYGIT_CURL).toContain("$HOME/.local/bin/lazygit");
  });

  test("SOPS_CURL references the getsops release asset", () => {
    expect(SOPS_CURL.length).toBeGreaterThan(0);
    expect(SOPS_CURL).toContain("getsops/sops");
    expect(SOPS_CURL).toContain("$HOME/.local/bin/sops");
  });

  test("GITLEAKS_CURL references the gitleaks release asset", () => {
    expect(GITLEAKS_CURL.length).toBeGreaterThan(0);
    expect(GITLEAKS_CURL).toContain("gitleaks/gitleaks");
    expect(GITLEAKS_CURL).toContain("$HOME/.local/bin/gitleaks");
  });
});

