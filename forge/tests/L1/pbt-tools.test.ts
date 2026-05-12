import { test, expect } from "bun:test";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTarget, TARGETS } from "../harness/target-repo";

test("L1.2 — fast-check positive: 3 properties pass on add()", () => {
  const t = createTarget(TARGETS.simpleTs());
  try {
    mkdirSync(join(t.path, ".forge/pbt"), { recursive: true });
    writeFileSync(join(t.path, ".forge/pbt/add.test.ts"), `import { test, expect } from "bun:test";
import * as fc from "fast-check";
import { add } from "../../src/add";
test("commutativity", () => fc.assert(fc.property(fc.integer(), fc.integer(), (a,b) => add(a,b) === add(b,a)), { numRuns: 100 }));
test("zero-identity", () => fc.assert(fc.property(fc.integer(), (a) => add(a,0) === a), { numRuns: 100 }));
test("associativity", () => fc.assert(fc.property(fc.integer(), fc.integer(), fc.integer(), (a,b,c) => add(add(a,b),c) === add(a,add(b,c))), { numRuns: 100 }));
`);
    const r = spawnSync("bun", ["test", "./.forge/pbt/add.test.ts"], { cwd: t.path, encoding: "utf8", timeout: 60_000 });
    expect(r.status).toBe(0);
    const out = (r.stdout || "") + (r.stderr || "");
    expect(out).toMatch(/3 pass/);
  } finally { t.cleanup(); }
}, 120_000);

test("L1.2 negative — fast-check on subtract commutativity: counterexample emitted (shrunk)", () => {
  const t = createTarget({
    name: "sub", install: true,
    files: {
      "package.json": JSON.stringify({
        name: "sub", version: "0", type: "module",
        scripts: { test: "bun test" },
        devDependencies: { "fast-check": "^3.0.0" },
      }, null, 2),
      "src/sub.ts": `export const sub = (a: number, b: number): number => a - b;\n`,
      "tests/false.test.ts": `import { test } from "bun:test";
import * as fc from "fast-check";
import { sub } from "../src/sub";
test("commutativity (FALSE)", () => fc.assert(fc.property(fc.integer(), fc.integer(), (a,b) => sub(a,b) === sub(b,a)), { numRuns: 100 }));
`,
    },
  });
  try {
    const r = spawnSync("bun", ["test", "tests/false.test.ts"], { cwd: t.path, encoding: "utf8", timeout: 60_000 });
    expect(r.status).not.toBe(0);
    const out = (r.stdout || "") + (r.stderr || "");
    expect(out.toLowerCase()).toMatch(/counterexample|falsified/);
  } finally { t.cleanup(); }
}, 120_000);

test("L1.5 — Hypothesis positive: 1 passed on add commutativity", () => {
  const t = createTarget(TARGETS.simplePy());
  try {
    writeFileSync(join(t.path, "test_pbt.py"), `from hypothesis import given, strategies as st
from add import add

@given(st.integers(), st.integers())
def test_commutativity(a, b):
    assert add(a, b) == add(b, a)
`);
    const r = spawnSync("python3", ["-m", "pytest", "test_pbt.py", "-q"], { cwd: t.path, encoding: "utf8", timeout: 60_000 });
    expect(r.status).toBe(0);
    expect((r.stdout || "")).toMatch(/passed/);
  } finally { t.cleanup(); }
}, 120_000);

test("L1.5 negative — Hypothesis on subtract commutativity: Falsifying example", () => {
  const t = createTarget({
    name: "sub-py",
    files: {
      "sub.py": "def sub(a,b): return a-b\n",
      "test_false.py": `from hypothesis import given, strategies as st
from sub import sub

@given(st.integers(), st.integers())
def test_commutativity(a, b):
    assert sub(a, b) == sub(b, a)
`,
    },
  });
  try {
    const r = spawnSync("python3", ["-m", "pytest", "test_false.py", "-q"], { cwd: t.path, encoding: "utf8", timeout: 60_000 });
    expect(r.status).not.toBe(0);
    expect((r.stdout || "") + (r.stderr || "")).toMatch(/Falsifying example/i);
  } finally { t.cleanup(); }
}, 120_000);
