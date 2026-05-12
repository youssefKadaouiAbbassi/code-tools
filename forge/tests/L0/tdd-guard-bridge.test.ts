import { test, expect } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const FORGE_DIR = resolve(import.meta.dir, "..", "..");
const SCRIPT = join(FORGE_DIR, "scripts", "tdd-guard-bun-reporter.ts");

test("L0.bridge-1 — tdd-guard-bun-reporter script exists at forge/scripts/", () => {
  expect(existsSync(SCRIPT)).toBe(true);
});

test("L0.bridge-2 — bridge converts Bun JUnit XML with passing + failing testcases into tdd-guard JSON schema", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-bridge-"));
  try {
    const junitXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="2" failures="1">
  <testsuite name="tests/sample.test.ts" tests="2" failures="1">
    <testcase name="passing thing" classname="" time="0.001" assertions="1"/>
    <testcase name="failing thing" classname="" time="0.001" assertions="1">
      <failure type="AssertionError" />
    </testcase>
  </testsuite>
</testsuites>`;
    const xmlPath = join(dir, "junit.xml");
    writeFileSync(xmlPath, junitXml, "utf8");
    const r = spawnSync("bun", [SCRIPT, xmlPath, dir], { encoding: "utf8", timeout: 10_000 });
    expect(r.status).toBe(0);
    const testJsonPath = join(dir, ".claude", "tdd-guard", "data", "test.json");
    expect(existsSync(testJsonPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(testJsonPath, "utf8"));
    expect(Array.isArray(parsed.testModules)).toBe(true);
    expect(parsed.testModules.length).toBe(1);
    expect(parsed.testModules[0].tests.length).toBe(2);
    const states = parsed.testModules[0].tests.map((t: { state: string }) => t.state);
    expect(states).toContain("passed");
    expect(states).toContain("failed");
    expect(parsed.reason).toBe("failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
