import { test as _t, expect } from "bun:test";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
const test = (existsSync("/workspace/forge") && existsSync("/root/.bun/bin")) ? _t : _t.skip;
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTarget, TARGETS } from "../harness/target-repo";

test("L1.1 — Stryker positive: mutation.json with score derivable", () => {
  const t = createTarget(TARGETS.simpleTs());
  try {
    mkdirSync(join(t.path, ".forge", "mutation"), { recursive: true });
    const r = spawnSync("bunx", ["stryker", "run", "--reporters", "json"], { cwd: t.path, encoding: "utf8", timeout: 180_000 });
    const report = join(t.path, ".forge", "mutation", "stryker.json");
    expect(existsSync(report)).toBe(true);
    const data = JSON.parse(readFileSync(report, "utf8"));
    expect(data.files).toBeDefined();
    let total = 0;
    for (const f of Object.values(data.files) as Array<{ mutants: { status: string }[] }>) total += f.mutants.length;
    expect(total).toBeGreaterThan(0);
  } finally { t.cleanup(); }
}, 240_000);

test("L1.1 negative — Stryker on weak tests: Survived > 0, score < 0.80", () => {
  const t = createTarget({
    ...TARGETS.simpleTs(),
    files: {
      ...TARGETS.simpleTs().files,
      "tests/add.test.ts": `import { test, expect } from "bun:test";
import { add } from "../src/add";
test("trivial", () => expect(true).toBe(true));
`,
    },
  });
  try {
    mkdirSync(join(t.path, ".forge", "mutation"), { recursive: true });
    spawnSync("bunx", ["stryker", "run", "--reporters", "json"], { cwd: t.path, encoding: "utf8", timeout: 180_000 });
    const data = JSON.parse(readFileSync(join(t.path, ".forge/mutation/stryker.json"), "utf8"));
    let killed = 0, survived = 0, noCov = 0;
    for (const f of Object.values(data.files) as Array<{ mutants: { status: string }[] }>) {
      for (const m of f.mutants) {
        if (m.status === "Killed") killed++;
        else if (m.status === "Survived") survived++;
        else if (m.status === "NoCoverage") noCov++;
      }
    }
    const denom = killed + survived + noCov;
    const score = denom ? killed / denom : 1;
    expect(survived + noCov).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.80);
  } finally { t.cleanup(); }
}, 240_000);

test("L1.3 — mutmut positive: run reports mutants tested", () => {
  const t = createTarget(TARGETS.simplePy());
  try {
    const run = spawnSync("mutmut", ["run"], { cwd: t.path, encoding: "utf8", timeout: 120_000 });
    const out = (run.stdout || "") + (run.stderr || "");
    expect(out).toMatch(/Running mutation testing|mutations\/second|🎉|🫥|files mutated/);
  } finally { t.cleanup(); }
}, 180_000);

test("L1.4 — cargo-mutants positive: CAUGHT or MISSED reported", () => {
  const t = createTarget(TARGETS.simpleRs());
  try {
    const r = spawnSync("cargo", ["mutants", "--in-place", "--no-shuffle"], { cwd: t.path, encoding: "utf8", timeout: 300_000 });
    const out = (r.stdout || "") + (r.stderr || "");
    expect(out.toLowerCase()).toMatch(/caught|missed|timeout|unviable/);
  } finally { t.cleanup(); }
}, 360_000);
