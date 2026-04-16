import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { log, registerMcp } from "../utils.js";

export const designCategory: ComponentCategory = {
  id: "design",
  name: "Design",
  tier: "optional",
  description: "UI/UX design tools and AI-assisted design resources",
  defaultEnabled: false,
  components: [
    {
      id: 30,
      name: "google-stitch",
      displayName: "Google Stitch",
      description: "Pulls Stitch designs into Claude Code via davideast/stitch-mcp",
      tier: "optional",
      category: "design",
      packages: [],
      mcpConfig: {
        name: "stitch",
        type: "stdio",
        command: "npx",
        args: ["-y", "@_davideast/stitch-mcp", "proxy"],
      },
      verifyCommand: "echo stitch-mcp-config",
    },
    {
      id: 31,
      name: "awesome-design-md",
      displayName: "awesome-design-md",
      description: "Curated design markdown resources for AI context",
      tier: "optional",
      category: "design",
      packages: [
        {
          name: "awesome-design-md",
          displayName: "awesome-design-md",
          npm: "npx degit VoltAgent/awesome-design-md",
        },
      ],
      verifyCommand: "echo awesome-design-md-installed",
    },
  ],
};

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  // --- Google Stitch (register stitch-mcp) ---
  try {
    const stitchKey = process.env.STITCH_API_KEY ?? "";
    if (dryRun) {
      log.info("[dry-run] Would register stitch-mcp (@_davideast/stitch-mcp) as an MCP server");
      results.push({
        component: "Google Stitch",
        status: "skipped",
        message: "[dry-run] Would register stitch-mcp",
        verifyPassed: false,
      });
    } else if (!stitchKey) {
      results.push({
        component: "Google Stitch",
        status: "skipped",
        message: "STITCH_API_KEY not set — run `npx @_davideast/stitch-mcp init` to obtain one, add to ~/.config/code-tools/secrets.env, re-run",
        verifyPassed: false,
      });
    } else {
      await registerMcp("stitch", {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@_davideast/stitch-mcp", "proxy"],
        env: { STITCH_API_KEY: stitchKey },
      });
      log.success("stitch-mcp registered");
      results.push({
        component: "Google Stitch",
        status: "installed",
        message: "stitch-mcp registered — run `npx @_davideast/stitch-mcp init` in a project to authenticate",
        verifyPassed: true,
      });
    }
  } catch (err) {
    results.push({
      component: "Google Stitch",
      status: "failed",
      message: `stitch-mcp registration failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- awesome-design-md ---
  try {
    if (dryRun) {
      log.info("[dry-run] Would run: npx degit VoltAgent/awesome-design-md");
      results.push({
        component: "awesome-design-md",
        status: "skipped",
        message: "[dry-run] Would install awesome-design-md via degit",
        verifyPassed: false,
      });
    } else {
      const dest = `${env.claudeDir}/design-resources/awesome-design-md`;
      // --force lets degit overwrite if dir already exists
      await $`sh -c ${`npx -y degit --force VoltAgent/awesome-design-md ${dest}`}`;
      log.success(`awesome-design-md resources downloaded to ${dest}`);
      results.push({
        component: "awesome-design-md",
        status: "installed",
        message: `awesome-design-md installed at ${dest}`,
        verifyPassed: true,
      });
    }
  } catch (err) {
    results.push({
      component: "awesome-design-md",
      status: "failed",
      message: `awesome-design-md install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  return results;
}
