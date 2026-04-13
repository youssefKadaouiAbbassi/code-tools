import { exec, commandExists } from "../utils.js";
export const observability = {
    id: "observability",
    name: "Observability",
    description: "Token spend monitoring and per-tool cost breakdown",
    recommended: false,
    components: [
        {
            name: "ccflare",
            description: "API proxy + monitoring TUI — token spend, per-tool breakdown",
            install: async (env) => {
                if (commandExists("ccflare")) {
                    return { component: "ccflare", success: true, message: "Already installed", skipped: true };
                }
                const { exitCode } = exec("npm install -g ccflare");
                if (exitCode === 0) {
                    return { component: "ccflare", success: true, message: "Installed via npm" };
                }
                return { component: "ccflare", success: false, message: "Failed to install ccflare" };
            },
            verify: async (env) => {
                return commandExists("ccflare");
            },
        },
    ],
};
//# sourceMappingURL=observability.js.map