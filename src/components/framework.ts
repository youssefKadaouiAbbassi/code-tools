import { $ } from "bun";
import type {
  DetectedEnvironment,
  InstallPackage,
  InstallResult,
  McpSpec,
  Tier,
} from "../types.js";
import { appendToShellRc, log, commandExists } from "../utils.js";
import { installBinary } from "../packages.js";
import { registerMcp } from "../registry/mcp.js";

export type ProbeState = {
  present: boolean;
  version?: string;
  meta?: Record<string, unknown>;
};

export type InstallStep =
  | { kind: "binary"; pkg: InstallPackage }
  | { kind: "curl"; script: string; label?: string }
  | { kind: "mcp"; name: string; spec: McpSpec }
  | { kind: "plugin"; name: string; marketplace: string }
  | { kind: "shell-rc"; section: string; lines: string[] };

export type InstallPlan =
  | { kind: "skip"; reason: string }
  | { kind: "install" | "upgrade"; steps: InstallStep[] };

export interface ComponentSpec {
  id: number;
  name: string;
  displayName: string;
  description: string;
  tier: Tier;
  category: string;
  userPrompt?: boolean;
  warningNote?: string;
  requiresDocker?: boolean;
  probe: (env: DetectedEnvironment) => Promise<ProbeState>;
  plan: (env: DetectedEnvironment, state: ProbeState) => InstallPlan;
  install: (
    env: DetectedEnvironment,
    plan: InstallPlan,
    dryRun: boolean,
  ) => Promise<InstallResult>;
  verify: (env: DetectedEnvironment) => Promise<boolean>;
}

export async function runComponent(
  spec: ComponentSpec,
  env: DetectedEnvironment,
  dryRun: boolean,
): Promise<InstallResult> {
  const state = await spec.probe(env);
  const plan = spec.plan(env, state);

  if (plan.kind === "skip") {
    return withWarning(spec, {
      component: spec.displayName,
      status: "skipped",
      message: plan.reason,
      verifyPassed: state.present,
    });
  }

  const result = await spec.install(env, plan, dryRun);

  if (dryRun) return withWarning(spec, result);

  const verified = await spec.verify(env);
  return withWarning(spec, {
    ...result,
    verifyPassed: result.verifyPassed && verified,
  });
}

function withWarning(spec: ComponentSpec, result: InstallResult): InstallResult {
  if (!spec.warningNote) return result;
  return { ...result, message: `${result.message} — note: ${spec.warningNote}` };
}

export async function runStep(
  step: InstallStep,
  env: DetectedEnvironment,
  dryRun: boolean,
): Promise<InstallResult> {
  switch (step.kind) {
    case "binary":
      return installBinary(step.pkg, env, dryRun);

    case "curl": {
      const label = step.label ?? "shell step";
      if (dryRun) {
        log.info(`[dry-run] Would run: ${step.script}`);
        return { component: label, status: "skipped", message: `[dry-run] Would run: ${step.script}`, verifyPassed: false };
      }
      const out = await $`sh -c ${step.script}`.nothrow();
      const ok = out.exitCode === 0;
      return {
        component: label,
        status: ok ? "installed" : "failed",
        message: ok ? `${label}: completed` : `${label}: exited ${out.exitCode}`,
        verifyPassed: ok,
      };
    }

    case "mcp": {
      if (dryRun) {
        log.info(`[dry-run] Would register ${step.name} MCP config`);
        return { component: step.name, status: "skipped", message: `[dry-run] Would register ${step.name} MCP server`, verifyPassed: false };
      }
      const ok = await registerMcp(step.name, step.spec);
      return {
        component: step.name,
        status: ok ? "installed" : "failed",
        message: ok ? `${step.name} MCP registered` : `${step.name} MCP registration failed`,
        verifyPassed: ok,
      };
    }

    case "plugin": {
      if (dryRun) {
        log.info(`[dry-run] Would install ${step.name}@${step.marketplace}`);
        return { component: step.name, status: "skipped", message: `[dry-run] Would install ${step.name}@${step.marketplace}`, verifyPassed: false };
      }
      if (!commandExists("claude")) {
        return { component: step.name, status: "skipped", message: "Claude Code CLI not found", verifyPassed: false };
      }
      const key = `${step.name}@${step.marketplace}`;
      const out = await $`claude plugin install ${key}`.nothrow();
      const ok = out.exitCode === 0;
      return {
        component: step.name,
        status: ok ? "installed" : "failed",
        message: ok ? `${step.name} installed` : `claude plugin install ${key} exited ${out.exitCode}`,
        verifyPassed: ok,
      };
    }

    case "shell-rc": {
      if (dryRun) {
        log.info(`[dry-run] Would append ${step.section} to ${env.shellRcPath}`);
        return { component: step.section, status: "skipped", message: `[dry-run] Would append ${step.section}`, verifyPassed: false };
      }
      await appendToShellRc(env, step.lines, step.section);
      return { component: step.section, status: "installed", message: `${step.section} appended to ${env.shellRcPath}`, verifyPassed: true };
    }
  }
}

export async function runSteps(
  plan: InstallPlan,
  env: DetectedEnvironment,
  dryRun: boolean,
): Promise<InstallResult[]> {
  if (plan.kind === "skip") return [];
  const results: InstallResult[] = [];
  for (const step of plan.steps) {
    results.push(await runStep(step, env, dryRun));
  }
  return results;
}
