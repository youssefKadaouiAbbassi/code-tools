import { $ } from "bun";
import { promises as fs } from "fs";
import { join } from "path";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, fileExists, mergeJsonFile, registerMcp, log } from "../utils.js";

async function wireClaudeHudStatusline(env: DetectedEnvironment): Promise<{ wired: boolean; message: string }> {
  const settingsPath = join(env.claudeDir, "settings.json");

  if (await fileExists(settingsPath)) {
    try {
      const settings = JSON.parse(await fs.readFile(settingsPath, "utf-8")) as { statusLine?: { command?: string } };
      if (settings.statusLine?.command?.includes("claude-hud")) {
        return { wired: false, message: "statusLine already configured" };
      }
    } catch { }
  }

  const pluginRoot = join(env.claudeDir, "plugins", "cache", "claude-hud", "claude-hud");
  let versions: string[] = [];
  try { versions = await fs.readdir(pluginRoot); }
  catch { return { wired: false, message: `plugin cache not found at ${pluginRoot}` }; }

  versions = versions.filter((v) => /^\d+(\.\d+)+$/.test(v)).sort((a, b) => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
    }
    return 0;
  });
  const latest = versions[versions.length - 1];
  if (!latest) return { wired: false, message: "no installed claude-hud version found" };

  const runtime = commandExists("bun") ? "bun" : commandExists("node") ? "node" : null;
  if (!runtime) return { wired: false, message: "neither bun nor node in PATH — install one and re-run setup" };

  const runtimePath = Bun.which(runtime);
  if (!runtimePath) return { wired: false, message: `could not resolve absolute path for ${runtime}` };

  const source = runtime === "bun" ? "src/index.ts" : "dist/index.js";
  const envFlag = runtime === "bun" ? ` '--env-file' '/dev/null'` : "";
  const command =
    `bash -c 'plugin_dir=$(ls -d "$\{CLAUDE_CONFIG_DIR:-$HOME/.claude\}"/plugins/cache/claude-hud/claude-hud/*/ 2>/dev/null | ` +
    `awk -F/ '"'"'{ print $(NF-1) "\\t" $(0) }'"'"' | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -1 | cut -f2-); ` +
    `exec "${runtimePath}"${envFlag} "$\{plugin_dir\}${source}"'`;

  await mergeJsonFile(settingsPath, { statusLine: { type: "command", command, padding: 0 } });

  let installerVersion = "0.0.0";
  try {
    const pkgPath = join(import.meta.dir, "..", "..", "package.json");
    const pkg = await Bun.file(pkgPath).json() as { version?: string };
    if (typeof pkg.version === "string") installerVersion = pkg.version;
  } catch { }
  const customLine = `UCCS v${installerVersion}`;

  const hudConfigPath = join(env.claudeDir, "plugins", "claude-hud", "config.json");
  await mergeJsonFile(hudConfigPath, {
    lineLayout: "compact",
    display: {
      showUsage: true,
      usageBarEnabled: true,
      usageThreshold: 0,
      customLine,
    },
  });

  return { wired: true, message: `statusLine wired (runtime: ${runtime}, claude-hud v${latest}, compact + usage/weekly + "${customLine}")` };
}

