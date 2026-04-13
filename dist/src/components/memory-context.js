import { exec, log } from "../utils.js";
export const memoryContext = {
    id: "memory-context",
    name: "Memory & Context",
    description: "Persistent memory with semantic retrieval and context reduction for longer sessions",
    recommended: true,
    components: [
        {
            name: "claude-mem",
            description: "Auto capture + compress + 3-layer semantic retrieval — bind 127.0.0.1",
            install: async (env) => {
                const { exitCode } = exec("npx claude-mem install --bind 127.0.0.1");
                if (exitCode === 0) {
                    return { component: "claude-mem", success: true, message: "Installed via npx claude-mem install (bound to 127.0.0.1)" };
                }
                return { component: "claude-mem", success: false, message: "Failed to install claude-mem" };
            },
            verify: async (env) => {
                const { exitCode } = exec("npx claude-mem --version", { silent: true });
                return exitCode === 0;
            },
        },
        {
            name: "context-mode",
            description: "~98% context reduction via SQLite + FTS5 + BM25 — sessions 6x longer",
            install: async (env) => {
                log.info("context-mode MCP runs as an MCP server — configure in settings.json");
                return { component: "context-mode", success: true, message: "MCP server (configure in settings.json)" };
            },
            verify: async (env) => {
                return true;
            },
        },
    ],
};
//# sourceMappingURL=memory-context.js.map