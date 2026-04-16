import { $ } from "bun";
import { stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Component, DetectedEnvironment, InstallResult, VerificationReport, VerificationResult } from "./types.js";

// MCP servers we expect to be configured (matches what our installer registers).
// Empty list = skip the legacy hardcoded MCP check; per-install results already
// surface the actual MCP registration status from each component.
const MCP_SERVER_NAMES: string[] = [];

// Hooks actually deployed by the primordial installer (configs/hooks/).
const HOOK_FILES = [
  "pre-secrets-guard.sh",
  "pre-destructive-blocker.sh",
  "post-lint-gate.sh",
  "session-start.sh",
  "session-end.sh",
  "stop-summary.sh",
];

export async function verifyComponent(
  component: Component,
  env: DetectedEnvironment
): Promise<VerificationResult> {
  try {
    await $`sh -c ${component.verifyCommand}`.quiet();
    return {
      component: component.displayName,
      passed: true,
      message: `${component.displayName} verification passed`,
    };
  } catch (error) {
    return {
      component: component.displayName,
      passed: false,
      message: `${component.displayName} verification failed`,
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function verifyMCPServers(
  _env: DetectedEnvironment
): Promise<VerificationResult[]> {
  if (MCP_SERVER_NAMES.length === 0) return [];

  const result = await $`claude mcp list`.quiet().nothrow();
  if (result.exitCode !== 0) {
    return MCP_SERVER_NAMES.map((name) => ({
      component: `MCP: ${name}`,
      passed: false,
      message: `\`claude mcp list\` exited ${result.exitCode} — Claude CLI issue, not an MCP problem`,
      details: result.stderr.toString().slice(0, 500) || undefined,
    }));
  }
  const listed = result.text();

  return MCP_SERVER_NAMES.map((name) => {
    const connected = new RegExp(`^${name}:.*✓ Connected`, "m").test(listed);
    const present = new RegExp(`^${name}:`, "m").test(listed);
    return {
      component: `MCP: ${name}`,
      passed: connected,
      message: connected
        ? `MCP "${name}" connected`
        : present
          ? `MCP "${name}" registered but not connected`
          : `MCP "${name}" not registered`,
    };
  });
}

export async function verifyHooks(
  env: DetectedEnvironment
): Promise<VerificationResult[]> {
  const hooksDir = join(env.claudeDir, "hooks");

  let existingFiles: string[] = [];
  try {
    existingFiles = await readdir(hooksDir);
  } catch {
    return HOOK_FILES.map((file) => ({
      component: `Hook: ${file}`,
      passed: false,
      message: `Hooks directory not found: ${hooksDir}`,
    }));
  }

  const results: VerificationResult[] = [];

  for (const file of HOOK_FILES) {
    const filePath = join(hooksDir, file);

    if (!existingFiles.includes(file)) {
      results.push({
        component: `Hook: ${file}`,
        passed: false,
        message: `Hook file not found: ${file}`,
        details: filePath,
      });
      continue;
    }

    try {
      const fileStat = await stat(filePath);
      const mode = fileStat.mode;
      // Check executable bit for owner (0o100), group (0o010), or other (0o001)
      const isExecutable = (mode & 0o111) !== 0;
      results.push({
        component: `Hook: ${file}`,
        passed: isExecutable,
        message: isExecutable
          ? `Hook ${file} exists and is executable`
          : `Hook ${file} exists but is not executable`,
        details: isExecutable ? undefined : `chmod +x ${filePath}`,
      });
    } catch (error) {
      results.push({
        component: `Hook: ${file}`,
        passed: false,
        message: `Could not stat hook file: ${file}`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

export async function verifySettings(
  env: DetectedEnvironment
): Promise<VerificationResult> {
  const settingsPath = join(env.claudeDir, "settings.json");

  try {
    const settings = await Bun.file(settingsPath).json() as Record<string, unknown>;
    const permissions = settings.permissions as Record<string, unknown> | undefined;
    const deny = permissions?.deny;

    if (!Array.isArray(deny)) {
      return {
        component: "Settings: permissions.deny",
        passed: false,
        message: "settings.json is missing permissions.deny array",
        details: settingsPath,
      };
    }

    const count = deny.length;
    const passed = count >= 30;
    return {
      component: "Settings: permissions.deny",
      passed,
      message: passed
        ? `permissions.deny has ${count} entries`
        : `permissions.deny has only ${count} entries (expected 30+)`,
      details: passed ? undefined : `Found ${count} rules in ${settingsPath}`,
    };
  } catch (error) {
    return {
      component: "Settings: permissions.deny",
      passed: false,
      message: "Could not read settings.json",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function verifyAll(
  env: DetectedEnvironment,
  results: InstallResult[]
): Promise<VerificationReport> {
  const verificationResults: VerificationResult[] = [];

  // Verify each installed component by name (map install results to simple pass/fail)
  for (const result of results) {
    if (result.status === "skipped") {
      verificationResults.push({
        component: result.component,
        passed: false,
        message: `Skipped: ${result.message}`,
      });
    } else {
      verificationResults.push({
        component: result.component,
        passed: result.verifyPassed,
        message: result.message,
      });
    }
  }

  // MCP server checks
  const mcpResults = await verifyMCPServers(env);
  verificationResults.push(...mcpResults);

  // Hook file checks
  const hookResults = await verifyHooks(env);
  verificationResults.push(...hookResults);

  // Settings checks
  const settingsResult = await verifySettings(env);
  verificationResults.push(settingsResult);

  const passed = verificationResults.filter((r) => r.passed).length;
  const skipped = verificationResults.filter(
    (r) => !r.passed && r.message.startsWith("Skipped:")
  ).length;
  const failed = verificationResults.length - passed - skipped;

  return {
    totalChecked: verificationResults.length,
    passed,
    failed,
    skipped,
    results: verificationResults,
  };
}
