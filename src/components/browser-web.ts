import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, registerMcp, log, tryGetPythonCommand } from "../utils.js";

export const browserWebCategory: ComponentCategory = {
  id: "browser-web",
  name: "Browser + Web",
  tier: "recommended",
  description: "Browser automation and web scraping tools",
  defaultEnabled: true,
  components: [
    {
      id: 8,
      name: "playwright",
      displayName: "Playwright CLI",
      description: "Browser automation and testing tool",
      tier: "recommended",
      category: "browser-web",
      packages: [
        {
          name: "playwright",
          displayName: "Playwright CLI",
          npm: "npm install -g playwright@latest",
        },
      ],
      verifyCommand: "playwright --version",
    },
    {
      id: 9,
      name: "crawl4ai",
      displayName: "Crawl4AI",
      description: "AI-ready web crawler (pin v0.8.6+)",
      tier: "recommended",
      category: "browser-web",
      packages: [
        {
          name: "crawl4ai",
          displayName: "Crawl4AI",
          pip: "pip install 'crawl4ai>=0.8.6'",
        },
      ],
      warningNote: "Crawl4AI v0.8.5 had a supply chain issue — always use v0.8.6+",
      verifyCommand: "python3 -c \"import crawl4ai\"",
    },
    {
      id: 10,
      name: "docfork",
      displayName: "Docfork",
      description: "Documentation fetching MCP server (requires DOCFORK_API_KEY)",
      tier: "recommended",
      category: "browser-web",
      packages: [],
      mcpConfig: {
        name: "docfork",
        type: "stdio",
        command: "npx",
        args: ["docfork"],
        env: { DOCFORK_API_KEY: "${DOCFORK_API_KEY}" },
      },
      verifyCommand: "echo docfork-mcp-config",
    },
    {
      id: 11,
      name: "deepwiki",
      displayName: "DeepWiki",
      description: "Deep wiki MCP server",
      tier: "recommended",
      category: "browser-web",
      packages: [],
      mcpConfig: {
        name: "deepwiki",
        type: "http",
        url: "https://mcp.deepwiki.com/mcp",
      },
      verifyCommand: "echo deepwiki-mcp-config",
    },
  ],
};

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  // --- Playwright CLI ---
  try {
    if (commandExists("playwright")) {
      log.info("Playwright CLI already installed, skipping");
      results.push({
        component: "Playwright CLI",
        status: "already-installed",
        message: "Playwright CLI is already installed",
        verifyPassed: true,
      });
    } else if (dryRun) {
      log.info("[dry-run] Would run: npm install -g @playwright/cli@latest");
      results.push({
        component: "Playwright CLI",
        status: "skipped",
        message: "[dry-run] Would install Playwright CLI",
        verifyPassed: false,
      });
    } else {
      await $`sh -c "npm install -g playwright@latest"`;
      const installed = commandExists("playwright");
      results.push({
        component: "Playwright CLI",
        status: installed ? "installed" : "failed",
        message: installed ? "Playwright CLI installed successfully" : "Playwright CLI install ran but binary not found",
        verifyPassed: installed,
      });
    }
  } catch (err) {
    results.push({
      component: "Playwright CLI",
      status: "failed",
      message: `Playwright CLI install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- Crawl4AI ---
  try {
    const isInstalled = () =>
      commandExists("crwl") ||
      commandExists("crawl4ai-doctor") ||
      commandExists("crawl4ai-setup");

    if (isInstalled()) {
      log.info("Crawl4AI already installed, skipping");
      results.push({
        component: "Crawl4AI",
        status: "already-installed",
        message: "Crawl4AI is already installed (run `pipx upgrade crawl4ai` to update)",
        verifyPassed: true,
      });
    } else if (dryRun) {
      log.info("[dry-run] Would install Crawl4AI (latest, >=0.8.6)");
      results.push({
        component: "Crawl4AI",
        status: "skipped",
        message: "[dry-run] Would install Crawl4AI (latest)",
        verifyPassed: false,
      });
    } else {
      log.info("Installing Crawl4AI latest (avoiding v0.8.5 supply-chain issue)");
      // Prefer pipx for isolated tool install; fall back to uv or pip (PEP 668 workaround).
      let installCmd: string;
      if (commandExists("pipx")) {
        installCmd = "pipx install 'crawl4ai>=0.8.6'";
      } else if (commandExists("uv")) {
        installCmd = "uv tool install 'crawl4ai>=0.8.6'";
      } else {
        installCmd = "pip install --user --break-system-packages 'crawl4ai>=0.8.6'";
      }
      await $`sh -c ${installCmd}`.nothrow();
      let verified = isInstalled();
      if (!verified) {
        try {
          const pythonCmd = tryGetPythonCommand();
          if (pythonCmd) {
            const probe = await $`sh -c "${pythonCmd} -c 'import crawl4ai' 2>/dev/null && echo ok"`.text();
            verified = probe.trim() === "ok";
          }
        } catch {
          verified = false;
        }
      }
      results.push({
        component: "Crawl4AI",
        status: verified ? "installed" : "failed",
        message: verified ? "Crawl4AI installed successfully" : "Crawl4AI install ran but verification failed (try: pipx install crawl4ai)",
        verifyPassed: verified,
      });
    }
  } catch (err) {
    results.push({
      component: "Crawl4AI",
      status: "failed",
      message: `Crawl4AI install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- Docfork MCP ---
  try {
    if (dryRun) {
      log.info("[dry-run] Would register Docfork MCP config (requires DOCFORK_API_KEY)");
      results.push({
        component: "Docfork",
        status: "skipped",
        message: "[dry-run] Would register Docfork MCP server",
        verifyPassed: false,
      });
    } else {
      await registerMcp("docfork", {
        transport: "stdio",
        command: "npx",
        args: ["-y", "docfork"],
        env: { DOCFORK_API_KEY: process.env.DOCFORK_API_KEY ?? "" },
      });
      log.success("Docfork MCP server registered (set DOCFORK_API_KEY in your environment)");
      results.push({
        component: "Docfork",
        status: "installed",
        message: "Docfork MCP config registered — set DOCFORK_API_KEY",
        verifyPassed: true,
      });
    }
  } catch (err) {
    results.push({
      component: "Docfork",
      status: "failed",
      message: `Docfork MCP config failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- DeepWiki MCP ---
  try {
    if (dryRun) {
      log.info("[dry-run] Would register DeepWiki MCP config");
      results.push({
        component: "DeepWiki",
        status: "skipped",
        message: "[dry-run] Would register DeepWiki MCP server",
        verifyPassed: false,
      });
    } else {
      await registerMcp("deepwiki", {
        transport: "http",
        url: "https://mcp.deepwiki.com/mcp",
      });
      log.success("DeepWiki MCP server registered");
      results.push({
        component: "DeepWiki",
        status: "installed",
        message: "DeepWiki MCP config registered",
        verifyPassed: true,
      });
    }
  } catch (err) {
    results.push({
      component: "DeepWiki",
      status: "failed",
      message: `DeepWiki MCP config failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  return results;
}
