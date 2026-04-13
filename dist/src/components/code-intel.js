import { exec, commandExists, installBinary } from "../utils.js";
export const codeIntel = {
    id: "code-intel",
    name: "Code Intelligence",
    description: "Semantic code analysis with LSP type resolution and AST pattern matching",
    recommended: true,
    components: [
        {
            name: "Serena",
            description: "LSP-powered semantic code intelligence — type resolution, cross-module refs",
            install: async (env) => {
                if (commandExists("serena")) {
                    return { component: "Serena", success: true, message: "Already installed", skipped: true };
                }
                const { exitCode } = exec("uv tool install serena-mcp");
                if (exitCode === 0) {
                    return { component: "Serena", success: true, message: "Installed via uv tool install" };
                }
                return { component: "Serena", success: false, message: "Failed to install Serena — ensure uv is available" };
            },
            verify: async (env) => {
                return commandExists("serena");
            },
        },
        {
            name: "ast-grep",
            description: "AST structural pattern matching via CLI",
            install: async (env) => {
                return installBinary({ name: "ast-grep", brew: "ast-grep", cargo: "ast-grep" }, env);
            },
            verify: async (env) => {
                return commandExists("ast-grep") || commandExists("sg");
            },
        },
    ],
};
//# sourceMappingURL=code-intel.js.map