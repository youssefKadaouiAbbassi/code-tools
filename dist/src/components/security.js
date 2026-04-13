import { exec, commandExists, installBinary } from "../utils.js";
export const security = {
    id: "security",
    name: "Security",
    description: "SAST, SCA, IaC scanning and container-level sandbox isolation",
    recommended: true,
    components: [
        {
            name: "Snyk MCP",
            description: "SAST + SCA + IaC + container scanning via MCP",
            install: async (env) => {
                const { exitCode } = exec("npx snyk mcp configure");
                if (exitCode === 0) {
                    return { component: "Snyk MCP", success: true, message: "Configured via npx snyk mcp configure" };
                }
                return { component: "Snyk MCP", success: false, message: "Failed to configure Snyk MCP" };
            },
            verify: async (env) => {
                return commandExists("snyk");
            },
        },
        {
            name: "container-use",
            description: "Docker-level isolation with per-agent git branches",
            install: async (env) => {
                return installBinary({ name: "cu", brew: "container-use", npm: "container-use" }, env);
            },
            verify: async (env) => {
                return commandExists("cu");
            },
        },
    ],
};
//# sourceMappingURL=security.js.map