import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, registerMcp, log } from "../utils.js";

export const workflowCategory: ComponentCategory = {
  id: "workflow",
  name: "Workflow",
  tier: "optional",
  description: "Workflow automation and integration platforms",
  defaultEnabled: false,
  components: [
    {
      id: 28,
      name: "n8n",
      displayName: "n8n",
      description: "Open-source workflow automation tool",
      tier: "optional",
      category: "workflow",
      packages: [
        {
          name: "n8n",
          displayName: "n8n",
          npm: "npm install -g n8n",
        },
      ],
      verifyCommand: "n8n --version",
    },
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
      verifyCommand: "echo composio-mcp-config",
    },
  ],
};

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  // --- n8n ---
  try {
    if (commandExists("n8n")) {
      log.info("n8n already installed, skipping");
      results.push({
        component: "n8n",
        status: "already-installed",
        message: "n8n is already installed",
        verifyPassed: true,
      });
    } else if (dryRun) {
      log.info("[dry-run] Would run: npm install -g n8n");
      results.push({
        component: "n8n",
        status: "skipped",
        message: "[dry-run] Would install n8n",
        verifyPassed: false,
      });
    } else {
      await $`sh -c "npm install -g n8n"`;
      const installed = commandExists("n8n");
      results.push({
        component: "n8n",
        status: installed ? "installed" : "failed",
        message: installed ? "n8n installed successfully" : "n8n install ran but binary not found",
        verifyPassed: installed,
      });
    }
  } catch (err) {
    results.push({
      component: "n8n",
      status: "failed",
      message: `n8n install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- Composio MCP (HTTP v3) ---
  //
  // Composio's live MCP endpoint shape (as of Apr 2026):
  //   https://backend.composio.dev/v3/mcp/<SERVER_ID>?user_id=<UID>
  //   header: x-api-key: <COMPOSIO_API_KEY>
  //
  // Legacy `https://mcp.composio.dev/composio/server/<KEY>/mcp` is dead (301 → 404).
  // `Authorization: Bearer` is wrong; composio uses `x-api-key`.
  //
  // If COMPOSIO_MCP_SERVER_ID is unset but the key is valid, we auto-bootstrap
  // a server that exposes the no-auth `composio` meta-toolkit
  // (LIST_TOOLKITS / INITIATE_CONNECTION / EXECUTE_TOOL), so the user can wire
  // extra toolkits later directly from Claude Code without leaving the session.
  try {
    const key = process.env.COMPOSIO_API_KEY ?? "";
    const userId = process.env.COMPOSIO_USER_ID || env.homeDir.split("/").pop() || "user";
    let serverId = process.env.COMPOSIO_MCP_SERVER_ID ?? "";

    if (dryRun) {
      log.info("[dry-run] Would register Composio MCP (v3 endpoint, x-api-key header)");
      results.push({
        component: "Composio",
        status: "skipped",
        message: "[dry-run] Would register Composio HTTP MCP server",
        verifyPassed: false,
      });
    } else if (!key) {
      results.push({
        component: "Composio",
        status: "skipped",
        message: "COMPOSIO_API_KEY not set — add to ~/.config/code-tools/secrets.env and re-run",
        verifyPassed: false,
      });
    } else {
      if (!serverId) {
        const body = JSON.stringify({
          name: "code-tools",
          auth_config_ids: [],
          no_auth_apps: ["composio"],
        });
        const resp = await $`curl -sS -X POST https://backend.composio.dev/api/v3/mcp/servers -H ${"x-api-key: " + key} -H ${"Content-Type: application/json"} -d ${body}`.quiet().text();
        try {
          const parsed = JSON.parse(resp) as { id?: string };
          if (parsed.id) {
            serverId = parsed.id;
            log.info(`Composio bootstrap MCP server created: ${serverId}`);
            const secretsPath = `${env.homeDir}/.config/code-tools/secrets.env`;
            await $`sh -c ${`grep -v '^export COMPOSIO_MCP_SERVER_ID=' "${secretsPath}" 2>/dev/null > "${secretsPath}.tmp" || true; echo 'export COMPOSIO_MCP_SERVER_ID="${serverId}"' >> "${secretsPath}.tmp"; mv "${secretsPath}.tmp" "${secretsPath}"; chmod 600 "${secretsPath}"`}`.quiet().nothrow();
          }
        } catch { /* fall through to error below */ }
      }

      if (!serverId) {
        results.push({
          component: "Composio",
          status: "failed",
          message: "Could not create or resolve COMPOSIO_MCP_SERVER_ID — check that COMPOSIO_API_KEY is valid at app.composio.dev",
          verifyPassed: false,
        });
      } else {
        await registerMcp("composio", {
          transport: "http",
          url: `https://backend.composio.dev/v3/mcp/${serverId}?user_id=${encodeURIComponent(userId)}`,
          headers: { "x-api-key": key },
        });
        log.success("Composio MCP server registered");
        results.push({
          component: "Composio",
          status: "installed",
          message: `Composio MCP registered (server=${serverId.slice(0, 8)}…, user=${userId}) — use COMPOSIO_LIST_TOOLKITS to add more integrations`,
          verifyPassed: true,
        });
      }
    }
  } catch (err) {
    results.push({
      component: "Composio",
      status: "failed",
      message: `Composio MCP config failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  return results;
}
