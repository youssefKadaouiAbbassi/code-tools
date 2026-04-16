import pc from "picocolors";
import type { ComponentCategory, DetectedEnvironment, VerificationResult } from "./types.js";

const COL_COMPONENT = 36;
const COL_STATUS = 12;

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function statusLabel(passed: boolean, message: string): string {
  if (message.startsWith("Skipped:")) {
    return pc.yellow("SKIPPED");
  }
  return passed ? pc.green("PASSED") : pc.red("FAILED");
}

export function formatStatusTable(results: VerificationResult[]): string {
  const header =
    pc.bold(padEnd("Component", COL_COMPONENT)) +
    pc.bold(padEnd("Status", COL_STATUS)) +
    pc.bold("Details");

  const separator = "─".repeat(COL_COMPONENT + COL_STATUS + 40);

  const rows = results.map((r) => {
    const component = padEnd(r.component, COL_COMPONENT);
    const status = padEnd(statusLabel(r.passed, r.message), COL_STATUS);
    const details = r.details
      ? pc.gray(r.details)
      : r.passed
      ? pc.gray(r.message)
      : pc.red(r.message);
    return component + status + details;
  });

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed && !r.message.startsWith("Skipped:")).length;
  const skippedCount = results.filter((r) => r.message.startsWith("Skipped:")).length;

  const summary = [
    "",
    pc.green(`✓ ${passedCount} passed`) +
      "  " +
      pc.red(`✗ ${failedCount} failed`) +
      "  " +
      pc.yellow(`○ ${skippedCount} skipped`),
  ].join("\n");

  return [header, separator, ...rows, summary].join("\n");
}

export function showStatus(
  env: DetectedEnvironment,
  categories: ComponentCategory[]
): void {
  console.log("\n" + pc.bold(pc.cyan("Code-Tools Installation Status")));
  console.log(pc.gray(`Claude dir: ${env.claudeDir}`));
  console.log();

  for (const category of categories) {
    console.log(pc.bold(`  ${category.name}`));

    const results: VerificationResult[] = category.components.map((component) => {
      const installed = env.existingTools.has(component.name);
      return {
        component: component.displayName,
        passed: installed,
        message: installed
          ? `${component.displayName} is installed`
          : `${component.displayName} is not installed`,
        details: installed ? env.existingTools.get(component.name) : undefined,
      };
    });

    const lines = results.map((r) => {
      const icon = r.passed ? pc.green("✓") : pc.red("✗");
      const name = padEnd(r.component, COL_COMPONENT - 2);
      const detail = r.details ? pc.gray(`  ${r.details}`) : "";
      return `    ${icon} ${name}${detail}`;
    });

    console.log(lines.join("\n"));
    console.log();
  }
}
