import { exec, commandExists, log } from "../utils.js";
export const notifications = {
    id: "notifications",
    name: "Notifications",
    description: "Bidirectional messaging and smart approval notifications",
    recommended: false,
    components: [
        {
            name: "Channels",
            description: "Message Claude from phone — official Anthropic --channels flag",
            install: async (env) => {
                log.info("Channels is built into Claude Code — use --channels flag (e.g. --channels plugin:telegram)");
                return { component: "Channels", success: true, message: "Built-in — use --channels flag" };
            },
            verify: async (env) => {
                return commandExists("claude");
            },
        },
        {
            name: "claude-ntfy-hook",
            description: "Smart filtering + context-aware notifications with interactive Allow/Deny",
            install: async (env) => {
                if (commandExists("claude-ntfy-hook")) {
                    return { component: "claude-ntfy-hook", success: true, message: "Already installed", skipped: true };
                }
                const { exitCode } = exec("npm install -g claude-ntfy-hook");
                if (exitCode === 0) {
                    return { component: "claude-ntfy-hook", success: true, message: "Installed via npm" };
                }
                return { component: "claude-ntfy-hook", success: false, message: "Failed to install claude-ntfy-hook" };
            },
            verify: async (env) => {
                return commandExists("claude-ntfy-hook");
            },
        },
    ],
};
//# sourceMappingURL=notifications.js.map