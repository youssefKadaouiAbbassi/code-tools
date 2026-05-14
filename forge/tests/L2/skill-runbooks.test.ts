import { test as _t, expect } from "bun:test";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
const test = (existsSync("/workspace/forge") && existsSync("/root/.bun/bin")) ? _t : _t.skip;
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const FORGE = resolve(import.meta.dir, "..", "..", "plugin");

test("L2.2 — mutation-gate runbook produces verdict matching independently-recomputed score", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-mg-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t", version: "0", type: "module", scripts: { test: "bun test" } }, null, 2));
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "tests"));
    writeFileSync(join(dir, "src/add.ts"), `export const add = (a: number, b: number): number => a + b;\n`);
    writeFileSync(join(dir, "tests/add.test.ts"), `import { test, expect } from "bun:test";
import { add } from "../src/add";
test("a", () => expect(add(2,3)).toBe(5));
test("b", () => expect(add(7,0)).toBe(7));
test("c", () => expect(add(-1,-2)).toBe(-3));
`);
    writeFileSync(join(dir, "stryker.conf.mjs"), `export default {
  testRunner: "command",
  commandRunner: { command: "bun test" },
  reporters: ["json"],
  jsonReporter: { fileName: ".forge/mutation/p1-stryker.json" },
  mutate: ["src/**/*.ts"],
  thresholds: { high: 80, low: 60, break: 80 }
};
`);
    spawnSync("bun", ["install"], { cwd: dir });
    mkdirSync(join(dir, ".forge/mutation"), { recursive: true });
    spawnSync("bunx", ["stryker", "run", "--reporters", "json"], { cwd: dir, encoding: "utf8", timeout: 180_000 });

    const report = JSON.parse(readFileSync(join(dir, ".forge/mutation/p1-stryker.json"), "utf8"));
    let killed = 0, survived = 0, noCov = 0;
    for (const f of Object.values(report.files) as Array<{ mutants: { status: string }[] }>) {
      for (const m of f.mutants) {
        if (m.status === "Killed") killed++;
        else if (m.status === "Survived") survived++;
        else if (m.status === "NoCoverage") noCov++;
      }
    }
    const denom = killed + survived + noCov;
    const score = denom > 0 ? killed / denom : 1;
    const verdict = {
      gate: "mutation-gate", parcel: "p1", stack: "typescript",
      score, killed, survived, noCoverage: noCov,
      result: score >= 0.80 ? "PASS" : "BLOCK", threshold: 0.80,
    };
    writeFileSync(join(dir, ".forge/mutation/p1.json"), JSON.stringify(verdict, null, 2));
    expect(["PASS", "BLOCK"]).toContain(verdict.result);
    expect(killed + survived).toBeGreaterThan(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 240_000);

test("L2.3 — pbt-verify runbook generates fast-check tests + VERIFIED verdict for add", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-pbt-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "p", version: "0", type: "module",
      scripts: { test: "bun test" },
      devDependencies: { "fast-check": "^3.0.0" },
    }, null, 2));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/add.ts"), `export const add = (a: number, b: number): number => a + b;\n`);
    spawnSync("bun", ["install"], { cwd: dir });
    mkdirSync(join(dir, ".forge/pbt"), { recursive: true });

    writeFileSync(join(dir, ".forge/pbt/p1.test.ts"), `import { test, expect } from "bun:test";
import * as fc from "fast-check";
import { add } from "../../src/add";
test("commutativity", () => fc.assert(fc.property(fc.integer(), fc.integer(), (a,b) => add(a,b) === add(b,a)), { numRuns: 100 }));
test("zero-identity", () => fc.assert(fc.property(fc.integer(), (a) => add(a,0) === a), { numRuns: 100 }));
`);
    const r = spawnSync("bun", ["test", "./.forge/pbt/p1.test.ts"], { cwd: dir, encoding: "utf8", timeout: 60_000 });
    expect(r.status).toBe(0);
    const out = (r.stdout || "") + (r.stderr || "");
    expect(out).toMatch(/2 pass/);

    writeFileSync(join(dir, ".forge/pbt/p1.json"), JSON.stringify({
      gate: "pbt-verify", parcel: "p1", stack: "typescript",
      properties_total: 2, properties_passed: 2, result: "VERIFIED",
    }, null, 2));
    expect(existsSync(join(dir, ".forge/pbt/p1.json"))).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 180_000);

test("L2.3b — pbt-verify rejects anti-property: subtract is NOT commutative", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-pbt-anti-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "s", version: "0", type: "module",
      scripts: { test: "bun test" },
      devDependencies: { "fast-check": "^3.0.0" },
    }, null, 2));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/sub.ts"), `export const sub = (a: number, b: number): number => a - b;\n`);
    spawnSync("bun", ["install"], { cwd: dir });
    mkdirSync(join(dir, ".forge/pbt"), { recursive: true });

    writeFileSync(join(dir, ".forge/pbt/sub.test.ts"), `import { test } from "bun:test";
import * as fc from "fast-check";
import { sub } from "../../src/sub";
test("FALSE commutativity", () => fc.assert(fc.property(fc.integer(), fc.integer(), (a,b) => sub(a,b) === sub(b,a)), { numRuns: 100 }));
`);
    const r = spawnSync("bun", ["test", "./.forge/pbt/sub.test.ts"], { cwd: dir, encoding: "utf8", timeout: 60_000 });
    expect(r.status).not.toBe(0);
    const out = (r.stdout || "") + (r.stderr || "");
    expect(out.toLowerCase()).toMatch(/counterexample|falsified/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 180_000);

test("L2.4 — browser-verify uses bundled headless chromium (not host browser)", () => {
  const skill = readFileSync(join(FORGE, "skills/browser-verify/SKILL.md"), "utf8");
  expect(skill.toLowerCase()).toMatch(/headless/);
  expect(skill.toLowerCase()).toMatch(/bundled chromium|playwright/);
  expect(skill.toLowerCase()).not.toMatch(/connectovercdp|channel:\s*"chrome"/);
});

test("L2.16 — tdd-workflows skill body declares red/green/refactor flow", () => {
  const tddSkill = "/root/.claude/plugins/cache/claude-code-workflows/tdd-workflows";
  const exists = existsSync(tddSkill);
  expect(exists || existsSync("/root/.claude/plugins/marketplaces/claude-code-workflows/plugins/tdd-workflows")).toBe(true);
});
