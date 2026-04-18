import { $ } from "bun";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";
import { CORE_PLUGINS } from "../packages.js";
import type { ComponentSpec } from "./framework.js";
import { runComponent } from "./framework.js";

const MARKETPLACE_SLUG = "anthropics/claude-plugins-official";
const MARKETPLACE_NAME = "claude-plugins-official";

const EXTRA_MARKETPLACES: Array<{ slug: string; marketplaceName: string; plugins: string[] }> = [
  { slug: "obra/superpowers-marketplace", marketplaceName: "superpowers-marketplace", plugins: [] },
];

const LSP_PLUGINS: string[] = [];

const ALL_PLUGINS = [...CORE_PLUGINS, ...LSP_PLUGINS];
const EXTRA_PLUGIN_NAMES = EXTRA_MARKETPLACES.flatMap((m) => m.plugins);
const TOTAL_PLUGIN_COUNT = ALL_PLUGINS.length + EXTRA_PLUGIN_NAMES.length;

export const ccPluginsCategory: ComponentCategory = {
  id: "cc-plugins",
  name: "Claude Code Plugins",
  tier: "recommended",
  description: `${TOTAL_PLUGIN_COUNT} curated Anthropic-official plugins (feature-dev, code-review, pr-review-toolkit, session-report, plugin-dev, etc.) + stack-matched LSP binaries`,
  defaultEnabled: true,
  components: [
    ...ALL_PLUGINS.map((name, i) => ({
      id: 200 + i,
      name,
      displayName: name,
      description: `Anthropic-maintained plugin: ${name}`,
      tier: "recommended" as const,
      category: "cc-plugins",
      packages: [],
      verifyCommand: "claude plugin list",
    })),
    ...EXTRA_PLUGIN_NAMES.map((name, i) => ({
      id: 200 + ALL_PLUGINS.length + i,
      name,
      displayName: name,
      description: `Community plugin (${EXTRA_MARKETPLACES.find((m) => m.plugins.includes(name))?.slug}): ${name}`,
      tier: "recommended" as const,
      category: "cc-plugins",
      packages: [],
      verifyCommand: "claude plugin list",
    })),
  ],
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

async function marketplaceRegistered(env: DetectedEnvironment, name: string): Promise<boolean> {
  const path = join(env.claudeDir, "plugins", "known_marketplaces.json");
  try {
    const text = await fs.readFile(path, "utf-8");
    return text.includes(name);
  } catch {
    return false;
  }
}

async function ensureMarketplace(env: DetectedEnvironment, slug: string, name: string): Promise<{ ok: boolean; exitCode?: number }> {
  if (await marketplaceRegistered(env, name)) return { ok: true };
  log.info(`Adding marketplace: ${slug}`);
  const mkt = await $`claude plugin marketplace add ${slug}`.nothrow();
  return { ok: mkt.exitCode === 0, exitCode: mkt.exitCode };
}

async function installLspBinary(t: { name: string; needs: () => boolean; install: string; verify: string }, dryRun: boolean): Promise<InstallResult> {
  if (!t.needs()) {
    return {
      component: t.name,
      status: "skipped",
      message: `runtime not present — skipping (install the runtime first, then re-run setup)`,
      verifyPassed: false,
    };
  }
  if (commandExists(t.verify)) {
    return {
      component: t.name,
      status: "already-installed",
      message: `${t.verify} already on disk`,
      verifyPassed: true,
    };
  }
  if (dryRun) {
    return {
      component: t.name,
      status: "skipped",
      message: `[dry-run] Would run: ${t.install}`,
      verifyPassed: false,
    };
  }
  log.info(`Installing ${t.name}: ${t.install}`);
  const r = await $`sh -c ${t.install}`.nothrow();
  const ok = commandExists(t.verify);
  return {
    component: t.name,
    status: ok ? "installed" : "failed",
    message: ok ? `${t.verify} installed` : `install exited ${r.exitCode}; binary not found`,
    verifyPassed: ok,
  };
}

const LSP_TARGETS: Array<{ name: string; needs: () => boolean; install: string; verify: string }> = [
  {
    name: "typescript-language-server",
    needs: () => commandExists("npm") && (commandExists("node") || commandExists("bun")),
    install: "npm install -g typescript-language-server typescript",
    verify: "typescript-language-server",
  },
  {
    name: "pyright (Python LSP)",
    needs: () => commandExists("npm") && commandExists("python3"),
    install: "npm install -g pyright",
    verify: "pyright",
  },
  {
    name: "rust-analyzer",
    needs: () => commandExists("rustup") && !commandExists("rust-analyzer"),
    install: "rustup component add rust-analyzer",
    verify: "rust-analyzer",
  },
  {
    name: "gopls",
    needs: () => commandExists("go") && !commandExists("gopls"),
    install: "go install golang.org/x/tools/gopls@latest",
    verify: "gopls",
  },
];

function pluginSpec(id: number, name: string, slug: string, marketplaceName: string): ComponentSpec {
  return {
    id,
    name,
    displayName: name,
    description: `Claude Code plugin: ${name}@${marketplaceName}`,
    tier: "recommended",
    category: "cc-plugins",
    probe: async (env) => {
      const installed = await loadInstalledPlugins(env);
      return { present: installed.has(`${name}@${marketplaceName}`) };
    },
    plan: () => ({ kind: "install", steps: [] }),
    install: async (env, _plan, dryRun) => {
      if (!commandExists("claude")) {
        return {
          component: name,
          status: "skipped",
          message: "Claude Code CLI not found — install Claude Code first",
          verifyPassed: false,
        };
      }
      if (dryRun) {
        return {
          component: name,
          status: "skipped",
          message: `[dry-run] Would install ${name}@${marketplaceName}`,
          verifyPassed: false,
        };
      }
      const mkt = await ensureMarketplace(env, slug, marketplaceName);
      if (!mkt.ok) {
        return {
          component: name,
          status: "failed",
          message: `claude plugin marketplace add exited with code ${mkt.exitCode}`,
          verifyPassed: false,
        };
      }
      const installed = await loadInstalledPlugins(env);
      const key = `${name}@${marketplaceName}`;
      if (installed.has(key)) {
        return {
          component: name,
          status: "already-installed",
          message: `${name} already installed`,
          verifyPassed: true,
        };
      }
      log.info(`Installing ${key}`);
      const out = await $`claude plugin install ${key}`.nothrow();
      return {
        component: name,
        status: out.exitCode === 0 ? "installed" : "failed",
        message: out.exitCode === 0
          ? (slug === MARKETPLACE_SLUG ? `${name} installed` : `${name} installed (from ${slug})`)
          : `claude plugin install ${key} exited ${out.exitCode}`,
        verifyPassed: out.exitCode === 0,
      };
    },
    verify: async () => true,
  };
}

export const ccPluginsSpecs: ComponentSpec[] = [
  ...ALL_PLUGINS.map((n, i) => pluginSpec(200 + i, n, MARKETPLACE_SLUG, MARKETPLACE_NAME)),
  ...EXTRA_MARKETPLACES.flatMap((m, mi) =>
    m.plugins.map((n, i) => pluginSpec(200 + ALL_PLUGINS.length + mi * 100 + i, n, m.slug, m.marketplaceName)),
  ),
];

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  if (!commandExists("claude")) {
    for (const name of ALL_PLUGINS) {
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
    log.info(`[dry-run] Would add ${MARKETPLACE_SLUG} marketplace and install ${ALL_PLUGINS.length} plugins`);
    for (const name of ALL_PLUGINS) {
      results.push({
        component: name,
        status: "skipped",
        message: `[dry-run] Would install ${name}@${MARKETPLACE_NAME}`,
        verifyPassed: false,
      });
    }
    return results;
  }

  for (const spec of ccPluginsSpecs) {
    results.push(await runComponent(spec, env, dryRun));
  }

  for (const t of LSP_TARGETS) {
    results.push(await installLspBinary(t, dryRun));
  }

  return results;
}
