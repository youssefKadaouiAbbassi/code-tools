import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";
import { CORE_PLUGINS } from "../packages.js";
import type { ComponentSpec } from "./framework.js";
import { runComponent } from "./framework.js";
import { ensureMarketplace, installPlugin, listInstalledPlugins, updatePlugin } from "../registry/plugins.js";

const MARKETPLACE_SLUG = "anthropics/claude-plugins-official";
const MARKETPLACE_NAME = "claude-plugins-official";

export const ccPluginsCategory: ComponentCategory = {
  id: "cc-plugins",
  name: "Claude Code Plugins",
  tier: "recommended",
  description: `${CORE_PLUGINS.length} curated Anthropic-official plugins (feature-dev, code-review, pr-review-toolkit, session-report, plugin-dev, etc.) + stack-matched LSP binaries`,
  defaultEnabled: true,
  components: CORE_PLUGINS.map((name, i) => ({
    id: 200 + i,
    name,
    displayName: name,
    description: `Anthropic-maintained plugin: ${name}`,
    tier: "recommended" as const,
    category: "cc-plugins",
    packages: [],
    verifyCommand: "claude plugin list",
  })),
};

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
  const key = `${name}@${marketplaceName}`;
  return {
    id,
    name,
    displayName: name,
    description: `Claude Code plugin: ${key}`,
    tier: "recommended",
    category: "cc-plugins",
    probe: async (env) => ({ present: (await listInstalledPlugins(env)).has(key) }),
    plan: () => ({ kind: "install", steps: [] }),
    install: async (env, _plan, dryRun) => {
      if (!commandExists("claude") && !dryRun) {
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
          message: `[dry-run] Would install ${key}`,
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
      if ((await listInstalledPlugins(env)).has(key)) {
        return updatePlugin(name, marketplaceName, false);
      }
      return installPlugin(name, marketplaceName, false);
    },
    verify: async (env) => (await listInstalledPlugins(env)).has(key),
  };
}

export const ccPluginsSpecs: ComponentSpec[] = CORE_PLUGINS.map(
  (n, i) => pluginSpec(200 + i, n, MARKETPLACE_SLUG, MARKETPLACE_NAME),
);

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  if (!commandExists("claude")) {
    for (const name of CORE_PLUGINS) {
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
    log.info(`[dry-run] Would add ${MARKETPLACE_SLUG} marketplace and install ${CORE_PLUGINS.length} plugins`);
    for (const name of CORE_PLUGINS) {
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
