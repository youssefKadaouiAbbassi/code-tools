import { test, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runForge } from "../harness/run-forge";

function makeTarget(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-l3-full-"));
  spawnSync("chmod", ["-R", "777", dir]);
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: "t", version: "0", type: "module",
    scripts: { test: "bun test" },
    devDependencies: { "fast-check": "^3.0.0" },
  }, null, 2));
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
  testRunner: "command", commandRunner: { command: "bun test" },
  reporters: ["json"], jsonReporter: { fileName: ".forge/mutation/p1-stryker.json" },
  mutate: ["src/**/*.ts", "!src/**/*.test.ts"], thresholds: { high: 80, low: 60, break: 80 },
};
`);
  spawnSync("bun", ["install"], { cwd: dir });
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  spawnSync("chown", ["-R", "forge:forge", dir]);
  return dir;
}

test("L3.1+3+4+5+6 — full /forge:forge produces dag, council, kind, gate verdicts, receipts", async () => {
  const dir = makeTarget();
  try {
    const r = await runForge(
      "add subtract(a: number, b: number): number alongside add. Run plan + research + council + code + verify phases. Skip ship phase (do NOT open a PR).",
      dir,
      25 * 60_000,
    );

    if (!existsSync(join(dir, ".forge"))) {
      throw new Error(`no .forge/ produced after ${r.durationMs}ms.\nexit:${r.exitCode}\nstdout:${r.stdout.slice(0, 3000)}`);
    }

    expect(existsSync(join(dir, ".forge/dag.json"))).toBe(true);
    const dag = JSON.parse(readFileSync(join(dir, ".forge/dag.json"), "utf8"));
    expect(Array.isArray(dag.parcels)).toBe(true);
    expect(dag.parcels.length).toBeGreaterThanOrEqual(1);

    const subtractCreated = existsSync(join(dir, "src/subtract.ts"));
    if (subtractCreated) {
      const src = readFileSync(join(dir, "src/subtract.ts"), "utf8");
      expect(src).toMatch(/subtract|export/);
    }

    const forgeFiles = readdirSync(join(dir, ".forge"));
    const expectedDirs = ["council", "kind", "mutation", "pbt"];
    const present = expectedDirs.filter((d) => forgeFiles.includes(d));
    expect(present.length).toBeGreaterThanOrEqual(2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.full-ui-strict — ui parcel populates dag, audit, council×6+meta-judge, kind=ui, mutation, browser", async () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-l3-full-ui-"));
  spawnSync("chmod", ["-R", "777", dir]);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t", version: "0", type: "module", scripts: { test: "bun test" } }, null, 2));
  mkdirSync(join(dir, "src")); mkdirSync(join(dir, "components")); mkdirSync(join(dir, "tests"));
  writeFileSync(join(dir, "components/Button.tsx"), `import React from "react";\nexport function Button({ label, onClick }: { label: string; onClick: () => void }) {\n  return <button onClick={onClick}>{label}</button>;\n}\n`);
  spawnSync("bun", ["install"], { cwd: dir });
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  spawnSync("chown", ["-R", "forge:forge", dir]);
  try {
    await runForge(
      "Add a TextInput component at components/TextInput.tsx alongside Button. It accepts value + onChange props and renders an <input type='text' />. Run plan + research + council + code + verify phases. Skip ship phase only.",
      dir, 28 * 60_000,
    );
    expect(existsSync(join(dir, ".forge/dag.json"))).toBe(true);
    expect(existsSync(join(dir, ".forge/audit/tool-trace.jsonl"))).toBe(true);
    const councilDir = join(dir, ".forge/council");
    const personaFiles = existsSync(councilDir) ? readdirSync(councilDir).filter((f) => f.endsWith(".json") && !/meta-?judge/i.test(f)) : [];
    if (personaFiles.length < 6) throw new Error(`council partial: only ${personaFiles.length}/6 personas`);
    const kindDir = join(dir, ".forge/kind");
    const kindFiles = existsSync(kindDir) ? readdirSync(kindDir).filter((f) => f.endsWith(".txt")) : [];
    if (kindFiles.length === 0) throw new Error(`no kind/<parcel>.txt`);
    const kind = readFileSync(join(kindDir, kindFiles[0]), "utf8").trim();
    if (!/ui/i.test(kind)) throw new Error(`expected ui, got: ${kind}`);
    const mutationCount = existsSync(join(dir, ".forge/mutation")) ? readdirSync(join(dir, ".forge/mutation")).filter((f) => f.endsWith(".json")).length : 0;
    if (mutationCount === 0) throw new Error(`ui parcel but mutation gate skipped`);
    const browserCount = existsSync(join(dir, ".forge/browser")) ? readdirSync(join(dir, ".forge/browser")).filter((f) => f.endsWith(".json") || f.endsWith(".proofshot")).length : 0;
    if (browserCount === 0) throw new Error(`ui parcel but browser-verify skipped`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 32 * 60_000);

test("L3.full-io-strict — io parcel populates dag, audit, council×6+meta-judge, kind, mutation, NO browser", async () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-l3-full-io-"));
  spawnSync("chmod", ["-R", "777", dir]);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t", version: "0", type: "module", scripts: { test: "bun test" } }, null, 2));
  mkdirSync(join(dir, "src")); mkdirSync(join(dir, "tests"));
  writeFileSync(join(dir, "src/io.ts"), `export async function readFileLines(path: string): Promise<string[]> { const f = Bun.file(path); return (await f.text()).split("\\n"); }\n`);
  writeFileSync(join(dir, "tests/io.test.ts"), `import { test, expect } from "bun:test";\nimport { readFileLines } from "../src/io";\nimport { writeFileSync, unlinkSync } from "node:fs";\ntest("reads lines", async () => { const p = "/tmp/forge-io-test-x.txt"; writeFileSync(p, "a\\nb"); try { const r = await readFileLines(p); expect(r).toEqual(["a","b"]); } finally { unlinkSync(p); } });\n`);
  spawnSync("bun", ["install"], { cwd: dir });
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  spawnSync("chown", ["-R", "forge:forge", dir]);
  try {
    await runForge(
      "Add an async function at src/io.ts that writes a file with given content. Run plan + research + council + code + verify phases. Skip ship phase only.",
      dir, 28 * 60_000,
    );
    expect(existsSync(join(dir, ".forge/dag.json"))).toBe(true);
    expect(existsSync(join(dir, ".forge/audit/tool-trace.jsonl"))).toBe(true);
    const councilDir = join(dir, ".forge/council");
    const personaFiles = existsSync(councilDir) ? readdirSync(councilDir).filter((f) => f.endsWith(".json") && !/meta-?judge/i.test(f)) : [];
    if (personaFiles.length < 6) throw new Error(`council partial: only ${personaFiles.length}/6 personas`);
    const kindDir = join(dir, ".forge/kind");
    const kindFiles = existsSync(kindDir) ? readdirSync(kindDir).filter((f) => f.endsWith(".txt")) : [];
    if (kindFiles.length === 0) throw new Error(`no kind/<parcel>.txt`);
    const kind = readFileSync(join(kindDir, kindFiles[0]), "utf8").trim();
    if (!/io|pure-?fn/i.test(kind)) throw new Error(`expected io or pure-fn, got: ${kind}`);
    const mutationCount = existsSync(join(dir, ".forge/mutation")) ? readdirSync(join(dir, ".forge/mutation")).filter((f) => f.endsWith(".json")).length : 0;
    if (mutationCount === 0) throw new Error(`io parcel but mutation gate skipped`);
    const browserCount = existsSync(join(dir, ".forge/browser")) ? readdirSync(join(dir, ".forge/browser")).filter((f) => f.endsWith(".json") || f.endsWith(".proofshot")).length : 0;
    if (browserCount > 0) throw new Error(`io parcel produced browser artifacts (${browserCount}); browser should be skipped for io`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 32 * 60_000);

test("L3.full-strict — pure-fn parcel populates ALL artifacts (dag, audit, council×6+meta-judge, kind, mutation, pbt)", async () => {
  const dir = makeTarget();
  try {
    await runForge(
      "Add subtract(a: number, b: number): number alongside add. Run plan + research + council + code + verify phases. Skip ship phase only.",
      dir,
      28 * 60_000,
    );

    expect(existsSync(join(dir, ".forge/dag.json"))).toBe(true);
    expect(existsSync(join(dir, ".forge/audit/tool-trace.jsonl"))).toBe(true);

    const councilDir = join(dir, ".forge/council");
    expect(existsSync(councilDir)).toBe(true);
    const personaFiles = readdirSync(councilDir).filter((f) => f.endsWith(".json") && !/meta-?judge/i.test(f));
    if (personaFiles.length < 6) throw new Error(`council partial: only ${personaFiles.length}/6 personas. files: ${personaFiles.join(",")}`);
    const hasMetaJudge = readdirSync(councilDir).some((f) => /meta-?judge/i.test(f));
    expect(hasMetaJudge).toBe(true);

    const kindDir = join(dir, ".forge/kind");
    if (!existsSync(kindDir)) throw new Error(`kind/ missing — derive-kind skipped`);
    const kindFiles = readdirSync(kindDir).filter((f) => f.endsWith(".txt"));
    if (kindFiles.length === 0) throw new Error(`no kind/<parcel>.txt`);
    const kind = readFileSync(join(kindDir, kindFiles[0]), "utf8").trim();

    const isPurefn = /pure-?fn/i.test(kind);
    if (isPurefn) {
      const mutationDir = join(dir, ".forge/mutation");
      const pbtDir = join(dir, ".forge/pbt");
      const mutationCount = existsSync(mutationDir) ? readdirSync(mutationDir).filter((f) => f.endsWith(".json")).length : 0;
      const pbtCount = existsSync(pbtDir) ? readdirSync(pbtDir).filter((f) => f.endsWith(".json")).length : 0;
      if (mutationCount === 0) throw new Error(`pure-fn parcel but mutation gate skipped (no .forge/mutation/*.json)`);
      if (pbtCount === 0) throw new Error(`pure-fn parcel but pbt-verify skipped (no .forge/pbt/*.json)`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 32 * 60_000);
