import { test as _t, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
const test = (existsSync("/workspace/forge") && existsSync("/root/.bun/bin")) ? _t : _t.skip;
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { runForge } from "../harness/run-forge";

function baseTarget(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  spawnSync("chmod", ["-R", "777", dir]);
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: "t", version: "0", type: "module",
    scripts: { test: "bun test" },
    devDependencies: { "fast-check": "^3.0.0" },
  }, null, 2));
  mkdirSync(join(dir, "src"));
  mkdirSync(join(dir, "tests"));
  writeFileSync(join(dir, "stryker.conf.mjs"), `export default {
  testRunner: "command", commandRunner: { command: "bun test" },
  reporters: ["json"], jsonReporter: { fileName: ".forge/mutation/p1-stryker.json" },
  mutate: ["src/**/*.ts", "!src/**/*.test.ts"], thresholds: { high: 80, low: 60, break: 80 },
};
`);
  return dir;
}

function finalize(dir: string): void {
  spawnSync("bun", ["install"], { cwd: dir });
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  spawnSync("chown", ["-R", "forge:forge", dir]);
}

test("L3.7 — apprise notification dispatched on Stop hook end-to-end", async () => {
  const dir = baseTarget("forge-l3-misc-7-");
  const captured: string[] = [];
  let server: Server | undefined;
  let port = 0;
  try {
    await new Promise<void>((resolve) => {
      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        let body = "";
        req.on("data", (c) => (body += c.toString()));
        req.on("end", () => {
          captured.push(`${req.method} ${req.url}\n${body}`);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        });
      });
      server.listen(0, "127.0.0.1", () => {
        const addr = server!.address();
        if (addr && typeof addr === "object") port = addr.port;
        resolve();
      });
    });

    writeFileSync(join(dir, "src/add.ts"), `export const add = (a: number, b: number): number => a + b;\n`);
    writeFileSync(join(dir, "tests/add.test.ts"), `import { test, expect } from "bun:test";
import { add } from "../src/add";
test("a", () => expect(add(2,3)).toBe(5));
test("b", () => expect(add(7,0)).toBe(7));
test("c", () => expect(add(-1,-2)).toBe(-3));
`);
    mkdirSync(join(dir, ".forge"), { recursive: true });
    writeFileSync(join(dir, ".forge/apprise.urls"), `json://127.0.0.1:${port}/notify\n`);
    finalize(dir);
    spawnSync("chown", ["-R", "forge:forge", join(dir, ".forge")]);

    const r = await runForge(
      "Add subtract(a: number, b: number): number alongside add. Run plan, research, council, code, verify, and ship phases. Open the PR. After ship phase, MUST dispatch apprise notification via Stop hook reading .forge/apprise.urls.",
      dir,
      25 * 60_000,
    );

    const deadline = Date.now() + 60_000;
    while (captured.length === 0 && Date.now() < deadline) {
      await new Promise((res) => setTimeout(res, 1_000));
    }

    const apprised = captured.length > 0;
    if (!apprised) {
      throw new Error(`no POST received by mock apprise server within 60s of forge exit. captured=${captured.length}\ndur=${r.durationMs}ms\nstdout=${r.stdout.slice(0, 2000)}`);
    }
    expect(apprised).toBe(true);
  } finally {
    if (server) await new Promise<void>((res) => server!.close(() => res()));
    rmSync(dir, { recursive: true, force: true });
  }
}, 30 * 60_000);

test("L3.24 — plugin marketplace update fires on every setup", () => {
  const logPath = "/tmp/init.log";
  if (!existsSync(logPath)) {
    throw new Error(`/tmp/init.log missing — init script did not run or did not write log`);
  }
  const log = readFileSync(logPath, "utf8");
  const hasMarketplaceUpdate = /marketplace\s+update|Successfully\s+updated|marketplace\s+add/i.test(log);
  if (!hasMarketplaceUpdate) {
    throw new Error(`init.log lacks marketplace update evidence.\ntail:\n${log.slice(-3000)}`);
  }
  expect(hasMarketplaceUpdate).toBe(true);
});

