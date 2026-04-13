import { exec, commandExists, log } from "../utils.js";
export const workflow = {
    id: "workflow",
    name: "Workflow",
    description: "Visual workflow automation and 500+ app integrations",
    recommended: false,
    components: [
        {
            name: "n8n",
            description: "Visual workflow builder — 525+ nodes, MCP integration",
            install: async (env) => {
                if (commandExists("n8n")) {
                    return { component: "n8n", success: true, message: "Already installed", skipped: true };
                }
                const { exitCode } = exec("npm install -g n8n");
                if (exitCode === 0) {
                    return { component: "n8n", success: true, message: "Installed via npm" };
                }
                return { component: "n8n", success: false, message: "Failed to install n8n — try docker: docker run -it --rm -p 5678:5678 n8nio/n8n" };
            },
            verify: async (env) => {
                return commandExists("n8n");
            },
        },
        {
            name: "Composio MCP",
            description: "Single endpoint for 500+ apps — SOC2, 20K free calls/mo",
            install: async (env) => {
                const apiKey = process.env.COMPOSIO_API_KEY;
                if (!apiKey) {
                    log.warn("Set COMPOSIO_API_KEY env var for Composio authentication");
                    return { component: "Composio MCP", success: false, message: "COMPOSIO_API_KEY not set" };
                }
                log.info("Composio MCP is a remote HTTP MCP — configure endpoint in settings.json");
                return { component: "Composio MCP", success: true, message: "Remote HTTP MCP (configure with COMPOSIO_API_KEY)" };
            },
            verify: async (env) => {
                return !!process.env.COMPOSIO_API_KEY;
            },
        },
    ],
};
//# sourceMappingURL=workflow.js.map