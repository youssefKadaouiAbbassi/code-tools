import { $ } from "bun";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { log } from "../utils.js";
import { registerMcp } from "../registry/mcp.js";
import type { ComponentSpec } from "./framework.js";
import { runComponent } from "./framework.js";

export const workflowCategory: ComponentCategory = {
  id: "workflow",
  name: "Workflow",
  tier: "optional",
  description: "Integration platform MCP (Composio \u2014 500+ SaaS via one MCP)",
  defaultEnabled: false,
  components: [
    {
      id: 35,
      name: "composio",
      displayName: "Composio",
      description: "AI integration platform MCP server (requires COMPOSIO_API_KEY)",
      tier: "optional",
      category: "workflow",
      packages: [],
      mcpConfig: {
        name: "composio",
        type: "http",
        url: "https://backend.composio.dev/v3/mcp/${COMPOSIO_MCP_SERVER_ID}?user_id=${COMPOSIO_USER_ID}",
        headers: { "x-api-key": "${COMPOSIO_API_KEY}" },
      },
      verifyCommand: "claude mcp list | grep -q '^composio:'",
    },
  ],
};

const composioSpec: ComponentSpec = {
  id: 35,
  name: "composio",
  displayName: "Composio",
  description: "AI integration platform MCP server (requires COMPOSIO_API_KEY)",
  tier: "optional",
  category: "workflow",
  probe: async () => ({ present: false }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async (env, _plan, dryRun) => {
    try {
      const key = process.env.COMPOSIO_API_KEY ?? "";
      const userId = process.env.COMPOSIO_USER_ID || env.homeDir.split("/").pop() || "user";
      let serverId = process.env.COMPOSIO_MCP_SERVER_ID ?? "";

      if (dryRun) {
        log.info("[dry-run] Would register Composio MCP (v3 endpoint, x-api-key header)");
        return {
          component: "Composio",
          status: "skipped",
          message: "[dry-run] Would register Composio HTTP MCP server",
          verifyPassed: false,
        };
      }
      if (!key) {
        return {
          component: "Composio",
          status: "skipped",
          message: "COMPOSIO_API_KEY not set — add to ~/.config/yka-code/secrets.env and re-run",
          verifyPassed: false,
        };
      }

      if (!serverId) {
        const body = JSON.stringify({
          name: "yka-code",
          auth_config_ids: [],
          no_auth_apps: ["composio"],
        });
        const resp = await $`curl --connect-timeout 15 --max-time 30 -sS -X POST https://backend.composio.dev/api/v3/mcp/servers -H ${"x-api-key: " + key} -H ${"Content-Type: application/json"} -d ${body}`.quiet().text();
        let parsed: { id?: string; error?: string } = {};
        try {
          parsed = JSON.parse(resp);
        } catch (err) {
          log.warn(`Composio bootstrap: unparsable response (${err instanceof Error ? err.message : String(err)}): ${resp.slice(0, 200)}`);
        }
        if (parsed.error) log.warn(`Composio bootstrap rejected: ${parsed.error}`);
        if (parsed.id && /^[A-Za-z0-9_-]{6,}$/.test(parsed.id)) {
          serverId = parsed.id;
          log.info(`Composio bootstrap MCP server created: ${serverId}`);
          const secretsPath = `${env.homeDir}/.config/yka-code/secrets.env`;
          await fs.mkdir(dirname(secretsPath), { recursive: true });
          let existing = "";
          try { existing = await fs.readFile(secretsPath, "utf-8"); } catch { }
          const filtered = existing
            .split("\n")
            .filter((l) => l.length > 0 && !l.startsWith("export COMPOSIO_MCP_SERVER_ID="));
          filtered.push(`export COMPOSIO_MCP_SERVER_ID=${JSON.stringify(serverId)}`);
          await fs.writeFile(secretsPath, filtered.join("\n") + "\n", { mode: 0o600 });
          await fs.chmod(secretsPath, 0o600);
        } else if (parsed.id) {
          log.warn(`Composio bootstrap: malformed id rejected`);
        }
      }

      if (!serverId) {
        return {
          component: "Composio",
          status: "failed",
          message: "Could not create or resolve COMPOSIO_MCP_SERVER_ID — check that COMPOSIO_API_KEY is valid at app.composio.dev",
          verifyPassed: false,
        };
      }

      await registerMcp("composio", {
        transport: "http",
        url: `https://backend.composio.dev/v3/mcp/${serverId}?user_id=${encodeURIComponent(userId)}`,
        headers: { "x-api-key": key },
      });
      log.success("Composio MCP server registered");
      return {
        component: "Composio",
        status: "installed",
        message: `Composio MCP registered (server=${serverId.slice(0, 8)}…, user=${userId}) — use COMPOSIO_LIST_TOOLKITS to add more integrations`,
        verifyPassed: true,
      };
    } catch (err) {
      return {
        component: "Composio",
        status: "failed",
        message: `Composio MCP config failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => true,
};

export const workflowSpecs: ComponentSpec[] = [composioSpec];

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const spec of workflowSpecs) {
    results.push(await runComponent(spec, env, dryRun));
  }
  return results;
}
