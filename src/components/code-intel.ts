import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";
import { registerMcp } from "../registry/mcp.js";
import { installBinary } from "../packages.js";
import type { ComponentSpec } from "./framework.js";
import { runComponent } from "./framework.js";

export const codeIntelCategory: ComponentCategory = {
  id: "code-intel",
  name: "Code Intelligence",
  tier: "recommended",
  description: "Semantic code analysis and search tools for deeper code understanding",
  defaultEnabled: true,
  components: [
    {
      id: 6,
      name: "serena-agent",
      displayName: "Serena",
      description: "Semantic code agent with MCP server support",
      tier: "recommended",
      category: "code-intel",
      packages: [
        {
          name: "serena-agent",
          displayName: "Serena",
          curl: "uv tool install -p 3.13 serena-agent@latest --prerelease=allow",
        },
      ],
      mcpConfig: {
        name: "serena",
        type: "stdio",
        command: "serena",
        args: ["start-mcp-server", "--project", "."],
      },
      verifyCommand: "serena-agent --version",
    },
    {
      id: 7,
      name: "ast-grep",
      displayName: "ast-grep",
      description: "Fast structural search and rewrite tool for code",
      tier: "recommended",
      category: "code-intel",
      packages: [
        {
          name: "ast-grep",
          displayName: "ast-grep",
          brew: "brew install ast-grep",
          cargo: "cargo install ast-grep --locked",
        },
      ],
      verifyCommand: "ast-grep --version",
    },
  ],
};

export const serenaSpec: ComponentSpec = {
  id: 6,
  name: "serena-agent",
  displayName: "Serena",
  description: "Semantic code agent with MCP server support",
  tier: "recommended",
  category: "code-intel",
  probe: async () => ({ present: commandExists("serena") || commandExists("serena-agent") }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async (env, _plan, dryRun): Promise<InstallResult> => {
    try {
      if (!commandExists("uv")) {
        log.info("uv not found, installing uv...");
        if (dryRun) {
          log.info("[dry-run] Would run: curl --max-time 300 -LsSf https://astral.sh/uv/install.sh | sh");
        } else {
          try {
            await $`sh -c "curl --max-time 300 -LsSf https://astral.sh/uv/install.sh | sh"`;
            process.env.PATH = `${env.homeDir}/.cargo/bin:${env.homeDir}/.local/bin:${process.env.PATH ?? ""}`;
            log.success("uv installed");
          } catch (err) {
            return {
              component: "uv",
              status: "failed",
              message: `Failed to install uv: ${err instanceof Error ? err.message : String(err)}`,
              verifyPassed: false,
            };
          }
        }
      }

      const existed = commandExists("serena") || commandExists("serena-agent");
      if (dryRun) {
        const verb = existed ? "upgrade" : "install";
        log.info(`[dry-run] Would ${verb}: uv tool install -p 3.13 serena-agent@latest --prerelease=allow --force`);
        return {
          component: "Serena",
          status: "skipped",
          message: `[dry-run] Would ${verb} Serena via uv`,
          verifyPassed: false,
        };
      }

      await $`sh -c 'export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"; uv tool install -p 3.13 serena-agent@latest --prerelease=allow --force'`;
      const installed = commandExists("serena") || commandExists("serena-agent");
      if (installed) {
        const serenaCmd = commandExists("serena") ? "serena" : "serena-agent";
        await registerMcp("serena", {
          transport: "stdio",
          command: serenaCmd,
          args: ["start-mcp-server", "--project", "."],
        });
        log.success("Serena MCP server registered");
      }
      return {
        component: "Serena",
        status: installed ? "installed" : "failed",
        message: installed ? (existed ? "Serena upgraded to latest" : "Serena installed successfully") : "Serena install ran but binary not found",
        verifyPassed: installed,
      };
    } catch (err) {
      return {
        component: "Serena",
        status: "failed",
        message: `Serena install failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => commandExists("serena") || commandExists("serena-agent"),
};

export const astGrepSpec: ComponentSpec = {
  id: 7,
  name: "ast-grep",
  displayName: "ast-grep",
  description: "Fast structural search and rewrite tool for code",
  tier: "recommended",
  category: "code-intel",
  probe: async () => ({ present: commandExists("ast-grep") }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async (env, _plan, dryRun): Promise<InstallResult> => {
    try {
      const existed = commandExists("ast-grep");
      if (dryRun) {
        const verb = existed ? "upgrade" : "install";
        const cmd = env.packageManager === "brew" ? "brew upgrade ast-grep" : "cargo install ast-grep --locked --force";
        log.info(`[dry-run] Would ${verb}: ${cmd}`);
        return { component: "ast-grep", status: "skipped", message: `[dry-run] Would ${verb} ast-grep`, verifyPassed: false };
      }
      if (existed) {
        const cmd = env.packageManager === "brew" ? "brew upgrade ast-grep" : "cargo install ast-grep --locked --force";
        await $`sh -c ${cmd}`.nothrow();
        return {
          component: "ast-grep",
          status: "installed",
          message: "ast-grep upgraded to latest",
          verifyPassed: commandExists("ast-grep"),
        };
      }
      const pkg = codeIntelCategory.components[1].packages[0];
      return await installBinary(pkg, env, dryRun);
    } catch (err) {
      return {
        component: "ast-grep",
        status: "failed",
        message: `ast-grep install failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => commandExists("ast-grep"),
};

export const codeIntelSpecs: ComponentSpec[] = [serenaSpec, astGrepSpec];

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const spec of codeIntelSpecs) {
    results.push(await runComponent(spec, env, dryRun));
  }
  return results;
}
