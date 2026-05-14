import { test as _t, expect } from "bun:test";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync, chmodSync } from "node:fs";
const test = (existsSync("/workspace/forge") && existsSync("/root/.bun/bin")) ? _t : _t.skip;
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const FORGE = resolve(import.meta.dir, "..", "..", "plugin");

function pipe(script: string, payload: string, cwd: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync("bash", [join(FORGE, "hooks", script)], { cwd, input: payload, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function pipePy(script: string, payload: string, cwd: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync("python3", [join(FORGE, "hooks", script)], { cwd, input: payload, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

test("L2.7 — pre-tool-use-static-link.py warns on Cargo.toml crate-type", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-h-"));
  try {
    const evt = JSON.stringify({
      tool_input: {
        file_path: "Cargo.toml",
        content: `[lib]\ncrate-type = ["cdylib"]\n`,
      },
    });
    const r = pipePy("pre-tool-use-static-link.py", evt, dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/warn|crate-type/i);

    const r2 = pipePy("pre-tool-use-static-link.py", JSON.stringify({ tool_input: { file_path: "src/main.rs", content: "fn main() {}" } }), dir);
    expect(r2.status).toBe(0);
    expect(r2.stdout.trim()).toBe("{}");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("L2.8 — forge-meta-log.sh logs only on /forge.* prompt", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-h-"));
  try {
    pipe("forge-meta-log.sh", JSON.stringify({ prompt: "/forge:forge add subtract", session_id: "s1" }), dir);
    expect(existsSync(join(dir, ".forge/invocations.log"))).toBe(true);
    const log = readFileSync(join(dir, ".forge/invocations.log"), "utf8");
    expect(log).toContain("session=s1");
    expect(log.toLowerCase()).toContain("forge");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("L2.9 — worktree-create-jj.sh runs jj util snapshot in target", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-h-"));
  const wt = mkdtempSync(join(tmpdir(), "forge-h-wt-"));
  try {
    spawnSync("jj", ["git", "init", wt], { encoding: "utf8" });
    pipe("worktree-create-jj.sh", JSON.stringify({ worktree_path: wt, session_id: "s2" }), dir);
    expect(existsSync(join(dir, ".forge/worktree-snapshots.log"))).toBe(true);
    const log = readFileSync(join(dir, ".forge/worktree-snapshots.log"), "utf8");
    expect(log).toMatch(/status=ok|status=skip/);
    expect(log).toContain("session=s2");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("L2.10 — pre-compact-claude-mem.sh exits 0 even without claude-mem op", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-h-"));
  try {
    const r = pipe("pre-compact-claude-mem.sh", JSON.stringify({ session_id: "s3" }), dir);
    expect(r.status).toBe(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("L2.11 — stop-notify.py dispatches via apprise when URL configured", async () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-h-"));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const http = await import("node:http");
  const cp = await import("node:child_process");
  let received: string | null = null;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c.toString(); });
    req.on("end", () => { received = body; res.writeHead(200); res.end("ok"); });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r()));
  try {
    mkdirSync(join(dir, ".forge"), { recursive: true });
    writeFileSync(join(dir, ".forge/dag.json"), "{}");
    writeFileSync(join(dir, ".forge/apprise.urls"), `json://127.0.0.1:${port}/\n`);

    const exit = await new Promise<number>((resolve) => {
      const proc = cp.spawn("python3", [join(FORGE, "hooks/stop-notify.py")], { cwd: dir, stdio: ["pipe", "inherit", "inherit"] });
      proc.stdin.write(JSON.stringify({ session_id: "s4" }));
      proc.stdin.end();
      proc.on("exit", (code) => resolve(code ?? -1));
      setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} resolve(124); }, 15_000);
    });
    await new Promise((r) => setTimeout(r, 500));
    expect(exit).toBe(0);
    expect(received).not.toBeNull();
    expect(received!.toLowerCase()).toContain("forge");
  } finally { await new Promise<void>((r) => server.close(() => r())); rmSync(dir, { recursive: true, force: true }); }
}, 30_000);

test("L2.13 — post-tool-batch-screenshot.py UI-only routing", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-h-"));
  try {
    mkdirSync(join(dir, ".forge/kind"), { recursive: true });
    mkdirSync(join(dir, ".forge/browser/p1"), { recursive: true });
    writeFileSync(join(dir, ".forge/dag.json"), "{}");
    writeFileSync(join(dir, ".forge/active-parcel.txt"), "p1");

    writeFileSync(join(dir, ".forge/kind/p1.txt"), "pure-fn");
    const r1 = pipePy("post-tool-batch-screenshot.py", "{}", dir);
    expect(r1.status).toBe(0);
    expect(r1.stdout.trim()).toBe("{}");

    writeFileSync(join(dir, ".forge/kind/p1.txt"), "ui");
    const r2 = pipePy("post-tool-batch-screenshot.py", "{}", dir);
    expect(r2.status).toBe(0);
    expect(r2.stdout.trim()).toBe("{}");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("L2.17 — subagent-stop-record.sh logs subagent stop event", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-h-"));
  try {
    pipe("subagent-stop-record.sh", JSON.stringify({ subagent_id: "sa1", session_id: "s5", outcome: "ok" }), dir);
    expect(existsSync(join(dir, ".forge/subagent.log"))).toBe(true);
    const log = readFileSync(join(dir, ".forge/subagent.log"), "utf8");
    expect(log).toContain("subagent=sa1");
    expect(log).toContain("parent=s5");
    expect(log).toContain("outcome=ok");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
