import { test as _t, expect } from "bun:test";
import { existsSync as _exists } from "node:fs";
const test = (_exists("/workspace/forge") && _exists("/root/.bun/bin")) ? _t : _t.skip;
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("L1.11 — Opengrep flags eval(userInput) with explicit JS rule", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-grep-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/bad.js"), `export function risky(input) { return eval(input); }\n`);
    writeFileSync(join(dir, "rules.yml"), `rules:
  - id: js-eval-injection
    pattern: eval($X)
    message: eval() with user input is dangerous
    languages: [javascript]
    severity: ERROR
`);
    const r = spawnSync("opengrep", ["scan", "--config", "rules.yml", "--json", "src/"], { cwd: dir, encoding: "utf8", timeout: 60_000 });
    const out = r.stdout || "";
    expect(out.length).toBeGreaterThan(0);
    const json = JSON.parse(out);
    expect(Array.isArray(json.results)).toBe(true);
    expect(json.results.length).toBeGreaterThan(0);
    expect(json.results[0].check_id).toContain("eval");
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 120_000);

test("L1.13 — Syft SBOM produced and parseable", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-syft-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "t", version: "0",
      dependencies: { "lodash": "4.17.21" },
    }));
    const r = spawnSync("syft", ["dir:.", "-o", "cyclonedx-json"], { cwd: dir, encoding: "utf8", timeout: 60_000 });
    expect(r.status).toBe(0);
    expect((r.stdout || "").length).toBeGreaterThan(100);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 120_000);
