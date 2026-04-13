import { commandExists, log } from "../utils.js";
export const database = {
    id: "database",
    name: "Database",
    description: "Hybrid classical+LLM database operations with index tuning and health analysis",
    recommended: false,
    components: [
        {
            name: "PostgreSQL MCP Pro",
            description: "Correct JOINs + index tuning + health analysis — 8 tools",
            install: async (env) => {
                log.info("PostgreSQL MCP Pro runs via npx @crystaldba/postgres-mcp-pro");
                log.info("Configure as MCP server in settings.json with your connection string");
                return { component: "PostgreSQL MCP Pro", success: true, message: "Available via npx (configure in settings.json)" };
            },
            verify: async (env) => {
                return commandExists("npx");
            },
        },
    ],
};
//# sourceMappingURL=database.js.map