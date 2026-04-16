/**
 * Official Anthropic Claude Code plugins from the `claude-plugins-official` marketplace.
 *
 * Installs all plugins that move the needle on day-to-day coding (workflow, review,
 * commit/PR, security, meta-config) plus all 12 LSP plugins. Skips plugin-author
 * tooling (agent-sdk-dev, plugin-dev, example-plugin) and niche items (math-olympiad)
 * which the user can `claude plugin install <name>@claude-plugins-official` manually
 * if they ever need them.
 */
import { $ } from "bun";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";

const MARKETPLACE_SLUG = "anthropics/claude-plugins-official";
const MARKETPLACE_NAME = "claude-plugins-official";

// Third-party marketplaces we also install from. Each entry:
//   { slug: "owner/repo", marketplaceName: "<as Claude CLI knows it>", plugins: [names…] }
// The marketplace name is what `claude plugin marketplace list` reports — usually
// the repo name, but sometimes different. We resolve it via marketplace.json after adding.
// karpathy-guidelines + caveman moved to skills.sh (see skills-registry.ts).
// Reason: skills.sh hosts them as plain skills with `npx skills update` for
// auto-refresh, whereas the Claude Code plugin system requires full marketplace
// reinstall cycles on every upstream bump. No more plugin-scope imports for
// third-party skills; custom skills live in `skills/` (shipped as-is), all
// other community skills come from skills.sh.
const EXTRA_MARKETPLACES: Array<{ slug: string; marketplaceName: string; plugins: string[] }> = [];

// Tier 1 — coding workflow, review, security, git, meta-config, output styles, prototyping.
const CORE_PLUGINS = [
  "feature-dev",
  "code-review",
  "pr-review-toolkit",
  "code-simplifier",
  "commit-commands",
  "claude-code-setup",
  "claude-md-management",
  // "security-guidance" removed 2026-04-15 — its hook leaks Anthropic-internal advice
  // (references a private helper that only exists in their codebase) as false positives
  // on common JS/TS patterns. Our own hooks cover real security.
  //
  // "ralph-loop" + "hookify" removed 2026-04-15 — both register Stop hooks that fire
  // on every session exit even when the plugin has zero rules configured. Added noise
  // ("Ran 4 stop hooks... Failed with non-blocking status code") without any active
  // workflow leveraging them. Re-install on demand if you start using either:
  //   claude plugin install ralph-loop@claude-plugins-official
  //   claude plugin install hookify@claude-plugins-official
  "frontend-design",
  "playground",
  // "explanatory-output-style" + "learning-output-style" removed 2026-04-15 — they
  // conflict with `caveman` (terse mode is the default; their always-on verbose
  // directives cancel caveman's savings). Re-install on demand if you want them
  // for a session: `claude plugin install <name>@claude-plugins-official`.
  "skill-creator",
];

// LSP plugins from claude-plugins-official are STUBS as of 2026-04-15 — each
// just contains a LICENSE + README that documents how to install the underlying
// language server binary. They have NO `.claude-plugin/plugin.json` and provide
// zero integration code. Installing them clutters `claude plugin list` and can
// surface "lsp for X failed" errors when CC tries to invoke a non-existent server.
//
// Strategy: skip the stubs entirely. We auto-install the real LSP binaries for
// languages we can detect on the user's machine (see `installRealLspBinaries`
// below). Re-evaluate this decision when Anthropic ships actual integration.
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
  const path = join(env.homeDir, ".claude", "plugins", "installed_plugins.json");
  try {
    const data = JSON.parse(await fs.readFile(path, "utf-8")) as { plugins?: Record<string, unknown> };
    // Keys look like "feature-dev@claude-plugins-official"
    return new Set(Object.keys(data.plugins ?? {}));
  } catch {
    return new Set();
  }
}

/**
 * Install the actual language-server binaries for languages we can detect on
 * disk. The `*-lsp` plugins from Anthropic are stubs that don't ship the binary —
 * we have to do it ourselves for the LSP tool inside Claude Code to work.
 *
 * Detection is conservative: we only install LSPs for runtimes the user clearly
 * uses (bun/node, python3, rustc, go). Skipped languages can be installed later
 * by re-running setup once the runtime is on disk.
 */
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
  const path = join(env.homeDir, ".claude", "plugins", "known_marketplaces.json");
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

  // Step 1: ensure marketplace is registered (idempotent)
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

  // Step 2: install each plugin if not already present. Re-load the registry once
  // up front; refreshing per-plugin is wasteful since `claude plugin install` writes
  // to it but our detection just needs the initial baseline.
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

  // Step 2.5: install REAL language-server binaries for detected runtimes.
  // The `*-lsp` plugins from Anthropic don't ship binaries (they're stubs);
  // we install the actual servers so the in-CC LSP tool works.
  const lspResults = await installRealLspBinaries(env, dryRun);
  results.push(...lspResults);

  // Step 3: install from extra marketplaces (Karpathy skills, etc.)
  for (const { slug, marketplaceName, plugins } of EXTRA_MARKETPLACES) {
    const knownPath = join(env.homeDir, ".claude", "plugins", "known_marketplaces.json");
    let mpText = "";
    try { mpText = await fs.readFile(knownPath, "utf-8"); } catch { /* no file yet */ }
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

    // Re-load registry so we see what's now installed
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
