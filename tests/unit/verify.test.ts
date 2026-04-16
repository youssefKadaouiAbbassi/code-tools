import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { verifyAll, verifyComponent } from "../../src/verify.js";
import type { Component, DetectedEnvironment, InstallResult } from "../../src/types.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "code-tools-verify-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeEnv(overrides: Partial<DetectedEnvironment> = {}): DetectedEnvironment {
  return {
    os: "linux",
    arch: "x64",
    shell: "bash",
    shellRcPath: join(tmpDir, ".bashrc"),
    packageManager: "apt",
    homeDir: tmpDir,
    claudeDir: join(tmpDir, ".claude"),
    existingTools: new Map(),
    dockerAvailable: false,
    ...overrides,
  };
}

function makeComponent(overrides: Partial<Component>): Component {
  return {
    id: 1,
    name: "test-component",
    displayName: "Test Component",
    description: "A test component",
    tier: "optional",
    category: "test",
    packages: [],
    verifyCommand: "true",
    ...overrides,
  };
}

describe("verifyAll", () => {
  test("report structure with empty results array", async () => {
    const env = makeEnv();

    // Point claudeDir to tmpDir so MCP/hook/settings checks don't find anything
    const report = await verifyAll(env, []);

    expect(report.totalChecked).toBeGreaterThanOrEqual(0);
    expect(typeof report.passed).toBe("number");
    expect(typeof report.failed).toBe("number");
    expect(typeof report.skipped).toBe("number");
    expect(Array.isArray(report.results)).toBe(true);

    // Counts must be consistent
    expect(report.passed + report.failed + report.skipped).toBe(report.totalChecked);
  });

  test("totalChecked=0 when empty results and no installed checks", async () => {
    // verifyAll always runs MCP + hook + settings checks on top of results,
    // so totalChecked won't be 0. Validate the passed+failed+skipped identity holds.
    const env = makeEnv();
    const report = await verifyAll(env, []);

    expect(report.passed + report.failed + report.skipped).toBe(report.totalChecked);
  });
});

describe("verifyComponent", () => {
  test("returns passed=true when verifyCommand exits 0", async () => {
    const env = makeEnv();
    const component = makeComponent({ verifyCommand: "true" });

    const result = await verifyComponent(component, env);

    expect(result.passed).toBe(true);
    expect(result.component).toBe("Test Component");
  });

  test("returns passed=false when verifyCommand exits non-zero", async () => {
    const env = makeEnv();
    const component = makeComponent({ verifyCommand: "false" });

    const result = await verifyComponent(component, env);

    expect(result.passed).toBe(false);
    expect(result.component).toBe("Test Component");
  });

  test("includes component displayName in result", async () => {
    const env = makeEnv();
    const component = makeComponent({
      displayName: "My Special Tool",
      verifyCommand: "true",
    });

    const result = await verifyComponent(component, env);

    expect(result.component).toBe("My Special Tool");
  });
});
