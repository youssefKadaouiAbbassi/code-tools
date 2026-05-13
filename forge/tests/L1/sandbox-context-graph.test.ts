import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("L1.19 — bubblewrap denies write to /etc (readonly /), allows write to bound dir under /tmp", () => {
  const root = mkdtempSync(join(tmpdir(), "forge-bwrap-"));
  try {
    const deny = spawnSync("bwrap", [
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/etc", "/etc",
      "--ro-bind", "/lib", "/lib",
      "--ro-bind", "/lib64", "/lib64",
      "--ro-bind", "/bin", "/bin",
      "--bind", root, "/sandbox",
      "--proc", "/proc",
      "--dev", "/dev",
      "--", "bash", "-c", "echo X > /etc/forged-by-test 2>&1; echo exit=$?",
    ], { encoding: "utf8", timeout: 30_000 });
    const denyOut = (deny.stdout || "") + (deny.stderr || "");
    expect(denyOut).toMatch(/Read-only|Permission|denied|cannot/i);

    const allow = spawnSync("bwrap", [
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/lib", "/lib",
      "--ro-bind", "/lib64", "/lib64",
      "--ro-bind", "/bin", "/bin",
      "--bind", root, "/sandbox",
      "--proc", "/proc",
      "--dev", "/dev",
      "--chdir", "/sandbox",
      "--", "bash", "-c", "echo Y > /sandbox/inside.txt && cat /sandbox/inside.txt",
    ], { encoding: "utf8", timeout: 30_000 });
    expect(allow.status).toBe(0);
    expect(allow.stdout).toContain("Y");
    expect(existsSync(join(root, "inside.txt"))).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 60_000);

test("L1.27 — agent .md files have valid frontmatter", () => {
  const FORGE_DIR = "/workspace/forge";
  const fs = require("node:fs");
  const path = require("node:path");
  for (const name of ["forge-lead", "pbt-verifier", "mutation-orchestrator", "browser-driver"]) {
    const p = path.join(FORGE_DIR, "agents", `${name}.md`);
    expect(fs.existsSync(p)).toBe(true);
    const body = fs.readFileSync(p, "utf8");
    const m = body.match(/^---\n([\s\S]*?)\n---/);
    expect(m).toBeTruthy();
    expect(m![1]).toMatch(/name:\s*\S/);
    expect(m![1]).toMatch(/description:\s*\S/);
    expect(m![1]).toMatch(/model:\s*opus/);
  }
});
