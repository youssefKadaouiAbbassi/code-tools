import { commandExists, log } from "../utils.js";
export const knowledge = {
    id: "knowledge",
    name: "Knowledge",
    description: "Persistent wiki-style knowledge management with Obsidian integration",
    recommended: false,
    components: [
        {
            name: "Obsidian",
            description: "LLM Wiki — scales to 6 agents + 50 sub-agents per user report",
            install: async (env) => {
                log.info("Obsidian is a desktop app — download from https://obsidian.md");
                log.info("Create a vault for your LLM Wiki (Karpathy model)");
                return { component: "Obsidian", success: true, message: "Desktop app — download from obsidian.md" };
            },
            verify: async (env) => {
                return commandExists("obsidian");
            },
        },
        {
            name: "claude-obsidian",
            description: "MCP server bridging Claude Code to your Obsidian vault",
            install: async (env) => {
                log.info("claude-obsidian MCP — configure in settings.json with your vault path");
                return { component: "claude-obsidian", success: true, message: "MCP server (configure in settings.json)" };
            },
            verify: async (env) => {
                return true;
            },
        },
    ],
};
//# sourceMappingURL=knowledge.js.map