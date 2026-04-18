import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { log, commandExists } from "../utils.js";
import { registerMcp } from "../registry/mcp.js";
import { installBinary } from "../packages.js";
import type { ComponentSpec } from "./framework.js";
import { runComponent } from "./framework.js";

export const githubCategory: ComponentCategory = {
  id: "github",
  name: "GitHub",
  tier: "recommended",
  description: "GitHub CLI and MCP integrations for code review and CI/CD",
  defaultEnabled: true,
  components: [
    {
      id: 16,
      name: "gh",
      displayName: "gh CLI",
      description: "GitHub CLI for repository management",
      tier: "recommended",
      category: "github",
      packages: [
        {
          name: "gh",
          displayName: "gh CLI",
          brew: "brew install gh",
          apt: "sudo apt install -y gh",
          pacman: "sudo pacman -S --noconfirm github-cli",
          dnf: "sudo dnf install -y gh",
        },
      ],
      verifyCommand: "gh --version",
    },
    {
      id: 17,
      name: "github-mcp",
      displayName: "github-mcp",
      description: "GitHub MCP server (requires GITHUB_PAT)",
      tier: "recommended",
      category: "github",
      packages: [],
      mcpConfig: {
        name: "github",
        type: "http",
        url: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: "Bearer ${GITHUB_PAT}" },
      },
      verifyCommand: "claude mcp list | grep -q '^github:'",
    },
    {
      id: 18,
      name: "claude-code-action",
      displayName: "Claude Code Action",
      description: "GitHub Actions integration for Claude Code (not installed locally)",
      tier: "recommended",
      category: "github",
      packages: [],
      verifyCommand: "echo claude-code-action-guidance",
    },
    {
      id: 19,
      name: "claude-code-review",
      displayName: "Claude Code Review",
      description: "Native Claude Code review feature (requires CC >= 2.1.104)",
      tier: "recommended",
      category: "github",
      packages: [],
      verifyCommand: "claude --version",
    },
  ],
};

const ghCliSpec: ComponentSpec = {
  id: 16,
  name: "gh",
  displayName: "gh CLI",
  description: "GitHub CLI for repository management",
  tier: "recommended",
  category: "github",
  probe: async () => ({ present: commandExists("gh") }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async (env, _plan, dryRun) => {
    try {
      const pkg = githubCategory.components[0].packages[0];
      return await installBinary(pkg, env, dryRun);
    } catch (err) {
      return {
        component: "gh CLI",
        status: "failed",
        message: `gh CLI install failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => commandExists("gh"),
};

const githubMcpSpec: ComponentSpec = {
  id: 17,
  name: "github-mcp",
  displayName: "github-mcp",
  description: "GitHub MCP server (requires GITHUB_PAT)",
  tier: "recommended",
  category: "github",
  probe: async () => ({ present: false }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async (_env, _plan, dryRun) => {
    try {
      const pat = process.env.GITHUB_PAT ?? "";
      if (dryRun) {
        log.info("[dry-run] Would register GitHub MCP config (requires GITHUB_PAT)");
        return {
          component: "github-mcp",
          status: "skipped",
          message: "[dry-run] Would register GitHub HTTP MCP server",
          verifyPassed: false,
        };
      }
      if (!pat) {
        return {
          component: "github-mcp",
          status: "skipped",
          message: "GITHUB_PAT not set — add to ~/.config/yka-code/secrets.env and re-run",
          verifyPassed: false,
        };
      }
      const ok = await registerMcp("github", {
        transport: "http",
        url: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: `Bearer ${pat}` },
      });
      if (!ok) {
        return {
          component: "github-mcp",
          status: "failed",
          message: "github-mcp MCP registration failed — check `claude mcp list` and retry",
          verifyPassed: false,
        };
      }
      log.success("GitHub MCP server registered");
      return {
        component: "github-mcp",
        status: "installed",
        message: "GitHub MCP config registered — set GITHUB_PAT",
        verifyPassed: true,
      };
    } catch (err) {
      return {
        component: "github-mcp",
        status: "failed",
        message: `GitHub MCP config failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => true,
};

const claudeCodeActionSpec: ComponentSpec = {
  id: 18,
  name: "claude-code-action",
  displayName: "Claude Code Action",
  description: "GitHub Actions integration for Claude Code (not installed locally)",
  tier: "recommended",
  category: "github",
  probe: async () => ({ present: false }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async () => {
    try {
      log.info("Claude Code Action: not installed locally — add to GitHub Actions workflow:");
      log.info("  uses: anthropics/claude-code-action@v1");
      log.info("  with: { github_token: ${{ secrets.GITHUB_TOKEN }}, anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }} }");
      return {
        component: "Claude Code Action",
        status: "skipped",
        message: "Claude Code Action is a GitHub Actions integration, not a local install. See: https://github.com/anthropics/claude-code-action",
        verifyPassed: false,
      };
    } catch (err) {
      return {
        component: "Claude Code Action",
        status: "failed",
        message: `Claude Code Action guidance failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => true,
};

const claudeCodeReviewSpec: ComponentSpec = {
  id: 19,
  name: "claude-code-review",
  displayName: "Claude Code Review",
  description: "Native Claude Code review feature (requires CC >= 2.1.104)",
  tier: "recommended",
  category: "github",
  probe: async () => ({ present: false }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async (env) => {
    try {
      const ccVersion = env.claudeCodeVersion;
      if (!ccVersion) {
        return {
          component: "Claude Code Review",
          status: "skipped",
          message: "Claude Code not detected — install Claude Code >= 2.1.104 to use native code review",
          verifyPassed: false,
        };
      }
      const parts = ccVersion.replace(/^v/, "").split(".").map(Number);
      const [major = 0, minor = 0, patch = 0] = parts;
      const ok = major > 2 || (major === 2 && minor > 1) || (major === 2 && minor === 1 && patch >= 104);
      return {
        component: "Claude Code Review",
        status: ok ? "already-installed" : "skipped",
        message: ok
          ? `Claude Code Review available (CC ${ccVersion})`
          : `Claude Code ${ccVersion} detected — upgrade to >= 2.1.104 to enable native code review`,
        verifyPassed: ok,
      };
    } catch (err) {
      return {
        component: "Claude Code Review",
        status: "failed",
        message: `Claude Code Review check failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => true,
};

export const githubSpecs: ComponentSpec[] = [ghCliSpec, githubMcpSpec, claudeCodeActionSpec, claudeCodeReviewSpec];

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const spec of githubSpecs) {
    results.push(await runComponent(spec, env, dryRun));
  }
  return results;
}
