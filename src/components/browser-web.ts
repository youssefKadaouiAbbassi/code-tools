import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log, tryGetPythonCommand } from "../utils.js";
import { registerMcp } from "../registry/mcp.js";
import type { ComponentSpec } from "./framework.js";
import { runComponent } from "./framework.js";

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
      verifyCommand: "for p in python3 python; do command -v $p >/dev/null && exec $p -c 'import crawl4ai'; done; exit 1",
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
      verifyCommand: "claude mcp list | grep -q '^docfork:'",
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
      verifyCommand: "claude mcp list | grep -q '^deepwiki:'",
    },
  ],
};

const playwrightSpec: ComponentSpec = {
  id: 8,
  name: "playwright",
  displayName: "Playwright CLI",
  description: "Browser automation and testing tool",
  tier: "recommended",
  category: "browser-web",
  probe: async () => ({ present: commandExists("playwright") }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async (_env, _plan, dryRun) => {
    try {
      const existed = commandExists("playwright");
      if (dryRun) {
        const verb = existed ? "upgrade" : "install";
        log.info(`[dry-run] Would ${verb}: npm install -g playwright@latest`);
        return {
          component: "Playwright CLI",
          status: "skipped",
          message: `[dry-run] Would ${verb} Playwright CLI`,
          verifyPassed: false,
        };
      }
      await $`sh -c "npm install -g playwright@latest"`;
      const installed = commandExists("playwright");
      return {
        component: "Playwright CLI",
        status: installed ? "installed" : "failed",
        message: installed ? (existed ? "Playwright CLI upgraded to latest" : "Playwright CLI installed successfully") : "Playwright CLI install ran but binary not found",
        verifyPassed: installed,
      };
    } catch (err) {
      return {
        component: "Playwright CLI",
        status: "failed",
        message: `Playwright CLI install failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => commandExists("playwright"),
};

const crawl4aiSpec: ComponentSpec = {
  id: 9,
  name: "crawl4ai",
  displayName: "Crawl4AI",
  description: "AI-ready web crawler (pin v0.8.6+)",
  tier: "recommended",
  category: "browser-web",
  probe: async () => ({
    present: commandExists("crwl") || commandExists("crawl4ai-doctor") || commandExists("crawl4ai-setup"),
  }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async (_env, _plan, dryRun) => {
    try {
      const isInstalled = () =>
        commandExists("crwl") ||
        commandExists("crawl4ai-doctor") ||
        commandExists("crawl4ai-setup");

      const existed = isInstalled();
      if (dryRun) {
        const verb = existed ? "upgrade" : "install";
        log.info(`[dry-run] Would ${verb} Crawl4AI (latest, >=0.8.6)`);
        return {
          component: "Crawl4AI",
          status: "skipped",
          message: `[dry-run] Would ${verb} Crawl4AI`,
          verifyPassed: false,
        };
      }

      log.info(existed ? "Upgrading Crawl4AI to latest" : "Installing Crawl4AI latest");
      let installCmd: string;
      if (existed && commandExists("pipx")) {
        installCmd = "pipx upgrade crawl4ai || pipx install --force 'crawl4ai>=0.8.6'";
      } else if (existed && commandExists("uv")) {
        installCmd = "uv tool upgrade crawl4ai || uv tool install --force 'crawl4ai>=0.8.6'";
      } else if (commandExists("pipx")) {
        installCmd = "pipx install 'crawl4ai>=0.8.6'";
      } else if (commandExists("uv")) {
        installCmd = "uv tool install 'crawl4ai>=0.8.6'";
      } else {
        installCmd = "pip install --user --break-system-packages --upgrade 'crawl4ai>=0.8.6'";
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
      return {
        component: "Crawl4AI",
        status: verified ? "installed" : "failed",
        message: verified ? (existed ? "Crawl4AI upgraded to latest" : "Crawl4AI installed successfully") : "Crawl4AI install ran but verification failed (try: pipx install crawl4ai)",
        verifyPassed: verified,
      };
    } catch (err) {
      return {
        component: "Crawl4AI",
        status: "failed",
        message: `Crawl4AI install failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () =>
    commandExists("crwl") ||
    commandExists("crawl4ai-doctor") ||
    commandExists("crawl4ai-setup"),
};

const docforkSpec: ComponentSpec = {
  id: 10,
  name: "docfork",
  displayName: "Docfork",
  description: "Documentation fetching MCP server (requires DOCFORK_API_KEY)",
  tier: "recommended",
  category: "browser-web",
  probe: async () => ({ present: false }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async (_env, _plan, dryRun) => {
    try {
      const key = process.env.DOCFORK_API_KEY ?? "";
      if (dryRun) {
        log.info("[dry-run] Would register Docfork MCP config (requires DOCFORK_API_KEY)");
        return {
          component: "Docfork",
          status: "skipped",
          message: "[dry-run] Would register Docfork MCP server",
          verifyPassed: false,
        };
      }
      if (!key) {
        return {
          component: "Docfork",
          status: "skipped",
          message: "DOCFORK_API_KEY not set — add to ~/.config/yka-code/secrets.env and re-run",
          verifyPassed: false,
        };
      }
      await registerMcp("docfork", {
        transport: "stdio",
        command: "npx",
        args: ["-y", "docfork"],
        env: { DOCFORK_API_KEY: key },
      });
      log.success(`Docfork MCP server registered (DOCFORK_API_KEY found, ${key.length}-char key)`);
      return {
        component: "Docfork",
        status: "installed",
        message: `Docfork MCP registered with existing DOCFORK_API_KEY (${key.length} chars)`,
        verifyPassed: true,
      };
    } catch (err) {
      return {
        component: "Docfork",
        status: "failed",
        message: `Docfork MCP config failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => true,
};

const deepwikiSpec: ComponentSpec = {
  id: 11,
  name: "deepwiki",
  displayName: "DeepWiki",
  description: "Deep wiki MCP server",
  tier: "recommended",
  category: "browser-web",
  probe: async () => ({ present: false }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async (_env, _plan, dryRun) => {
    try {
      if (dryRun) {
        log.info("[dry-run] Would register DeepWiki MCP config");
        return {
          component: "DeepWiki",
          status: "skipped",
          message: "[dry-run] Would register DeepWiki MCP server",
          verifyPassed: false,
        };
      }
      await registerMcp("deepwiki", {
        transport: "http",
        url: "https://mcp.deepwiki.com/mcp",
      });
      log.success("DeepWiki MCP server registered");
      return {
        component: "DeepWiki",
        status: "installed",
        message: "DeepWiki MCP config registered",
        verifyPassed: true,
      };
    } catch (err) {
      return {
        component: "DeepWiki",
        status: "failed",
        message: `DeepWiki MCP config failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => true,
};

export const browserWebSpecs: ComponentSpec[] = [playwrightSpec, crawl4aiSpec, docforkSpec, deepwikiSpec];

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const spec of browserWebSpecs) {
    results.push(await runComponent(spec, env, dryRun));
  }
  return results;
}
