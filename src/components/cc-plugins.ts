import { $ } from "bun";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";

const MARKETPLACE_SLUG = "anthropics/claude-plugins-official";
const MARKETPLACE_NAME = "claude-plugins-official";

const EXTRA_MARKETPLACES: Array<{ slug: string; marketplaceName: string; plugins: string[] }> = [];

const CORE_PLUGINS = [
  "feature-dev",
  "code-review",
  "pr-review-toolkit",
  "code-simplifier",
  "commit-commands",
  "claude-code-setup",
  "claude-md-management",
  "frontend-design",
  "playground",
  "skill-creator",
  "session-report",
];

// LSP plugins from claude-plugins-official are stubs without plugin.json;
// we install the real language-server binaries directly (see installRealLspBinaries).
const LSP_PLUGINS: string[] = [];

const ALL_PLUGINS = [...CORE_PLUGINS, ...LSP_PLUGINS];
const EXTRA_PLUGIN_NAMES = EXTRA_MARKETPLACES.flatMap((m) => m.plugins);
const TOTAL_PLUGIN_COUNT = ALL_PLUGINS.length + EXTRA_PLUGIN_NAMES.length;

export const ccPluginsCategory: ComponentCategory = {
  id: "cc-plugins",
  name: "Claude Code Plugins",
  tier: "recommended",
  description: `${TOTAL_PLUGIN_COUNT} curated plugins: Anthropic official (feature-dev, code-review, security-guidance, 12 LSPs, etc.) + Karpathy's LLM-coding principles`,
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
    // Keys look like "feature-dev@claude-plugins-official"
    return new Set(Object.keys(data.plugins ?? {}));
  } catch {
    return new Set();
  }
}

async function installRealLspBinaries(_env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const out: InstallResult[] = [];

  const targets: Array<{ name: string; needs: () => boolean; install: string; verify: string }> = [
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

  for (const t of targets) {
    if (!t.needs()) {
      out.push({
        component: t.name,
        status: "skipped",
        message: `runtime not present — skipping (install the runtime first, then re-run setup)`,
        verifyPassed: false,
      });
      continue;
    }
    if (commandExists(t.verify)) {
      out.push({
        component: t.name,
        status: "already-installed",
        message: `${t.verify} already on disk`,
        verifyPassed: true,
      });
      continue;
    }
    if (dryRun) {
      out.push({
        component: t.name,
        status: "skipped",
        message: `[dry-run] Would run: ${t.install}`,
        verifyPassed: false,
      });
      continue;
    }
    log.info(`Installing ${t.name}: ${t.install}`);
    const r = await $`sh -c ${t.install}`.nothrow();
    const ok = commandExists(t.verify);
    out.push({
      component: t.name,
      status: ok ? "installed" : "failed",
      message: ok ? `${t.verify} installed` : `install exited ${r.exitCode}; binary not found`,
      verifyPassed: ok,
    });
  }

  return out;
}

async function marketplaceRegistered(env: DetectedEnvironment): Promise<boolean> {
  const path = join(env.claudeDir, "plugins", "known_marketplaces.json");
  try {
    const text = await fs.readFile(path, "utf-8");
    return text.includes("claude-plugins-official");
  } catch {
    return false;
  }
}

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

  if (!(await marketplaceRegistered(env))) {
    log.info(`Adding marketplace: ${MARKETPLACE_SLUG}`);
    const mkt = await $`claude plugin marketplace add ${MARKETPLACE_SLUG}`.nothrow();
    if (mkt.exitCode !== 0) {
      const msg = `claude plugin marketplace add exited with code ${mkt.exitCode}`;
      for (const name of ALL_PLUGINS) {
        results.push({ component: name, status: "failed", message: msg, verifyPassed: false });
      }
      return results;
    }
  }

  const initiallyInstalled = await loadInstalledPlugins(env);

  for (const name of ALL_PLUGINS) {
    const key = `${name}@${MARKETPLACE_NAME}`;
    if (initiallyInstalled.has(key)) {
      results.push({
        component: name,
        status: "already-installed",
        message: `${name} already installed`,
        verifyPassed: true,
      });
      continue;
    }

    log.info(`Installing ${name}@${MARKETPLACE_NAME}`);
    const out = await $`claude plugin install ${key}`.nothrow();
    if (out.exitCode === 0) {
      results.push({
        component: name,
        status: "installed",
        message: `${name} installed`,
        verifyPassed: true,
      });
    } else {
      results.push({
        component: name,
        status: "failed",
        message: `claude plugin install exited ${out.exitCode}`,
        verifyPassed: false,
      });
    }
  }

  results.push(...(await installRealLspBinaries(env, dryRun)));

  for (const { slug, marketplaceName, plugins } of EXTRA_MARKETPLACES) {
    const knownPath = join(env.claudeDir, "plugins", "known_marketplaces.json");
    let mpText = "";
    try { mpText = await fs.readFile(knownPath, "utf-8"); } catch { }
    if (!mpText.includes(marketplaceName)) {
      log.info(`Adding marketplace: ${slug}`);
      const mkt = await $`claude plugin marketplace add ${slug}`.nothrow();
      if (mkt.exitCode !== 0) {
        for (const name of plugins) {
          results.push({
            component: name,
            status: "failed",
            message: `claude plugin marketplace add ${slug} exited ${mkt.exitCode}`,
            verifyPassed: false,
          });
        }
        continue;
      }
    }

    const installedNow = await loadInstalledPlugins(env);
    for (const name of plugins) {
      const key = `${name}@${marketplaceName}`;
      if (installedNow.has(key)) {
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
      if (out.exitCode === 0) {
        results.push({
          component: name,
          status: "installed",
          message: `${name} installed (from ${slug})`,
          verifyPassed: true,
        });
      } else {
        results.push({
          component: name,
          status: "failed",
          message: `claude plugin install ${key} exited ${out.exitCode}`,
          verifyPassed: false,
        });
      }
    }
  }

  return results;
}
