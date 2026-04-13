import pc from "picocolors";
function hasTool(env, key) {
    const val = env.installedTools.get(key);
    if (!val)
        return "missing";
    if (val === "built-in")
        return "built-in";
    return "installed";
}
const CATEGORIES = [
    {
        name: "KERNEL",
        components: [
            { id: "claude-code", name: "Claude Code", check: (e) => hasTool(e, "claude-code") },
            { id: "claude-md", name: "CLAUDE.md", check: (e) => hasTool(e, "claude-md") },
            { id: "settings-json", name: "settings.json", check: (e) => hasTool(e, "settings-json") },
        ],
    },
    {
        name: "ENFORCEMENT",
        components: [
            { id: "hooks", name: "Unified hooks (6 scripts)", check: (e) => hasTool(e, "hooks") },
            { id: "native-security", name: "Security scanning (native)", check: (e) => hasTool(e, "native-security") },
            { id: "snyk-mcp", name: "Snyk MCP", check: (e) => hasTool(e, "snyk-mcp") },
        ],
    },
    {
        name: "CODE INTELLIGENCE",
        components: [
            { id: "serena", name: "Serena (LSP)", check: (e) => hasTool(e, "serena") },
            { id: "ast-grep", name: "ast-grep CLI", check: (e) => hasTool(e, "ast-grep") },
        ],
    },
    {
        name: "BROWSER",
        components: [
            { id: "playwright", name: "Playwright CLI", check: (e) => hasTool(e, "playwright") },
        ],
    },
    {
        name: "WEB",
        components: [
            { id: "crawl4ai", name: "Crawl4AI", check: (e) => hasTool(e, "crawl4ai") },
        ],
    },
    {
        name: "DOCS",
        components: [
            { id: "docfork", name: "Docfork", check: (e) => hasTool(e, "docfork") },
            { id: "deepwiki", name: "DeepWiki", check: (e) => hasTool(e, "deepwiki") },
        ],
    },
    {
        name: "MEMORY",
        components: [
            { id: "claude-mem", name: "claude-mem", check: (e) => hasTool(e, "claude-mem") },
        ],
    },
    {
        name: "CONTEXT",
        components: [
            { id: "context-mode", name: "context-mode", check: (e) => hasTool(e, "context-mode") },
        ],
    },
    {
        name: "SANDBOX",
        components: [
            { id: "native-sandbox", name: "Native PID-ns + seccomp", check: (e) => hasTool(e, "native-sandbox") },
            { id: "container-use", name: "container-use", check: (e) => hasTool(e, "container-use") },
        ],
    },
    {
        name: "GITHUB",
        components: [
            { id: "gh", name: "gh CLI", check: (e) => hasTool(e, "gh") },
            { id: "github-mcp-server", name: "GitHub MCP Server", check: (e) => hasTool(e, "github-mcp-server") },
            { id: "claude-code-action", name: "claude-code-action", check: (e) => hasTool(e, "claude-code-action") },
        ],
    },
    {
        name: "CODE REVIEW",
        components: [
            { id: "claude-code-review", name: "Claude Code Review", check: (e) => hasTool(e, "claude-code-review") },
            { id: "coderabbit", name: "CodeRabbit", check: (e) => hasTool(e, "coderabbit") },
        ],
    },
    {
        name: "NOTIFICATIONS",
        components: [
            { id: "channels", name: "Channels", check: (e) => hasTool(e, "channels") },
            { id: "claude-ntfy-hook", name: "claude-ntfy-hook", check: (e) => hasTool(e, "claude-ntfy-hook") },
        ],
    },
    {
        name: "OBSERVABILITY",
        components: [
            { id: "native-telemetry", name: "Native /cost + telemetry", check: (e) => hasTool(e, "native-telemetry") },
            { id: "ccflare", name: "ccflare", check: (e) => hasTool(e, "ccflare") },
        ],
    },
    {
        name: "ORCHESTRATION",
        components: [
            { id: "agent-teams", name: "Agent Teams", check: (e) => hasTool(e, "agent-teams") },
            { id: "multica", name: "Multica", check: (e) => hasTool(e, "multica") },
        ],
    },
    {
        name: "AUTONOMY",
        components: [
            { id: "autoresearch", name: "autoresearch", check: (e) => hasTool(e, "autoresearch") },
        ],
    },
    {
        name: "WORKFLOW",
        components: [
            { id: "n8n", name: "n8n", check: (e) => hasTool(e, "n8n") },
        ],
    },
    {
        name: "DATABASE",
        components: [
            { id: "postgresql-mcp-pro", name: "PostgreSQL MCP Pro", check: (e) => hasTool(e, "postgresql-mcp-pro") },
        ],
    },
    {
        name: "DESIGN",
        components: [
            { id: "google-stitch", name: "Google Stitch", check: (e) => hasTool(e, "google-stitch") },
            { id: "awesome-design-md", name: "awesome-design-md", check: (e) => hasTool(e, "awesome-design-md") },
        ],
    },
    {
        name: "KNOWLEDGE",
        components: [
            { id: "obsidian", name: "Obsidian + claude-obsidian", check: (e) => hasTool(e, "obsidian") },
        ],
    },
    {
        name: "BUILD",
        components: [
            { id: "mise", name: "mise", check: (e) => hasTool(e, "mise") },
            { id: "just", name: "just", check: (e) => hasTool(e, "just") },
        ],
    },
    {
        name: "INTEGRATIONS",
        components: [
            { id: "composio", name: "Composio MCP", check: (e) => hasTool(e, "composio") },
        ],
    },
    {
        name: "WORKSTATION",
        components: [
            { id: "ghostty", name: "Ghostty", check: (e) => hasTool(e, "ghostty") },
            { id: "tmux", name: "tmux", check: (e) => hasTool(e, "tmux") },
            { id: "git-worktrees", name: "Git worktrees", check: (e) => hasTool(e, "git-worktrees") },
            { id: "chezmoi", name: "chezmoi + age", check: (e) => hasTool(e, "chezmoi") },
            { id: "tasks-lessons", name: "tasks/lessons.md", check: (e) => hasTool(e, "tasks-lessons") },
        ],
    },
];
function statusIcon(status) {
    switch (status) {
        case "installed":
            return pc.green("*");
        case "built-in":
            return pc.green("~");
        case "missing":
            return pc.red("x");
    }
}
function statusLabel(status) {
    switch (status) {
        case "installed":
            return pc.green("installed");
        case "built-in":
            return pc.green("built-in");
        case "missing":
            return pc.red("missing");
    }
}
export function showStatus(env) {
    console.log("");
    console.log(pc.bold("Claude Code Tools v12 — Status"));
    console.log(pc.dim(`OS: ${env.os} | Shell: ${env.shell} | Pkg: ${env.packageManager ?? "none"}`));
    console.log("");
    let totalInstalled = 0;
    let totalMissing = 0;
    let totalBuiltIn = 0;
    for (const category of CATEGORIES) {
        console.log(pc.bold(pc.underline(category.name)));
        for (const comp of category.components) {
            const status = comp.check(env);
            const version = env.installedTools.get(comp.id) ?? "";
            const versionStr = version && version !== "installed" && version !== "present" && version !== "built-in" && version !== "configured"
                ? pc.dim(` (${version})`)
                : "";
            console.log(`  ${statusIcon(status)} ${comp.name.padEnd(30)} ${statusLabel(status)}${versionStr}`);
            if (status === "installed")
                totalInstalled++;
            else if (status === "built-in")
                totalBuiltIn++;
            else
                totalMissing++;
        }
        console.log("");
    }
    const total = totalInstalled + totalBuiltIn + totalMissing;
    console.log(pc.bold("Summary"));
    console.log(`  ${pc.green(`${totalInstalled + totalBuiltIn} installed`)} (${totalBuiltIn} built-in) | ${pc.red(`${totalMissing} missing`)} | ${total} total`);
    console.log("");
}
//# sourceMappingURL=status.js.map