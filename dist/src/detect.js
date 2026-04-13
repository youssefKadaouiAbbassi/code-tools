import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { commandExists, exec, fileExists } from "./utils.js";
/** All 40 v12 components grouped by detection strategy. */
const TOOL_COMMANDS = {
    // KERNEL
    "claude-code": "claude",
    // ENFORCEMENT
    // (hooks + security scanning checked via config files below)
    // CODE INTELLIGENCE
    "ast-grep": "ast-grep",
    // BROWSER
    "playwright": "playwright",
    // WEB
    // crawl4ai is a Python library, checked via pip
    // GITHUB
    "gh": "gh",
    // NOTIFICATIONS
    // channels + claude-ntfy-hook are config-based
    // OBSERVABILITY
    "ccflare": "ccflare",
    // ORCHESTRATION
    "multica": "multica",
    // AUTONOMY
    "autoresearch": "autoresearch",
    // WORKFLOW
    "n8n": "n8n",
    // BUILD
    "mise": "mise",
    "just": "just",
    // WORKSTATION
    "ghostty": "ghostty",
    "tmux": "tmux",
    "git": "git",
    "chezmoi": "chezmoi",
    "age": "age",
    // DATABASE
    // postgresql-mcp is an MCP server, checked via config
    // DESIGN
    // stitch + awesome-design-md are config/file-based
    // KNOWLEDGE
    "obsidian": "obsidian",
    // DOCS
    // docfork + deepwiki are MCP servers
};
/** Python packages to check via pip show. */
const PIP_PACKAGES = ["crawl4ai"];
/** MCP servers checked in settings.json / mcp.json. */
const MCP_SERVERS = [
    "serena",
    "docfork",
    "github-mcp-server",
    "context-mode",
    "composio",
    "postgresql-mcp-pro",
    "snyk-mcp",
];
/** Config files whose existence signals a component is present. */
const CONFIG_FILES = {
    "claude-md": (home) => join(home, ".claude", "CLAUDE.md"),
    "agents-md": (home) => join(home, ".claude", "AGENTS.md"),
    "settings-json": (home) => join(home, ".claude", "settings.json"),
    "hooks": (home) => join(home, ".claude", "hooks", "pre-destructive-blocker.sh"),
    "tmux-conf": (home) => join(home, ".tmux.conf"),
    "starship-toml": (home) => join(home, ".config", "starship.toml"),
    "tasks-lessons": (home) => join(home, "tasks", "lessons.md"),
    "claude-mem": (home) => join(home, ".claude", "plugins", "claude-mem"),
};
function detectOS() {
    const platform = process.platform;
    if (platform === "darwin")
        return "macos";
    if (platform === "linux") {
        try {
            const procVersion = readFileSync("/proc/version", "utf-8").toLowerCase();
            if (procVersion.includes("microsoft") || procVersion.includes("wsl")) {
                return "wsl";
            }
        }
        catch {
            // /proc/version not readable — plain linux
        }
        return "linux";
    }
    // Fallback for unexpected platforms
    return "linux";
}
function detectShell() {
    const shellEnv = process.env.SHELL ?? "";
    if (shellEnv.includes("zsh"))
        return "zsh";
    if (shellEnv.includes("fish"))
        return "fish";
    return "bash";
}
function detectPackageManager() {
    if (commandExists("brew"))
        return "brew";
    if (commandExists("apt"))
        return "apt";
    if (commandExists("pacman"))
        return "pacman";
    if (commandExists("dnf"))
        return "dnf";
    if (commandExists("zypper"))
        return "zypper";
    if (commandExists("nix"))
        return "nix";
    return null;
}
function detectMCPServers(home) {
    const found = new Map();
    const paths = [
        join(home, ".claude", "settings.json"),
        join(home, ".claude", "mcp.json"),
    ];
    for (const p of paths) {
        if (!fileExists(p))
            continue;
        try {
            const content = readFileSync(p, "utf-8");
            const json = JSON.parse(content);
            const servers = json.mcpServers ?? json.servers ?? {};
            for (const key of Object.keys(servers)) {
                const lower = key.toLowerCase();
                for (const mcp of MCP_SERVERS) {
                    if (lower.includes(mcp.replace(/-/g, "")) || lower.includes(mcp)) {
                        found.set(mcp, "configured");
                    }
                }
            }
        }
        catch {
            // Malformed JSON — skip
        }
    }
    return found;
}
export async function detectAll() {
    const home = homedir();
    const os = detectOS();
    const shell = detectShell();
    const packageManager = detectPackageManager();
    const installedTools = new Map();
    // Check CLI tools
    for (const [name, cmd] of Object.entries(TOOL_COMMANDS)) {
        if (commandExists(cmd)) {
            const { stdout } = exec(`${cmd} --version`, { silent: true });
            installedTools.set(name, stdout || "installed");
        }
    }
    // Check pip packages
    for (const pkg of PIP_PACKAGES) {
        const { exitCode, stdout } = exec(`pip show ${pkg}`, { silent: true });
        if (exitCode === 0) {
            const versionLine = stdout.split("\n").find((l) => l.startsWith("Version:"));
            installedTools.set(pkg, versionLine?.split(":")[1]?.trim() ?? "installed");
        }
    }
    // Check MCP servers
    const mcpServers = detectMCPServers(home);
    for (const [name, version] of mcpServers) {
        installedTools.set(name, version);
    }
    // Check config files
    for (const [name, pathFn] of Object.entries(CONFIG_FILES)) {
        if (fileExists(pathFn(home))) {
            installedTools.set(name, "present");
        }
    }
    // Native features (always present if claude-code is installed)
    if (installedTools.has("claude-code")) {
        installedTools.set("native-security", "built-in");
        installedTools.set("native-sandbox", "built-in");
        installedTools.set("native-telemetry", "built-in");
        installedTools.set("agent-teams", "built-in");
        installedTools.set("channels", "built-in");
        installedTools.set("claude-code-review", "built-in");
        installedTools.set("git-worktrees", "built-in");
    }
    // CodeRabbit (GitHub app, check via gh)
    if (commandExists("gh")) {
        const { exitCode } = exec("gh extension list 2>/dev/null | grep -q coderabbit", { silent: true });
        if (exitCode === 0) {
            installedTools.set("coderabbit", "installed");
        }
    }
    return {
        os,
        shell,
        packageManager,
        installedTools,
        homeDir: home,
        claudeDir: join(home, ".claude"),
        configDir: join(home, ".config"),
    };
}
//# sourceMappingURL=detect.js.map