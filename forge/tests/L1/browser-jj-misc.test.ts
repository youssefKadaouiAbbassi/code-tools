import { test as _t, expect } from "bun:test";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
const test = (existsSync("/workspace/forge") && existsSync("/root/.bun/bin")) ? _t : _t.skip;
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createTarget, TARGETS } from "../harness/target-repo";

async function waitForHttp(url: string, timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

test("L1.7 — Playwright headless: real PNGs + console + network capture", async () => {
  const t = createTarget(TARGETS.staticHtml());
  const port = 3457;
  const url = `http://localhost:${port}`;
  const server = spawn("python3", ["-m", "http.server", String(port)], { cwd: t.path, stdio: "ignore", detached: true });
  try {
    expect(await waitForHttp(url)).toBe(true);
    mkdirSync(join(t.path, ".forge/browser/p1"), { recursive: true });
    writeFileSync(join(t.path, ".forge/browser/p1/drive.spec.ts"), `import { test, expect } from "@playwright/test";
test.use({ baseURL: "${url}" });
test("smoke", async ({ page }) => {
  const errs: string[] = [], fails: string[] = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && fails.push(\`\${r.status()} \${r.url()}\`));
  await page.goto("/");
  await page.screenshot({ path: ".forge/browser/p1/home.png", fullPage: true });
  await page.click("#go");
  await page.screenshot({ path: ".forge/browser/p1/after.png", fullPage: true });
  expect(errs).toEqual([]);
  expect(fails).toEqual([]);
});
`);
    writeFileSync(join(t.path, "playwright.config.ts"), `import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".forge/browser/p1",
  use: { headless: true, trace: "on" },
  reporter: [["json", { outputFile: ".forge/browser/p1/playwright-result.json" }]],
});
`);
    spawnSync("bun", ["add", "-D", "@playwright/test"], { cwd: t.path });
    const r = spawnSync("bunx", ["playwright", "test", "--config", "playwright.config.ts"], { cwd: t.path, encoding: "utf8", timeout: 120_000 });
    expect(r.status).toBe(0);
    expect(existsSync(join(t.path, ".forge/browser/p1/home.png"))).toBe(true);
    expect(existsSync(join(t.path, ".forge/browser/p1/after.png"))).toBe(true);
    expect(existsSync(join(t.path, ".forge/browser/p1/playwright-result.json"))).toBe(true);
  } finally {
    if (server.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch {} }
    t.cleanup();
  }
}, 240_000);

test("L1.14 — jj snapshot: jj git init + jj util snapshot", () => {
  const t = createTarget({ name: "jj-snap", commit: false, files: { "x.txt": "hi\n" } });
  try {
    const init = spawnSync("jj", ["git", "init", t.path], { encoding: "utf8", timeout: 30_000 });
    expect(init.status).toBe(0);
    const snap = spawnSync("jj", ["util", "snapshot"], { cwd: t.path, encoding: "utf8", timeout: 30_000 });
    expect(snap.status).toBe(0);
    const log = spawnSync("jj", ["op", "log", "--limit", "5", "--no-pager"], { cwd: t.path, encoding: "utf8", timeout: 30_000 });
    expect(log.status).toBe(0);
    expect((log.stdout || "").length).toBeGreaterThan(0);
  } finally { t.cleanup(); }
}, 60_000);

test("L1.15 — jj undo: snapshot, modify, undo reverts file content", () => {
  const t = createTarget({ name: "jj-undo", commit: false, files: { "x.txt": "ORIGINAL\n" } });
  try {
    spawnSync("jj", ["git", "init", t.path], { encoding: "utf8", timeout: 30_000 });
    spawnSync("jj", ["util", "snapshot"], { cwd: t.path, encoding: "utf8", timeout: 30_000 });
    writeFileSync(join(t.path, "x.txt"), "MODIFIED\n");
    spawnSync("jj", ["util", "snapshot"], { cwd: t.path, encoding: "utf8", timeout: 30_000 });
    const undo = spawnSync("jj", ["undo"], { cwd: t.path, encoding: "utf8", timeout: 30_000 });
    expect(undo.status).toBe(0);
    expect(readFileSync(join(t.path, "x.txt"), "utf8")).toBe("ORIGINAL\n");
  } finally { t.cleanup(); }
}, 60_000);

test("L1.16 — apprise dispatch to mock HTTP endpoint", async () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const http = await import("node:http");
  const cp = await import("node:child_process");
  let received: { body: string; method: string } | null = null;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c.toString(); });
    req.on("end", () => {
      received = { method: req.method ?? "", body };
      res.writeHead(200);
      res.end("ok");
    });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r()));
  try {
    const exit = await new Promise<number>((resolve) => {
      const proc = cp.spawn("apprise", ["-vv", "-t", "test-title", "-b", "test-body", `json://127.0.0.1:${port}/`], { stdio: "inherit" });
      proc.on("exit", (code) => resolve(code ?? -1));
      setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} resolve(124); }, 15_000);
    });
    await new Promise((r) => setTimeout(r, 500));
    expect(exit).toBe(0);
    expect(received).not.toBeNull();
    expect(received!.method).toBe("POST");
    expect(received!.body.toLowerCase()).toContain("test");
  } finally { await new Promise<void>((r) => server.close(() => r())); }
}, 30_000);
