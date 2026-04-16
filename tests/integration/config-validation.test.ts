import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";

const CONFIGS_DIR = join(import.meta.dir, "../../configs");

describe("Config validation", () => {
  test("settings.json is valid JSON", async () => {
    const data = await Bun.file(
      join(CONFIGS_DIR, "home-claude/settings.json")
    ).json();
    expect(data).toBeTruthy();
  });

  test("settings.json has 40+ deny rules", async () => {
    const data = await Bun.file(
      join(CONFIGS_DIR, "home-claude/settings.json")
    ).json<{ permissions: { deny: string[] } }>();
    expect(data.permissions.deny.length).toBeGreaterThanOrEqual(40);
  });

  test("settings.json has pinned model", async () => {
    const data = await Bun.file(
      join(CONFIGS_DIR, "home-claude/settings.json")
    ).json<{ model?: string }>();
    expect(typeof data.model).toBe("string");
    expect(data.model!.length).toBeGreaterThan(0);
  });

  test("mcp.json is valid JSON", async () => {
    const data = await Bun.file(
      join(CONFIGS_DIR, "project-claude/mcp.json")
    ).json();
    expect(data).toBeTruthy();
  });

  test("mcp.json has 7 MCP servers", async () => {
    const data = await Bun.file(
      join(CONFIGS_DIR, "project-claude/mcp.json")
    ).json<{ mcpServers: Record<string, unknown> }>();
    expect(Object.keys(data.mcpServers).length).toBe(7);
  });

  test("mcp.json server names match expected set", async () => {
    const data = await Bun.file(
      join(CONFIGS_DIR, "project-claude/mcp.json")
    ).json<{ mcpServers: Record<string, unknown> }>();
    const names = Object.keys(data.mcpServers).sort();
    const expected = [
      "serena",
      "docfork",
      "github",
      "context-mode",
      "composio",
      "postgres-pro",
      "snyk",
    ].sort();
    expect(names).toEqual(expected);
  });

  test("CLAUDE.md is under 100 lines", async () => {
    const text = await Bun.file(
      join(CONFIGS_DIR, "home-claude/CLAUDE.md")
    ).text();
    const lines = text.split("\n");
    expect(lines.length).toBeLessThan(100);
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

  test("all hooks have set -euo pipefail", async () => {
    const hookDirs = [
      join(CONFIGS_DIR, "hooks"),
      join(CONFIGS_DIR, "project-claude/hooks"),
    ];
    for (const dir of hookDirs) {
      const glob = new Glob("*.sh");
      for await (const file of glob.scan(dir)) {
        const text = await Bun.file(join(dir, file)).text();
        expect(text).toContain("set -euo pipefail");
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

  test("config file count is 17", async () => {
    const glob = new Glob("**/*");
    const files: string[] = [];
    for await (const file of glob.scan({ cwd: CONFIGS_DIR, onlyFiles: true })) {
      files.push(file);
    }
    expect(files.length).toBe(17);
  });
});
