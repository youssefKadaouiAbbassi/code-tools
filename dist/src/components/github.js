import { log } from "../utils.js";
export const github = {
    id: "github",
    name: "GitHub",
    description: "GitHub MCP operations, CI automation, and cross-vendor code review",
    recommended: true,
    components: [
        {
            name: "github-mcp",
            description: "Remote HTTP MCP with 93 tools and batch ops — requires GITHUB_PAT",
            install: async (env) => {
                const pat = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
                if (!pat) {
                    log.warn("Set GITHUB_PAT or GITHUB_TOKEN env var for github-mcp authentication");
                    return { component: "github-mcp", success: false, message: "GITHUB_PAT or GITHUB_TOKEN not set" };
                }
                log.info("github-mcp is a remote HTTP MCP — configure endpoint in settings.json with your GITHUB_PAT");
                return { component: "github-mcp", success: true, message: "Remote HTTP MCP (configure with GITHUB_PAT)" };
            },
            verify: async (env) => {
                return !!(process.env.GITHUB_PAT || process.env.GITHUB_TOKEN);
            },
        },
        {
            name: "claude-code-action",
            description: "Automated PR review in CI — use separate API key with --bare",
            install: async (env) => {
                log.info("claude-code-action is a GitHub Action — add claude-code-action@v1 to your workflow YAML");
                log.info("Use a separate API key and --bare flag for CI runs");
                return { component: "claude-code-action", success: true, message: "GitHub Action — add to .github/workflows/" };
            },
            verify: async (env) => {
                return true;
            },
        },
        {
            name: "CodeRabbit",
            description: "Cross-vendor code review — highest F1 (51.2%), multi-model + 40 static analyzers",
            install: async (env) => {
                log.info("CodeRabbit is a GitHub App — install from https://github.com/apps/coderabbitai");
                log.info("Free for private and public repos");
                return { component: "CodeRabbit", success: true, message: "GitHub App — install from marketplace" };
            },
            verify: async (env) => {
                return true;
            },
        },
    ],
};
//# sourceMappingURL=github.js.map