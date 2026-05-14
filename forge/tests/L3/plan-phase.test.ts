import { test as _t, expect } from "bun:test";
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
const test = (existsSync("/workspace/forge") && existsSync("/root/.bun/bin")) ? _t : _t.skip;
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runForge } from "../harness/run-forge";

function makeAddTarget(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-l3-plan-"));
  spawnSync("chmod", ["-R", "777", dir]);
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: "t", version: "0", type: "module",
    scripts: { test: "bun test" },
    devDependencies: { "fast-check": "^3.0.0" },
  }, null, 2));
  spawnSync("mkdir", ["-p", join(dir, "src"), join(dir, "tests")]);
  writeFileSync(join(dir, "src/add.ts"), `export const add = (a: number, b: number): number => a + b;\n`);
  writeFileSync(join(dir, "tests/add.test.ts"), `import { test, expect } from "bun:test";
import { add } from "../src/add";
test("a", () => expect(add(2,3)).toBe(5));
test("b", () => expect(add(7,0)).toBe(7));
test("c", () => expect(add(-1,-2)).toBe(-3));
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

test("L3.1 — /forge:forge plan phase writes .forge/dag.json with parcels[]", async () => {
  const dir = makeAddTarget();
  try {
    const r = await runForge(
      "add subtract(a: number, b: number): number alongside add. STOP after producing .forge/dag.json — do NOT run code, council, or verify phases. Do NOT open a PR.",
      dir,
      8 * 60_000,
    );
    if (!existsSync(join(dir, ".forge/dag.json"))) {
      throw new Error(`no .forge/dag.json produced after ${r.durationMs}ms.\nexit: ${r.exitCode}\nstdout: ${r.stdout.slice(0, 4000)}\nstderr: ${r.stderr.slice(0, 1500)}`);
    }
    expect(r.exitCode).toBe(0);
    const dagPath = join(dir, ".forge/dag.json");
    expect(existsSync(dagPath)).toBe(true);
    const dag = JSON.parse(readFileSync(dagPath, "utf8"));
    expect(Array.isArray(dag.parcels)).toBe(true);
    expect(dag.parcels.length).toBeGreaterThanOrEqual(1);
    for (const p of dag.parcels) {
      const claim = p.claim ?? p.description ?? p.title ?? p.summary ?? p.text;
      const paths = p.paths ?? p.files ?? p.targets ?? [];
      if (typeof claim !== "string" || claim.length < 5) {
        throw new Error(`parcel missing claim/description: ${JSON.stringify(p, null, 2)}`);
      }
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(Array.isArray(paths)).toBe(true);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 10 * 60_000);