export const memoryContextCategory: ComponentCategory = {
  id: "memory-context",
  name: "Memory + Context",
  tier: "recommended",
  description: "Persistent memory and context management for Claude",
  defaultEnabled: true,
  components: [
    {
      id: 12,
      name: "claude-mem",
      displayName: "claude-mem",
      description: "Persistent memory layer for Claude Code sessions",
      tier: "recommended",
      category: "memory-context",
      packages: [
        {
          name: "claude-mem",
          displayName: "claude-mem",
          npm: "npx claude-mem install",
        },
      ],
      mcpConfig: {
        name: "claude-mem",
        type: "stdio",
        command: "claude-mem",
        args: ["--bind", "127.0.0.1"],
      },
      verifyCommand: "echo claude-mem-mcp-config",
    },
    {
      id: 13,
      name: "context-mode",
      displayName: "context-mode",
      description: "Context switching MCP server for Claude",
      tier: "recommended",
      category: "memory-context",
      packages: [],
      mcpConfig: {
        name: "context-mode",
        type: "stdio",
        command: "npx",
        args: ["-y", "context-mode"],
      },
      verifyCommand: "echo context-mode-mcp-config",
    },
    {
      id: 14,
      name: "claude-hud",
      displayName: "Claude HUD",
      description: "Live HUD/statusline showing context, tools, agents, and todos",
      tier: "recommended",
      category: "memory-context",
      packages: [],
      verifyCommand: "claude plugin list",
    },
  ],
};

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  // --- claude-mem ---
  try {
    const claudeMemMcp = { transport: "stdio" as const, command: "claude-mem", args: ["--bind", "127.0.0.1"] };
    if (dryRun) {
      log.info("[dry-run] Would run: npx -y claude-mem install --ide claude-code");
      results.push({
        component: "claude-mem",
        status: "skipped",
        message: "[dry-run] Would install and register claude-mem MCP server",
        verifyPassed: false,
      });
    } else if (commandExists("claude-mem")) {
      log.info("claude-mem already installed, refreshing MCP registration only");
      await registerMcp("claude-mem", claudeMemMcp);
      results.push({
        component: "claude-mem",
        status: "already-installed",
        message: "claude-mem already installed; MCP config refreshed",
        verifyPassed: true,
      });
    } else {
      await $`sh -c "npx -y claude-mem install --ide claude-code"`;
      await registerMcp("claude-mem", claudeMemMcp);
      log.success("claude-mem MCP server registered (bound to 127.0.0.1)");
      results.push({
        component: "claude-mem",
        status: "installed",
        message: "claude-mem installed and MCP config registered",
        verifyPassed: true,
      });
    }
  } catch (err) {
    results.push({
      component: "claude-mem",
      status: "failed",
      message: `claude-mem install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- claude-hud (Claude Code plugin) ---
  try {
    if (dryRun) {
      log.info("[dry-run] Would add jarrodwatts/claude-hud marketplace and install claude-hud plugin");
      results.push({
        component: "Claude HUD",
        status: "skipped",
        message: "[dry-run] Would install claude-hud plugin via Claude Code plugin system",
        verifyPassed: false,
      });
    } else if (!commandExists("claude")) {
      results.push({
        component: "Claude HUD",
        status: "skipped",
        message: "Claude Code CLI not found — install Claude Code first, then run: claude plugin marketplace add jarrodwatts/claude-hud && claude plugin install claude-hud",
        verifyPassed: false,
      });
    } else {
      // Detect if already installed by checking the plugin registry
      const registryPath = join(env.claudeDir, "plugins", "installed_plugins.json");
      let alreadyInstalled = false;
      try {
        const registry = await Bun.file(registryPath).json() as { plugins?: Record<string, unknown> };
        alreadyInstalled = Object.keys(registry.plugins ?? {}).some((k) => k.startsWith("claude-hud@"));
      } catch { }

      if (alreadyInstalled) {
        const wireResult = await wireClaudeHudStatusline(env);
        results.push({
          component: "Claude HUD",
          status: "already-installed",
          message: wireResult.wired
            ? `Claude HUD plugin already installed; ${wireResult.message}`
            : `Claude HUD plugin already installed (${wireResult.message})`,
          verifyPassed: true,
        });
      } else {
        const mkt = await $`claude plugin marketplace add jarrodwatts/claude-hud`.nothrow();
        if (mkt.exitCode !== 0) {
          results.push({
            component: "Claude HUD",
            status: "failed",
            message: `claude plugin marketplace add exited ${mkt.exitCode}: ${mkt.stderr.toString().slice(0, 200)}`,
            verifyPassed: false,
          });
        } else {
          const install = await $`claude plugin install claude-hud`.nothrow();
          if (install.exitCode !== 0) {
            results.push({
              component: "Claude HUD",
              status: "failed",
              message: `claude plugin install exited ${install.exitCode}: ${install.stderr.toString().slice(0, 200)}`,
              verifyPassed: false,
            });
          } else {
            const wire = await wireClaudeHudStatusline(env);
            results.push({
              component: "Claude HUD",
              status: "installed",
              message: wire.wired
                ? `Claude HUD installed, statusline wired — restart Claude Code`
                : `Claude HUD installed — restart Claude Code (${wire.message})`,
              verifyPassed: wire.wired,
            });
          }
        }
      }
    }
  } catch (err) {
    results.push({
      component: "Claude HUD",
      status: "failed",
      message: `Claude HUD install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- context-mode MCP ---
  try {
    if (dryRun) {
      log.info("[dry-run] Would register context-mode MCP config");
      results.push({
        component: "context-mode",
        status: "skipped",
        message: "[dry-run] Would register context-mode MCP server",
        verifyPassed: false,
      });
    } else {
      await registerMcp("context-mode", {
        transport: "stdio",
        command: "npx",
        args: ["-y", "context-mode"],
      });
      log.success("context-mode MCP server registered");
      results.push({
        component: "context-mode",
        status: "installed",
        message: "context-mode MCP config registered",
        verifyPassed: true,
      });
    }
  } catch (err) {
    results.push({
      component: "context-mode",
      status: "failed",
      message: `context-mode MCP config failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  return results;
}
