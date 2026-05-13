import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface TargetSpec {
  name: string;
  files: Record<string, string>;
  commit?: boolean;
  install?: boolean;
}

export interface TargetRepo {
  path: string;
  cleanup: () => void;
}

export function createTarget(spec: TargetSpec): TargetRepo {
  const root = mkdtempSync(join(tmpdir(), `forge-target-${spec.name}-`));
  for (const [rel, content] of Object.entries(spec.files)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  if (spec.commit !== false) {
    spawnSync("git", ["init", "-b", "main"], { cwd: root });
    spawnSync("git", ["config", "user.email", "forge-test@local"], { cwd: root });
    spawnSync("git", ["config", "user.name", "forge-test"], { cwd: root });
    spawnSync("git", ["add", "-A"], { cwd: root });
    spawnSync("git", ["commit", "-m", "initial"], { cwd: root });
  }
  if (spec.install) spawnSync("bun", ["install"], { cwd: root });
  return { path: root, cleanup: () => { try { rmSync(root, { recursive: true, force: true }); } catch {} } };
}

export const TARGETS = {
  simpleTs: (): TargetSpec => ({
    name: "simple-ts",
    install: true,
    files: {
      "package.json": JSON.stringify({
        name: "simple-ts", version: "0", type: "module",
        scripts: { test: "bun test" },
        devDependencies: { "fast-check": "^3.0.0" },
      }, null, 2),
      "src/add.ts": `export const add = (a: number, b: number): number => a + b;\n`,
      "tests/add.test.ts": `import { test, expect } from "bun:test";
import { add } from "../src/add";
test("a", () => expect(add(2,3)).toBe(5));
test("b", () => expect(add(7,0)).toBe(7));
test("c", () => expect(add(-1,-2)).toBe(-3));
`,
      "stryker.conf.mjs": `export default {
  testRunner: "command",
  commandRunner: { command: "bun test" },
  reporters: ["json", "clear-text"],
  jsonReporter: { fileName: ".forge/mutation/stryker.json" },
  mutate: ["src/**/*.ts", "!src/**/*.test.ts"],
  thresholds: { high: 80, low: 60, break: 80 },
};
`,
      "tsconfig.json": JSON.stringify({
        compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, esModuleInterop: true },
        include: ["src", "tests"],
      }, null, 2),
    },
  }),

  simplePy: (): TargetSpec => ({
    name: "simple-py",
    files: {
      "add.py": `def add(a, b):\n    return a + b\n`,
      "test_add.py": `from add import add\n\ndef test_a(): assert add(2,3)==5\ndef test_b(): assert add(7,0)==7\ndef test_c(): assert add(-1,-2)==-3\n`,
      "pyproject.toml": `[tool.mutmut]\npaths_to_mutate = ["add.py"]\nrunner = "python3 -m pytest -x"\n`,
    },
  }),

  simpleRs: (): TargetSpec => ({
    name: "simple-rs",
    files: {
      "Cargo.toml": `[package]\nname = "simple_rs"\nversion = "0.1.0"\nedition = "2021"\n[lib]\npath = "src/lib.rs"\n`,
      "src/lib.rs": `pub fn add(a: i64, b: i64) -> i64 { a + b }\n#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test] fn t1() { assert_eq!(add(2,3), 5); }\n    #[test] fn t2() { assert_eq!(add(7,0), 7); }\n    #[test] fn t3() { assert_eq!(add(-1,-2), -3); }\n}\n`,
    },
  }),

  staticHtml: (): TargetSpec => ({
    name: "static-html",
    files: {
      "package.json": JSON.stringify({ name: "html", version: "0", scripts: { dev: "python3 -m http.server 3457" } }, null, 2),
      "index.html": `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><h1 id="hi">hello</h1><button id="go">click</button><script>document.getElementById("go").addEventListener("click",()=>{document.getElementById("hi").textContent="clicked";});</script></body></html>\n`,
    },
  }),
};