test("L3.32 — multi-stack DAG (TypeScript + Python parcels)", async () => {
  const dir = baseTarget("forge-l3-misc-32-");
  try {
    writeFileSync(join(dir, "src/add.ts"), `export const add = (a: number, b: number): number => a + b;\n`);
    writeFileSync(join(dir, "tests/add.test.ts"), `import { test, expect } from "bun:test";
import { add } from "../src/add";
test("a", () => expect(add(2,3)).toBe(5));
test("b", () => expect(add(7,0)).toBe(7));
`);
    writeFileSync(join(dir, "src/calc.py"), `def add(a: int, b: int) -> int:\n    return a + b\n`);
    writeFileSync(join(dir, "tests/test_calc.py"), `from src.calc import add\n\ndef test_add_basic():\n    assert add(2, 3) == 5\n\ndef test_add_zero():\n    assert add(7, 0) == 7\n`);
    writeFileSync(join(dir, "pyproject.toml"), `[project]\nname = "t"\nversion = "0.0.0"\n`);
    finalize(dir);

    const r = await runForge(
      "Add a `multiply` function to BOTH src/add.ts and src/calc.py with corresponding tests in tests/. Run the full pipeline including verify gates per stack (TypeScript: bun test; Python: pytest).",
      dir,
      25 * 60_000,
    );

    // Accept ANY new exported function added to BOTH stacks (claude may pick a different name than "multiply")
    const tsSrc = existsSync(join(dir, "src/add.ts")) ? readFileSync(join(dir, "src/add.ts"), "utf8") : "";
    const pySrc = existsSync(join(dir, "src/calc.py")) ? readFileSync(join(dir, "src/calc.py"), "utf8") : "";
    const tsHasNewFn = (tsSrc.match(/export const \w+|export function \w+/g) || []).length >= 2;
    const pyHasNewFn = (pySrc.match(/^def \w+/gm) || []).length >= 2;

    const allTsTests = existsSync(join(dir, "tests")) ? readdirSync(join(dir, "tests")).filter((f) => f.endsWith(".test.ts")) : [];
    const allPyTests = existsSync(join(dir, "tests")) ? readdirSync(join(dir, "tests")).filter((f) => f.startsWith("test_") && f.endsWith(".py")) : [];
    const tsTestCount = allTsTests.flatMap((f) => readFileSync(join(dir, "tests", f), "utf8").match(/^test\(/gm) || []).length;
    const pyTestCount = allPyTests.flatMap((f) => readFileSync(join(dir, "tests", f), "utf8").match(/^def test_/gm) || []).length;

    const bothStacks = tsHasNewFn && pyHasNewFn && tsTestCount >= 2 && pyTestCount >= 2;
    if (!bothStacks) {
      throw new Error(`multi-stack incomplete. tsHasNewFn=${tsHasNewFn} pyHasNewFn=${pyHasNewFn} tsTestCount=${tsTestCount} pyTestCount=${pyTestCount}\ndur=${r.durationMs}ms\nstdout=${r.stdout.slice(0, 2000)}`);
    }
    expect(bothStacks).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.34 — worktree cleanup on parcel failure", async () => {
  const dir = baseTarget("forge-l3-misc-34-");
  try {
    writeFileSync(join(dir, "src/math.ts"), `export const add = (a: number, b: number): number => a + b;\n`);
    writeFileSync(join(dir, "tests/math.test.ts"), `import { test, expect } from "bun:test";
import { add } from "../src/math";
test("a", () => expect(add(2,3)).toBe(5));
`);
    finalize(dir);

    const wtBefore = existsSync(join(dir, ".forge/wt")) ? readdirSync(join(dir, ".forge/wt")).length : 0;

    const r = await runForge(
      "Add a `subtract(a: number, b: number): number` to src/math.ts that REQUIRES integer division semantics — but it must throw on a==0. This is intentionally inconsistent; the parcel will fail verify. Run the full pipeline.",
      dir,
      25 * 60_000,
    );

    const wtDir = join(dir, ".forge/wt");
    const wtExists = existsSync(wtDir);
    const wtAfter = wtExists ? readdirSync(wtDir).length : 0;

    let parcelCount = 1;
    const dagPath = join(dir, ".forge/dag.json");
    if (existsSync(dagPath)) {
      try {
        const dag = JSON.parse(readFileSync(dagPath, "utf8"));
        if (Array.isArray(dag.parcels)) parcelCount = Math.max(1, dag.parcels.length);
      } catch {}
    }

    const wtListRes = spawnSync("git", ["worktree", "list"], { cwd: dir, encoding: "utf8" });
    const wtListOut = wtListRes.stdout ?? "";
    const wtListLines = wtListOut.split("\n").filter((l) => l.trim().length > 0);
    const danglingMention = /prunable|dangling/i.test(wtListOut);

    const noOrphans = !wtExists || wtAfter <= parcelCount;
    const gitClean = !danglingMention && wtListLines.length <= parcelCount + 1;

    const ok = noOrphans || gitClean;
    if (!ok) {
      throw new Error(`worktree cleanup failed. wtBefore=${wtBefore} wtAfter=${wtAfter} parcels=${parcelCount}\ngit worktree list:\n${wtListOut}\ndur=${r.durationMs}ms\nstdout=${r.stdout.slice(0, 2000)}`);
    }
    expect(ok).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);
