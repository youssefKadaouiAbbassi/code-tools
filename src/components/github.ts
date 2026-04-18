import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, registerMcp, log } from "../utils.js";
import { installBinary } from "../packages.js";

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

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  // --- gh CLI ---
  try {
    const pkg = githubCategory.components[0].packages[0];
    const result = await installBinary(pkg, env, dryRun);
    results.push(result);
  } catch (err) {
    results.push({
      component: "gh CLI",
      status: "failed",
      message: `gh CLI install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- github-mcp (HTTP MCP config) ---
  try {
    const pat = process.env.GITHUB_PAT ?? "";
    if (dryRun) {
      log.info("[dry-run] Would register GitHub MCP config (requires GITHUB_PAT)");
      results.push({
        component: "github-mcp",
        status: "skipped",
        message: "[dry-run] Would register GitHub HTTP MCP server",
        verifyPassed: false,
      });
    } else if (!pat) {
      results.push({
        component: "github-mcp",
        status: "skipped",
        message: "GITHUB_PAT not set — add to ~/.config/yka-code/secrets.env and re-run",
        verifyPassed: false,
      });
    } else {
      await registerMcp("github", {
        transport: "http",
        url: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: `Bearer ${pat}` },
      });
      log.success("GitHub MCP server registered");
      results.push({
        component: "github-mcp",
        status: "installed",
        message: "GitHub MCP config registered — set GITHUB_PAT",
        verifyPassed: true,
      });
    }
  } catch (err) {
    results.push({
      component: "github-mcp",
      status: "failed",
      message: `GitHub MCP config failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- Claude Code Action (GitHub Actions — no local install) ---
  try {
    log.info("Claude Code Action: not installed locally — add to GitHub Actions workflow:");
    log.info("  uses: anthropics/claude-code-action@v1");
    log.info("  with: { github_token: \${{ secrets.GITHUB_TOKEN }}, anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }} }");
    results.push({
      component: "Claude Code Action",
      status: "skipped",
      message: "Claude Code Action is a GitHub Actions integration, not a local install. See: https://github.com/anthropics/claude-code-action",
      verifyPassed: false,
    });
  } catch (err) {
    results.push({
      component: "Claude Code Action",
      status: "failed",
      message: `Claude Code Action guidance failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- Claude Code Review (native feature, verify CC >= 2.1.104) ---
  try {
    const ccVersion = env.claudeCodeVersion;
    if (!ccVersion) {
      results.push({
        component: "Claude Code Review",
        status: "skipped",
        message: "Claude Code not detected — install Claude Code >= 2.1.104 to use native code review",
        verifyPassed: false,
      });
    } else {
      // Parse semver and check >= 2.1.104
      const parts = ccVersion.replace(/^v/, "").split(".").map(Number);
      const [major = 0, minor = 0, patch = 0] = parts;
      const ok = major > 2 || (major === 2 && minor > 1) || (major === 2 && minor === 1 && patch >= 104);
      results.push({
        component: "Claude Code Review",
        status: ok ? "already-installed" : "skipped",
        message: ok
          ? `Claude Code Review available (CC ${ccVersion})`
          : `Claude Code ${ccVersion} detected — upgrade to >= 2.1.104 to enable native code review`,
        verifyPassed: ok,
      });
    }
  } catch (err) {
    results.push({
      component: "Claude Code Review",
      status: "failed",
      message: `Claude Code Review check failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  return results;
}
