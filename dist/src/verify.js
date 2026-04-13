import { readFileSync } from "node:fs";
import { join } from "node:path";
import { commandExists, fileExists, log } from "./utils.js";
function checkBinaryInPath(name) {
    const exists = commandExists(name);
    return {
        component: name,
        passed: exists,
        check: "binary-in-path",
        message: exists ? `${name} found in PATH` : `${name} not found in PATH`,
    };
}
function checkFileExists(component, path) {
    const exists = fileExists(path);
    return {
        component,
        passed: exists,
        check: "file-exists",
        message: exists ? `${path} exists` : `${path} missing`,
    };
}
function checkMCPEntry(component, settingsPath, serverKey) {
    if (!fileExists(settingsPath)) {
        return {
            component,
            passed: false,
            check: "mcp-entry",
            message: `settings.json not found at ${settingsPath}`,
        };
    }
    try {
        const content = readFileSync(settingsPath, "utf-8");
        const json = JSON.parse(content);
        const servers = json.mcpServers ?? {};
        const found = Object.keys(servers).some((k) => k.toLowerCase().includes(serverKey.toLowerCase()));
        return {
            component,
            passed: found,
            check: "mcp-entry",
            message: found
                ? `MCP server "${serverKey}" configured`
                : `MCP server "${serverKey}" not found in settings`,
        };
    }
    catch {
        return {
            component,
            passed: false,
            check: "mcp-entry",
            message: "Failed to parse settings.json",
        };
    }
}
/** Map of component names to their verification strategy. */
function buildVerificationPlan(env, results) {
    const details = [];
    const settingsPath = join(env.claudeDir, "settings.json");
    for (const result of results) {
        if (!result.success && !result.skipped)
            continue;
        switch (result.component) {
            case "settings.json":
                details.push(checkFileExists("settings.json", join(env.claudeDir, "settings.json")));
                break;
            case "CLAUDE.md":
                details.push(checkFileExists("CLAUDE.md", join(env.claudeDir, "CLAUDE.md")));
                break;
            case "agent-symlinks":
                details.push(checkFileExists("AGENTS.md", join(env.claudeDir, "AGENTS.md")));
                details.push(checkFileExists("GEMINI.md", join(env.claudeDir, "GEMINI.md")));
                break;
            case "hooks":
                details.push(checkFileExists("hooks", join(env.claudeDir, "hooks", "pre-destructive-blocker.sh")));
                break;
            case "tmux.conf":
                details.push(checkFileExists("tmux.conf", join(env.homeDir, ".tmux.conf")));
                break;
            case "starship.toml":
                details.push(checkFileExists("starship.toml", join(env.configDir, "starship.toml")));
                break;
            case "mise":
                details.push(checkBinaryInPath("mise"));
                break;
            case "just":
                details.push(checkBinaryInPath("just"));
                break;
            case "git-worktree-aliases":
                details.push(checkBinaryInPath("git"));
                break;
            case "tasks/lessons.md":
                details.push(checkFileExists("tasks/lessons.md", join(env.homeDir, "tasks", "lessons.md")));
                break;
            default:
                // For MCP servers, check the settings.json entry
                if (result.component.includes("mcp") || result.component.includes("serena")) {
                    details.push(checkMCPEntry(result.component, settingsPath, result.component));
                }
                break;
        }
    }
    return details;
}
export async function verifyAll(env, results) {
    const details = buildVerificationPlan(env, results);
    let passed = 0;
    let failed = 0;
    for (const detail of details) {
        if (detail.passed) {
            passed++;
            log.success(`[verify] ${detail.component}: ${detail.message}`);
        }
        else {
            failed++;
            log.error(`[verify] ${detail.component}: ${detail.message}`);
        }
    }
    return { passed, failed, details };
}
//# sourceMappingURL=verify.js.map