import type { Component, ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";

// --- Category imports ---
import { codeIntelCategory } from "./code-intel.js";
import { browserWebCategory } from "./browser-web.js";
import { memoryContextCategory } from "./memory-context.js";
import { securityCategory } from "./security.js";
import { githubCategory } from "./github.js";
import { workstationCategory } from "./workstation.js";
import { ccPluginsCategory } from "./cc-plugins.js";
import { orchestrationCategory } from "./orchestration.js";
import { workflowCategory } from "./workflow.js";
import { skillsRegistryCategory } from "./skills-registry.js";
import { trailofbitsCategory } from "./trailofbits.js";

// --- Exported category lists ---

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
  orchestrationCategory,
  workflowCategory,
  trailofbitsCategory,
];

export const ALL_CATEGORIES: ComponentCategory[] = [
  ...RECOMMENDED_CATEGORIES,
  ...OPTIONAL_CATEGORIES,
];

// --- Lookup helpers ---

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

// --- Dynamic install dispatcher ---

export async function installCategory(
  category: ComponentCategory,
  env: DetectedEnvironment,
  dryRun: boolean,
  skippedComponents: Set<number> = new Set()
): Promise<InstallResult[]> {
  switch (category.id) {
    case "code-intel": {
      const { install } = await import("./code-intel.js");
      return install(env, dryRun);
    }
    case "browser-web": {
      const { install } = await import("./browser-web.js");
      return install(env, dryRun);
    }
    case "memory-context": {
      const { install } = await import("./memory-context.js");
      return install(env, dryRun);
    }
    case "cc-plugins": {
      const { install } = await import("./cc-plugins.js");
      return install(env, dryRun);
    }
    case "skills-registry": {
      const { install } = await import("./skills-registry.js");
      return install(env, dryRun);
    }
    case "security": {
      const { install } = await import("./security.js");
      return install(env, dryRun);
    }
    case "github": {
      const { install } = await import("./github.js");
      return install(env, dryRun);
    }
    case "workstation": {
      const { install } = await import("./workstation.js");
      return install(env, dryRun, skippedComponents);
    }
    case "orchestration": {
      const { install } = await import("./orchestration.js");
      return install(env, dryRun);
    }
    case "workflow": {
      const { install } = await import("./workflow.js");
      return install(env, dryRun);
    }
    case "trailofbits": {
      const { install } = await import("./trailofbits.js");
      return install(env, dryRun);
    }
    default:
      return [
        {
          component: category.name,
          status: "failed",
          message: `Unknown category: ${category.id}`,
          verifyPassed: false,
        },
      ];
  }
}
