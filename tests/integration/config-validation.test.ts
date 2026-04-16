import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";

const CONFIGS_DIR = join(import.meta.dir, "../../configs");

describe("Config validation", () => {
  test("home settings.json is valid JSON", async () => {
    const data = await Bun.file(
      join(CONFIGS_DIR, "home-claude/settings.json")
    ).json();
    expect(data).toBeTruthy();
  });

  test("home settings.json has 40+ deny rules", async () => {
    const data = (await Bun.file(
      join(CONFIGS_DIR, "home-claude/settings.json")
    ).json()) as { permissions: { deny: string[] } };
    expect(data.permissions.deny.length).toBeGreaterThanOrEqual(40);
  });

  test("home settings.json does NOT pin a model (preserves user default)", async () => {
    const data = (await Bun.file(
      join(CONFIGS_DIR, "home-claude/settings.json")
    ).json()) as { model?: string };
    expect(data.model).toBeUndefined();
  });

  test("project settings.json is valid JSON with fewer deny rules than home", async () => {
    const home = (await Bun.file(
      join(CONFIGS_DIR, "home-claude/settings.json")
    ).json()) as { permissions: { deny: string[] } };
    const project = (await Bun.file(
      join(CONFIGS_DIR, "project-claude/settings.json")
    ).json()) as { permissions: { deny: string[] } };
    expect(project.permissions.deny.length).toBeLessThan(home.permissions.deny.length);
    expect(project.permissions.deny.length).toBeGreaterThan(0);
  });

  test("home CLAUDE.md is under 120 lines", async () => {
    const text = await Bun.file(
      join(CONFIGS_DIR, "home-claude/CLAUDE.md")
    ).text();
    const lineCount = text.trim().split("\n").length;
    expect(lineCount).toBeLessThan(120);
  });

  test("project CLAUDE.md is a thin template (under 50 lines)", async () => {
    const text = await Bun.file(
      join(CONFIGS_DIR, "project-claude/CLAUDE.md")
    ).text();
    const lineCount = text.trim().split("\n").length;
    expect(lineCount).toBeLessThan(50);
  });

  test("all hooks have correct shebang", async () => {
    const hookDirs = [
      join(CONFIGS_DIR, "hooks"),
      join(CONFIGS_DIR, "project-claude/hooks"),
    ];
    for (const dir of hookDirs) {
      const glob = new Glob("*.sh");
      for await (const file of glob.scan(dir)) {
        const text = await Bun.file(join(dir, file)).text();
        const firstLine = text.split("\n")[0];
        expect(firstLine).toBe("#!/usr/bin/env bash");
      }
    }
  });

  test("all hooks set errexit (either `set -euo pipefail` or `set -u` with trap)", async () => {
    const hookDirs = [
      join(CONFIGS_DIR, "hooks"),
      join(CONFIGS_DIR, "project-claude/hooks"),
    ];
    for (const dir of hookDirs) {
      const glob = new Glob("*.sh");
      for await (const file of glob.scan(dir)) {
        const text = await Bun.file(join(dir, file)).text();
        // Strict mode via `set -euo pipefail` OR minimal `set -u` + `trap … ERR`
        // (session-start + stop-summary use the latter to survive SIGPIPE).
        const strict =
          text.includes("set -euo pipefail") ||
          (text.includes("set -u") && text.includes("trap 'exit 0' ERR"));
        expect(strict).toBe(true);
      }
    }
  });

  test("tmux.conf has Ctrl-A prefix", async () => {
    const text = await Bun.file(join(CONFIGS_DIR, "tmux.conf")).text();
    expect(text).toMatch(/set\s+-g\s+prefix\s+C-a/);
  });

  test("starship.toml exists and is non-empty", async () => {
    const file = Bun.file(join(CONFIGS_DIR, "starship.toml"));
    const text = await file.text();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test("config tree contains both home-claude and project-claude template dirs", async () => {
    const homeSettings = Bun.file(join(CONFIGS_DIR, "home-claude/settings.json"));
    const projectSettings = Bun.file(join(CONFIGS_DIR, "project-claude/settings.json"));
    expect(await homeSettings.exists()).toBe(true);
    expect(await projectSettings.exists()).toBe(true);
  });
});
