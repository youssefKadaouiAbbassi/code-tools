import { $ } from "bun";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";

const MARKETPLACE_SLUG = "trailofbits/skills-curated";
const MARKETPLACE_NAME = "skills-curated";

const CURATED_PLUGINS = [
  "planning-with-files",
  "openai-security-threat-model",
  "openai-security-ownership-map",
  "openai-pdf",
  "openai-spreadsheet",
  "openai-jupyter-notebook",
  "openai-sentry",
];

export const trailofbitsCategory: ComponentCategory = {
  id: "trailofbits",
  name: "Trail of Bits Curated Skills",
  tier: "optional",
  description: `${CURATED_PLUGINS.length} vetted skills (supply-chain reviewed): file-format parsers (PDF/xlsx/Jupyter), security ownership + threat models, Sentry, planning-with-files`,
  defaultEnabled: false,
  components: CURATED_PLUGINS.map((name, i) => ({
    id: 300 + i,
    name,
    displayName: name,
    description: `Trail of Bits vetted plugin: ${name}`,
    tier: "optional" as const,
    category: "trailofbits",
    packages: [],
    verifyCommand: "claude plugin list",
  })),
};

async function loadInstalledPlugins(env: DetectedEnvironment): Promise<Set<string>> {
  const path = join(env.claudeDir, "plugins", "installed_plugins.json");
  try {
    const data = JSON.parse(await fs.readFile(path, "utf-8")) as { plugins?: Record<string, unknown> };
    return new Set(Object.keys(data.plugins ?? {}));
  } catch {
    return new Set();
  }
}

async function marketplaceRegistered(env: DetectedEnvironment): Promise<boolean> {
  const path = join(env.claudeDir, "plugins", "known_marketplaces.json");
  try {
    const text = await fs.readFile(path, "utf-8");
    return text.includes(MARKETPLACE_NAME);
  } catch {
    return false;
  }
}

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  if (!commandExists("claude")) {
    for (const name of CURATED_PLUGINS) {
      results.push({
        component: name,
        status: "skipped",
        message: "Claude Code CLI not found — install Claude Code first",
        verifyPassed: false,
      });
    }
    return results;
  }

  if (dryRun) {
    log.info(`[dry-run] Would add ${MARKETPLACE_SLUG} marketplace and install ${CURATED_PLUGINS.length} vetted plugins`);
    for (const name of CURATED_PLUGINS) {
      results.push({
        component: name,
        status: "skipped",
        message: `[dry-run] Would install ${name}@${MARKETPLACE_NAME}`,
        verifyPassed: false,
      });
    }
    return results;
  }

  if (!(await marketplaceRegistered(env))) {
    log.info(`Adding marketplace: ${MARKETPLACE_SLUG}`);
    const mkt = await $`claude plugin marketplace add ${MARKETPLACE_SLUG}`.nothrow();
    if (mkt.exitCode !== 0) {
      const msg = `claude plugin marketplace add exited with code ${mkt.exitCode}`;
      for (const name of CURATED_PLUGINS) {
        results.push({ component: name, status: "failed", message: msg, verifyPassed: false });
      }
      return results;
    }
  }

  const installed = await loadInstalledPlugins(env);

  for (const name of CURATED_PLUGINS) {
    const key = `${name}@${MARKETPLACE_NAME}`;
    if (installed.has(key)) {
      results.push({
        component: name,
        status: "already-installed",
        message: `${name} already installed`,
        verifyPassed: true,
      });
      continue;
    }

    log.info(`Installing ${key}`);
    const out = await $`claude plugin install ${key}`.nothrow();
    results.push({
      component: name,
      status: out.exitCode === 0 ? "installed" : "failed",
      message: out.exitCode === 0 ? `${name} installed from ${MARKETPLACE_SLUG}` : `claude plugin install ${key} exited ${out.exitCode}`,
      verifyPassed: out.exitCode === 0,
    });
  }

  return results;
}
