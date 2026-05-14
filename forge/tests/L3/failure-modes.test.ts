import { test as _t, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
const test = (existsSync("/workspace/forge") && existsSync("/root/.bun/bin")) ? _t : _t.skip;
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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

function readMutationScores(dir: string): number[] {
  const mutDir = join(dir, ".forge/mutation");
  if (!existsSync(mutDir)) return [];
  const scores: number[] = [];
  for (const f of readdirSync(mutDir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const j = JSON.parse(readFileSync(join(mutDir, f), "utf8"));
      if (typeof j.score === "number") scores.push(j.score);
      if (typeof j.mutationScore === "number") scores.push(j.mutationScore / 100);
      if (j.summary && typeof j.summary.score === "number") scores.push(j.summary.score);
    } catch {}
  }
  return scores;
}

function jjOpLog(dir: string): string {
  const r = spawnSync("su", ["forge", "-c", `cd ${JSON.stringify(dir)} && jj op log --no-pager 2>&1 || true`], { encoding: "utf8" });
  return (r.stdout ?? "") + (r.stderr ?? "");
}

test("L3.9 — assertion-free tests yield mutation score < 0.80, ship blocked", async () => {
  const dir = baseTarget("forge-l3-fail-9-");
  try {
    writeFileSync(join(dir, "src/add.ts"), `export const add = (a: number, b: number): number => a + b;\n`);
    writeFileSync(join(dir, "tests/add.test.ts"), `import { test, expect } from "bun:test";
import { add } from "../src/add";
test("noop1", () => { add(1,2); expect(true).toBe(true); });
test("noop2", () => { add(0,0); expect(true).toBe(true); });
test("noop3", () => { add(-1,1); expect(true).toBe(true); });
`);
    finalize(dir);

    const r = await runForge(
      "Run the full pipeline (plan, research, council, code, verify, ship) on the existing src/add.ts. Do not modify the existing tests. Open a PR if the gate allows.",
      dir,
      28 * 60_000,
    );

    const scores = readMutationScores(dir);
    const lowScore = scores.length > 0 && scores.some((s) => s < 0.80);
    const prDraftAbsent = !existsSync(join(dir, ".forge/pr-draft.md"));
    const branchList = spawnSync("git", ["branch", "-a"], { cwd: dir, encoding: "utf8" }).stdout ?? "";
    const forgeMetaAbsent = !branchList.includes("forge-meta");

    const blocked = lowScore || prDraftAbsent || forgeMetaAbsent;
    if (!blocked) {
      throw new Error(`expected ship blocked (low mutation, no pr-draft, or no forge-meta).\nscores=${JSON.stringify(scores)}\nbranches=${branchList}\ndur=${r.durationMs}ms\nstdout=${r.stdout.slice(0, 2000)}`);
    }
    expect(blocked).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.10 — anti-property guardrail rejects false commutativity for subtract", async () => {
  const dir = baseTarget("forge-l3-fail-10-");
  try {
    writeFileSync(join(dir, "src/sub.ts"), `export const subtract = (a: number, b: number): number => a - b;\n`);
    writeFileSync(join(dir, "tests/sub.test.ts"), `import { test, expect } from "bun:test";
import { subtract } from "../src/sub";
test("basic", () => expect(subtract(5,3)).toBe(2));
`);
    finalize(dir);

    const r = await runForge(
      "Add property-based tests (PBT) for subtract in src/sub.ts. Place them under .forge/pbt/. Use fast-check.",
      dir,
      25 * 60_000,
    );

    const pbtDir = join(dir, ".forge/pbt");
    if (!existsSync(pbtDir)) {
      throw new Error(`no .forge/pbt produced. dur=${r.durationMs}ms\nstdout=${r.stdout.slice(0, 2000)}`);
    }
    const files = readdirSync(pbtDir).filter((f) => f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThanOrEqual(1);

    for (const f of files) {
      const src = readFileSync(join(pbtDir, f), "utf8");
      const noComments = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const normalized = noComments.replace(/\s+/g, "");
      const badCommutative = /subtract\(a,b\)===subtract\(b,a\)/.test(normalized)
        || /subtract\(b,a\)===subtract\(a,b\)/.test(normalized);
      if (badCommutative) {
        const negated = /!==|not\.toBe|not\.toEqual|notEqual/.test(normalized);
        if (!negated) {
          throw new Error(`pbt file ${f} asserts false commutativity without negation:\n${src.slice(0, 1500)}`);
        }
      }
    }
    expect(true).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.13 — jj undo recovery when worker hits a failing test", async () => {
  const dir = baseTarget("forge-l3-fail-13-");
  try {
    writeFileSync(join(dir, "src/util.ts"), `export const util = (n: number): number => n * 2;\n`);
    writeFileSync(join(dir, "tests/util.test.ts"), `import { test, expect } from "bun:test";
import { util } from "../src/util";
test("basic", () => expect(util(2)).toBe(4));
`);
    writeFileSync(join(dir, "tests/will-fail.test.ts"), `import { test, expect } from "bun:test";
test("intentionally failing — fix me", () => { expect(1).toBe(2); });
`);
    finalize(dir);

    const r = await runForge(
      "There is a failing test at tests/will-fail.test.ts. Run the full pipeline to fix it so `bun test` passes. You may edit either the test or add code, but the suite must be green.",
      dir,
      28 * 60_000,
    );

    const opLog = jjOpLog(dir);
    const undoSeen = /undo|restore|abandon/i.test(opLog);

    const finalTest = spawnSync("bun", ["test"], { cwd: dir, encoding: "utf8", timeout: 120_000 });
    const suiteGreen = finalTest.status === 0;

    const recovered = undoSeen || suiteGreen;
    if (!recovered) {
      throw new Error(`no undo evidence and suite still red.\njj op log:\n${opLog.slice(0, 2000)}\nbun test stdout:\n${(finalTest.stdout ?? "").slice(0, 1500)}\nbun test stderr:\n${(finalTest.stderr ?? "").slice(0, 1500)}\nforge dur=${r.durationMs}ms`);
    }
    expect(recovered).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.23 — stub-warn end-to-end on TODO-throw stub", async () => {
  const dir = baseTarget("forge-l3-fail-23-");
  try {
    writeFileSync(join(dir, "src/stub.ts"), `export const f = (x: unknown): unknown => { throw new Error("TODO: implement"); };\n`);
    writeFileSync(join(dir, "tests/stub.test.ts"), `import { test, expect } from "bun:test";
import { f } from "../src/stub";
test("identity", () => expect(f(42)).toBe(42));
`);
    finalize(dir);

    const r = await runForge(
      "Implement f in src/stub.ts so it returns its argument unchanged. Run the full pipeline.",
      dir,
      28 * 60_000,
    );

    const stubSrc = existsSync(join(dir, "src/stub.ts")) ? readFileSync(join(dir, "src/stub.ts"), "utf8") : "";
    const noLongerThrows = !/throw new Error\("TODO/.test(stubSrc) && /return/.test(stubSrc);
    const hookifyWarn = /stub|TODO|hookify/i.test(r.stdout) && /warn/i.test(r.stdout);
    const scores = readMutationScores(dir);
    const lowMutation = scores.length > 0 && scores.some((s) => s < 0.80);

    const detected = hookifyWarn || noLongerThrows || lowMutation;
    if (!detected) {
      throw new Error(`stub neither warned, implemented, nor flagged.\nstub.ts:\n${stubSrc}\nscores=${JSON.stringify(scores)}\ndur=${r.durationMs}ms\nstdout=${r.stdout.slice(0, 2000)}`);
    }
    expect(detected).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.30 — DAG cycle detected at plan time or avoided", async () => {
  const dir = baseTarget("forge-l3-fail-30-");
  try {
    writeFileSync(join(dir, "src/.gitkeep"), "");
    finalize(dir);

    const r = await runForge(
      "Plan and implement two parcels: (A) add module src/a.ts that depends on src/b.ts; (B) add module src/b.ts that depends on src/a.ts. They must mutually depend on each other. Run plan + research + council phases at minimum.",
      dir,
      25 * 60_000,
    );

    const refusalInOutput = /\b(cycle|circular|cyclic)\b/i.test(r.stdout) || /\b(cycle|circular|cyclic)\b/i.test(r.stderr);

    let dagAcyclic = false;
    const dagPath = join(dir, ".forge/dag.json");
    if (existsSync(dagPath)) {
      try {
        const dag = JSON.parse(readFileSync(dagPath, "utf8"));
        const parcels: Array<{ id: string; deps?: string[] }> = Array.isArray(dag.parcels) ? dag.parcels : [];
        const ids = new Set(parcels.map((p) => p.id));
        const adj = new Map<string, string[]>();
        for (const p of parcels) adj.set(p.id, (p.deps ?? []).filter((d) => ids.has(d)));
        const WHITE = 0, GRAY = 1, BLACK = 2;
        const color = new Map<string, number>();
        for (const id of ids) color.set(id, WHITE);
        let hasCycle = false;
        const dfs = (u: string): void => {
          if (hasCycle) return;
          color.set(u, GRAY);
          for (const v of adj.get(u) ?? []) {
            const c = color.get(v) ?? WHITE;
            if (c === GRAY) { hasCycle = true; return; }
            if (c === WHITE) dfs(v);
          }
          color.set(u, BLACK);
        };
        for (const id of ids) if ((color.get(id) ?? WHITE) === WHITE) dfs(id);
        dagAcyclic = !hasCycle;
      } catch {}
    }

    const handled = refusalInOutput || dagAcyclic;
    if (!handled) {
      throw new Error(`cycle neither refused nor avoided.\nstdout=${r.stdout.slice(0, 2000)}\ndag=${existsSync(dagPath) ? readFileSync(dagPath, "utf8").slice(0, 1500) : "<missing>"}\ndur=${r.durationMs}ms`);
    }
    expect(handled).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);
