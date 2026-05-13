import { test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";

const FORGE_DIR = resolve(import.meta.dir, "..", "..");
const PLUGIN_DIR = resolve(FORGE_DIR, "plugin");

// Plugins forge actually installs (PLUGINS in src/state.ts). Aligned with
// installer reality, not aspirational — adding plugins here without updating
// PLUGINS would silently break this test.
const REQUIRED_UPSTREAM = [
  "feature-dev", "ralph-loop", "pr-review-toolkit", "tdd-workflows",
  "tdd-guard", "mutation-test-runner", "protect-mcp", "claude-hud",
];

function pluginListNames(): string[] {
  const r = spawnSync("claude", ["plugin", "list"], { encoding: "utf8", timeout: 30_000 });
  return (r.stdout || "")
    .split("\n")
    .filter((l) => /^\s+❯/.test(l))
    .map((l) => l.replace(/^\s+❯\s+/, "").split("@")[0].trim());
}

test.skipIf(!existsSync("/root/.claude"))("L0.1 — all upstream plugins + forge plugin functional", () => {
  // Container-only: tests Claude Code's installed-plugin state at /root/.claude.
  const installed = new Set(pluginListNames());
  for (const name of REQUIRED_UPSTREAM) {
    expect(installed.has(name)).toBe(true);
  }
  expect(installed.has("forge")).toBe(true);
}, 120_000);

test.skipIf(!existsSync("/root/.claude"))("L0.2 — all 6 /forge:* slash commands resolve", () => {
  // Container-only: needs Claude Code authed and forge plugin loaded.
  const r = spawnSync("claude", ["-p", "list every available slash command, exact name, one per line", "--model", "opus"],
    { encoding: "utf8", timeout: 120_000 });
  const out = r.stdout || "";
  const expected = ["forge", "derive-kind", "stub-warn", "mutation-gate", "pbt-verify", "browser-verify"];
  for (const cmd of expected) {
    expect(out).toMatch(new RegExp(`/?forge:${cmd}\\b`));
  }
}, 180_000);

test.skipIf(!existsSync("/root/.bun/bin"))("L0.3 — forge-doctor reports versions, no MISSING", () => {
  // Container-only: forge-doctor probes ~20 host-installed binaries (stryker,
  // proofshot, claude-mem, mutmut, opengrep, syft, grype …) that the forge-dev
  // Dockerfile pre-installs. On developer hosts without those, the test is
  // irrelevant and would falsely report regressions.
  const doctor = join(PLUGIN_DIR, "bin", "forge-doctor");
  const r = spawnSync("bash", [doctor, "--first-run"], { encoding: "utf8", timeout: 60_000 });
  const out = (r.stdout || "") + (r.stderr || "");
  expect(out).toContain("forge-doctor — capability matrix");
  expect(out).toContain("tool");
  expect(out).toContain("version");
  expect(out).not.toContain("MISSING");
}, 90_000);

test.skipIf(!existsSync("/root/.claude"))("L0.4 — microsoft/playwright-cli skill installed", () => {
  // Container-only: the install harness places user-scoped skills under /root/.claude.
  // On hosts without that path, the test is irrelevant — skip rather than fail.
  expect(existsSync("/root/.claude/skills/playwright-cli/SKILL.md")).toBe(true);
});

test("L0.5 — Cedar policy contains required forbid rules", () => {
  const cedar = readFileSync(join(PLUGIN_DIR, "policy.cedar"), "utf8");
  expect(cedar).toMatch(/forbid/);
  expect(cedar).toMatch(/\.forge\/receipts/);
  expect(cedar).toMatch(/forge-meta/);
});

test("L0.10 — hooks.json registers all required events", () => {
  const hj = JSON.parse(readFileSync(join(PLUGIN_DIR, "hooks", "hooks.json"), "utf8"));
  const events = Object.keys(hj.hooks);
  for (const evt of [
    "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
    "PostToolBatch", "WorktreeCreate", "PreCompact", "SubagentStop", "Stop",
  ]) {
    expect(events).toContain(evt);
  }
  // PreToolUse must have both Edit|Write command and Bash prompt entries
  const pre = hj.hooks.PreToolUse;
  const matchers = pre.map((p: { matcher: string }) => p.matcher);
  expect(matchers).toContain("Edit|Write");
  expect(matchers).toContain("Bash");
  const bash = pre.find((p: { matcher: string }) => p.matcher === "Bash");
  expect(bash.hooks[0].type).toBe("prompt");
});

test.skipIf(!existsSync("/tmp/init.log"))("L0.11 — plugin marketplace update fired on init", () => {
  // Container-only: /tmp/init.log is written by the docker-compose entrypoint.
  // On hosts without that file the assertion is meaningless — skip.
  const initLog = readFileSync("/tmp/init.log", "utf8");
  expect(initLog).toMatch(/marketplace|update|installed/i);
});

test.skip("L0.6 — forge plugin manifest dependencies array — DISABLED, Claude Code spec rejects this field on plugin.json (adds a `feature-dev@forge` dep error at plugin load). Forge installs sub-plugins via the CLI installer (src/state.ts PLUGINS), not via this manifest.", () => {
  const m = JSON.parse(readFileSync(join(PLUGIN_DIR, ".claude-plugin", "plugin.json"), "utf8"));
  expect(m.name).toBe("forge");
  expect(Array.isArray(m.dependencies)).toBe(true);
  expect(m.dependencies.length).toBeGreaterThanOrEqual(13);
});

test("L0.7 — .mcp.json declares servers", () => {
  const mcp = JSON.parse(readFileSync(join(PLUGIN_DIR, ".mcp.json"), "utf8"));
  expect(mcp.mcpServers).toBeDefined();
  for (const name of ["docfork", "deepwiki", "github", "snyk"]) {
    expect(Object.keys(mcp.mcpServers)).toContain(name);
  }
});

test("L0.8 — forge-doctor missing-tool detection (negative)", () => {
  const doctor = join(PLUGIN_DIR, "bin", "forge-doctor");
  const r = spawnSync("bash", ["-c", `PATH=/usr/bin:/bin ${doctor} --full`], { encoding: "utf8", timeout: 60_000 });
  const out = (r.stdout || "") + (r.stderr || "");
  expect(out).toMatch(/MISSING/);
}, 90_000);

test("L0.9 — .lsp.json parses (LSPs come from per-stack LSP plugins, not bundled)", () => {
  const lsp = JSON.parse(readFileSync(join(PLUGIN_DIR, ".lsp.json"), "utf8"));
  expect(typeof lsp).toBe("object");
});
