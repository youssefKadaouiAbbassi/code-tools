import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, installBinary, registerMcp, log } from "../utils.js";

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
        command: "serena-agent",
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

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  // --- Serena ---
  try {
    const serena = codeIntelCategory.components[0];

    // Ensure uv is installed first
    if (!commandExists("uv")) {
      log.info("uv not found, installing uv...");
      if (dryRun) {
        log.info("[dry-run] Would run: curl -LsSf https://astral.sh/uv/install.sh | sh");
      } else {
        try {
          await $`sh -c "curl -LsSf https://astral.sh/uv/install.sh | sh"`;
          log.success("uv installed");
        } catch (err) {
          results.push({
            component: "uv",
            status: "failed",
            message: `Failed to install uv: ${err instanceof Error ? err.message : String(err)}`,
            verifyPassed: false,
          });
        }
      }
    }

    if (commandExists("serena-agent")) {
      log.info("Serena already installed, skipping");
      results.push({
        component: "Serena",
        status: "already-installed",
        message: "Serena is already installed",
        verifyPassed: true,
      });
    } else if (dryRun) {
      log.info("[dry-run] Would run: uv tool install -p 3.13 serena-agent@latest --prerelease=allow");
      results.push({
        component: "Serena",
        status: "skipped",
        message: "[dry-run] Would install Serena via uv",
        verifyPassed: false,
      });
    } else {
      await $`sh -c "uv tool install -p 3.13 serena-agent@latest --prerelease=allow"`;
      // serena-agent package installs binary as 'serena'
      const installed = commandExists("serena") || commandExists("serena-agent");
      results.push({
        component: "Serena",
        status: installed ? "installed" : "failed",
        message: installed ? "Serena installed successfully" : "Serena install ran but binary not found",
        verifyPassed: installed,
      });

      if (installed && serena.mcpConfig) {
        const serenaCmd = commandExists("serena") ? "serena" : "serena-agent";
        await registerMcp("serena", {
          transport: "stdio",
          command: serenaCmd,
          args: serena.mcpConfig.args,
        });
        log.success("Serena MCP server registered");
      }
    }
  } catch (err) {
    results.push({
      component: "Serena",
      status: "failed",
      message: `Serena install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- ast-grep ---
  try {
    if (commandExists("ast-grep")) {
      log.info("ast-grep already installed, skipping");
      results.push({
        component: "ast-grep",
        status: "already-installed",
        message: "ast-grep is already installed",
        verifyPassed: true,
      });
    } else {
      const astGrep = codeIntelCategory.components[1];
      const pkg = astGrep.packages[0];
      const result = await installBinary(pkg, env, dryRun);
      results.push(result);
    }
  } catch (err) {
    results.push({
      component: "ast-grep",
      status: "failed",
      message: `ast-grep install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  return results;
}
