import type { Component, ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import type { ComponentSpec } from "./framework.js";
import { runComponent } from "./framework.js";

import { codeIntelCategory, codeIntelSpecs } from "./code-intel.js";
import { browserWebCategory, browserWebSpecs } from "./browser-web.js";
import { memoryContextCategory, memoryContextSpecs } from "./memory-context.js";
import { securityCategory, securitySpecs } from "./security.js";
import { githubCategory, githubSpecs } from "./github.js";
import { workstationCategory, buildWorkstationSpecs } from "./workstation.js";
import { ccPluginsCategory } from "./cc-plugins.js";
import { workflowCategory, workflowSpecs } from "./workflow.js";
import { skillsRegistryCategory } from "./skills-registry.js";
import { trailofbitsCategory } from "./trailofbits.js";

export const RECOMMENDED_CATEGORIES: ComponentCategory[] = [
  codeIntelCategory,
  browserWebCategory,
  memoryContextCategory,
  ccPluginsCategory,
  skillsRegistryCategory,
  securityCategory,
  githubCategory,
  workstationCategory,
];

export const OPTIONAL_CATEGORIES: ComponentCategory[] = [
  workflowCategory,
  trailofbitsCategory,
];

export const ALL_CATEGORIES: ComponentCategory[] = [
  ...RECOMMENDED_CATEGORIES,
  ...OPTIONAL_CATEGORIES,
];

export function getComponentById(id: number): Component | undefined {
  for (const category of ALL_CATEGORIES) {
    const found = category.components.find((c) => c.id === id);
    if (found) return found;
  }
  return undefined;
}

export function getCategoryById(id: string): ComponentCategory | undefined {
  return ALL_CATEGORIES.find((c) => c.id === id);
}

function specsFor(categoryId: string, skipped: Set<number>): ComponentSpec[] | null {
  switch (categoryId) {
    case "code-intel": return codeIntelSpecs;
    case "browser-web": return browserWebSpecs;
    case "memory-context": return memoryContextSpecs;
    case "security": return securitySpecs;
    case "github": return githubSpecs;
    case "workstation": return buildWorkstationSpecs(skipped);
    case "workflow": return workflowSpecs;
    default: return null;
  }
}

export async function installCategory(
  category: ComponentCategory,
  env: DetectedEnvironment,
  dryRun: boolean,
  skippedComponents: Set<number> = new Set(),
): Promise<InstallResult[]> {
  if (category.id === "cc-plugins") {
    const { install } = await import("./cc-plugins.js");
    return install(env, dryRun);
  }
  if (category.id === "trailofbits") {
    const { install } = await import("./trailofbits.js");
    return install(env, dryRun);
  }
  if (category.id === "skills-registry") {
    const { install } = await import("./skills-registry.js");
    return install(env, dryRun);
  }

  const specs = specsFor(category.id, skippedComponents);
  if (!specs) {
    return [{
      component: category.name,
      status: "failed",
      message: `Unknown category: ${category.id}`,
      verifyPassed: false,
    }];
  }

  const results: InstallResult[] = [];
  for (const spec of specs) {
    results.push(await runComponent(spec, env, dryRun));
  }
  return results;
}
