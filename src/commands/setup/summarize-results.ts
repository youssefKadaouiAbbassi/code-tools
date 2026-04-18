import * as clack from "@clack/prompts";
import pc from "picocolors";
import type { DetectedEnvironment, InstallResult, VerificationReport } from "../../types.js";

export function formatEnvLine(env: DetectedEnvironment): string {
  const osLabel =
    env.os === "macos"
      ? `macOS (${env.arch})`
      : `Linux${env.linuxDistro ? ` / ${env.linuxDistro}` : ""} (${env.arch})`;

  return [
    `OS:              ${osLabel}`,
    `Shell:           ${env.shell}`,
    `Package manager: ${env.packageManager}`,
    `Claude Code:     ${env.claudeCodeVersion ? `${env.claudeCodeVersion} ${pc.green("✓")}` : pc.yellow("not found")}`,
    `Docker:          ${env.dockerAvailable ? pc.green("available ✓") : pc.yellow("not available")}`,
    `Bun:             ${env.bunVersion ? `${env.bunVersion} ${pc.green("✓")}` : pc.yellow("not found")}`,
  ].join("\n");
}

export function renderLocalScopeSummary(env: DetectedEnvironment, report: VerificationReport): void {
  clack.note(
    `Project-scope install complete in ${env.claudeDir}.\nCategory installers skipped — MCPs/binaries belong at user scope.\nRun without --local to install those globally.`,
    "Local install complete",
  );
  clack.note(
    `Verification: ${pc.green(String(report.passed))} passed, ${report.failed > 0 ? pc.red(String(report.failed)) : pc.dim("0")} failed`,
    "Summary",
  );
}

export function renderInstallSummary(allResults: InstallResult[], report: VerificationReport): void {
  const installed = allResults.filter((r) => r.status === "installed" || r.status === "already-installed").length;
  const skipped = allResults.filter((r) => r.status === "skipped").length;
  const failed = allResults.filter((r) => r.status === "failed");

  const lines: string[] = [
    `Installed: ${pc.green(String(installed))} components`,
    `Skipped:   ${pc.dim(String(skipped))}`,
    `Failed:    ${failed.length > 0 ? pc.red(String(failed.length)) : pc.dim("0")}`,
  ];

  if (failed.length > 0) {
    lines.push("", "Failed components:");
    for (const f of failed) {
      lines.push(`  ${pc.red("•")} ${f.component}: ${pc.dim(f.message)}`);
    }
  }

  lines.push(
    "",
    `Verification: ${pc.green(String(report.passed))} passed, ${report.failed > 0 ? pc.red(String(report.failed)) : pc.dim("0")} failed`,
  );

  clack.note(lines.join("\n"), "Installation summary");
}

export function renderRestartHints(allResults: InstallResult[]): void {
  const claudeHudResult = allResults.find(r => r.component === "Claude HUD");
  if (claudeHudResult && (claudeHudResult.status === "installed" || claudeHudResult.status === "already-installed")) {
    clack.note(
      `${pc.bold("Claude HUD")} is wired into your statusline. ${pc.dim("Quit and relaunch Claude Code to see it.")}`,
      "ℹ️  Restart needed",
    );
  }
}

export function renderManualSteps(allResults: InstallResult[]): void {
  const manualSteps: { name: string; action: string }[] = [];
  for (const r of allResults) {
    if (r.component === "Claude Code Action") {
      manualSteps.push({
        name: "Claude Code Action",
        action: "Add `uses: anthropics/claude-code-action@v1` to a workflow in .github/workflows/ of any repo you want reviewed",
      });
    }
  }

  if (manualSteps.length > 0) {
    clack.note(
      manualSteps.map((s) => `${pc.cyan("•")} ${pc.bold(s.name)}\n  ${s.action}`).join("\n\n"),
      "📝 Manual steps remaining",
    );
  }
}
