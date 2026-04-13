import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { copyFile, ensureDir, fileExists, writeFile, readFile, makeExecutable, installBinary, symlinkSafe, appendToShellRc, exec, log, } from "./utils.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIGS_DIR = join(__dirname, "..", "configs");
function configPath(...segments) {
    return join(CONFIGS_DIR, ...segments);
}
async function installSettingsJson(env) {
    const dest = join(env.claudeDir, "settings.json");
    const src = configPath("home-claude", "settings.json");
    if (!fileExists(src)) {
        return { component: "settings.json", success: false, message: `Source config not found: ${src}` };
    }
    if (fileExists(dest)) {
        // Merge: preserve existing keys, add missing ones from template
        try {
            const existing = JSON.parse(readFile(dest));
            const template = JSON.parse(readFile(src));
            // Merge env vars (add missing, don't overwrite)
            existing.env = { ...template.env, ...existing.env };
            // Merge permissions (union)
            if (template.permissions) {
                existing.permissions = existing.permissions ?? {};
                const existingAllow = new Set(existing.permissions.allow ?? []);
                for (const rule of template.permissions.allow ?? []) {
                    existingAllow.add(rule);
                }
                existing.permissions.allow = [...existingAllow];
                const existingDeny = new Set(existing.permissions.deny ?? []);
                for (const rule of template.permissions.deny ?? []) {
                    existingDeny.add(rule);
                }
                existing.permissions.deny = [...existingDeny];
            }
            // Merge hooks (add missing matchers)
            if (template.hooks) {
                existing.hooks = existing.hooks ?? {};
                for (const [event, hookList] of Object.entries(template.hooks)) {
                    existing.hooks[event] = existing.hooks[event] ?? hookList;
                }
            }
            writeFile(dest, JSON.stringify(existing, null, 2));
            return { component: "settings.json", success: true, message: "Merged with existing settings" };
        }
        catch {
            return { component: "settings.json", success: true, message: "Existing settings.json preserved (merge failed)", skipped: true };
        }
    }
    ensureDir(env.claudeDir);
    copyFile(src, dest);
    return { component: "settings.json", success: true, message: "Installed settings.json" };
}
async function installClaudeMd(env) {
    const dest = join(env.claudeDir, "CLAUDE.md");
    const src = configPath("home-claude", "CLAUDE.md");
    if (fileExists(dest)) {
        return { component: "CLAUDE.md", success: true, message: "Already exists", skipped: true };
    }
    if (!fileExists(src)) {
        return { component: "CLAUDE.md", success: false, message: `Source config not found: ${src}` };
    }
    ensureDir(env.claudeDir);
    copyFile(src, dest);
    return { component: "CLAUDE.md", success: true, message: "Installed CLAUDE.md" };
}
async function installAgentSymlinks(env) {
    const claudeMd = join(env.claudeDir, "CLAUDE.md");
    if (!fileExists(claudeMd)) {
        return { component: "agent-symlinks", success: false, message: "CLAUDE.md must exist first" };
    }
    const links = [
        { name: "AGENTS.md", target: claudeMd },
        { name: "GEMINI.md", target: claudeMd },
    ];
    for (const { name, target } of links) {
        const linkPath = join(env.claudeDir, name);
        if (fileExists(linkPath))
            continue;
        symlinkSafe(target, linkPath);
    }
    return { component: "agent-symlinks", success: true, message: "Created AGENTS.md + GEMINI.md symlinks" };
}
async function installHooks(env) {
    const hooksDir = join(env.claudeDir, "hooks");
    const srcHooksDir = configPath("home-claude", "hooks");
    const hookScripts = [
        "pre-destructive-blocker.sh",
        "pre-secrets-guard.sh",
        "post-lint-gate.sh",
        "session-start.sh",
        "session-end.sh",
        "stop-summary.sh",
    ];
    ensureDir(hooksDir);
    let installed = 0;
    for (const script of hookScripts) {
        const src = join(srcHooksDir, script);
        const dest = join(hooksDir, script);
        if (fileExists(dest))
            continue;
        if (!fileExists(src)) {
            log.warn(`Hook source not found: ${src}`);
            continue;
        }
        copyFile(src, dest);
        makeExecutable(dest);
        installed++;
    }
    return {
        component: "hooks",
        success: true,
        message: installed > 0 ? `Installed ${installed} hook scripts` : "All hooks already present",
        skipped: installed === 0,
    };
}
async function installTmuxConf(_env) {
    const dest = join(homedir(), ".tmux.conf");
    const src = configPath("tmux.conf");
    if (fileExists(dest)) {
        return { component: "tmux.conf", success: true, message: "Already exists", skipped: true };
    }
    if (!fileExists(src)) {
        // Create a minimal tmux config
        const content = [
            "# Claude Code Tools — tmux config",
            "set -g default-terminal 'tmux-256color'",
            "set -g mouse on",
            "set -g history-limit 50000",
            "set -g status-interval 5",
            "set -s escape-time 0",
            "set -g focus-events on",
            "",
            "# Pane splitting",
            "bind | split-window -h -c '#{pane_current_path}'",
            "bind - split-window -v -c '#{pane_current_path}'",
            "",
            "# Easy reload",
            "bind r source-file ~/.tmux.conf \\; display 'Reloaded'",
            "",
        ].join("\n");
        writeFile(dest, content);
        return { component: "tmux.conf", success: true, message: "Created minimal tmux.conf" };
    }
    copyFile(src, dest);
    return { component: "tmux.conf", success: true, message: "Installed tmux.conf" };
}
async function installStarshipToml(env) {
    const dest = join(env.configDir, "starship.toml");
    const src = configPath("starship.toml");
    if (fileExists(dest)) {
        return { component: "starship.toml", success: true, message: "Already exists", skipped: true };
    }
    if (!fileExists(src)) {
        // Create minimal starship config
        const content = [
            '# Claude Code Tools — Starship prompt',
            'format = "$directory$git_branch$git_status$character"',
            "",
            "[character]",
            'success_symbol = "[>](bold green)"',
            'error_symbol = "[>](bold red)"',
            "",
            "[git_branch]",
            'format = "[$symbol$branch]($style) "',
            "",
            "[git_status]",
            'format = "[$all_status$ahead_behind]($style) "',
            "",
        ].join("\n");
        ensureDir(env.configDir);
        writeFile(dest, content);
        return { component: "starship.toml", success: true, message: "Created minimal starship.toml" };
    }
    ensureDir(env.configDir);
    copyFile(src, dest);
    return { component: "starship.toml", success: true, message: "Installed starship.toml" };
}
async function installMise(env) {
    return installBinary({
        name: "mise",
        brew: "mise",
        apt: "mise",
        curl: "curl https://mise.run | sh",
    }, env);
}
async function installJust(env) {
    return installBinary({
        name: "just",
        brew: "just",
        pacman: "just",
        cargo: "just",
        curl: "curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin",
    }, env);
}
async function addGitWorktreeAliases(_env) {
    const aliases = {
        "wt-add": "worktree add",
        "wt-list": "worktree list",
        "wt-remove": "worktree remove",
        "wt-prune": "worktree prune",
    };
    let added = 0;
    for (const [alias, cmd] of Object.entries(aliases)) {
        const { exitCode } = exec(`git config --global alias.${alias}`, { silent: true });
        if (exitCode !== 0) {
            exec(`git config --global alias.${alias} "${cmd}"`, { silent: true });
            added++;
        }
    }
    return {
        component: "git-worktree-aliases",
        success: true,
        message: added > 0 ? `Added ${added} git worktree aliases` : "All aliases already present",
        skipped: added === 0,
    };
}
async function enableTelemetryEnvVars(env) {
    const vars = [
        'export CLAUDE_CODE_ENABLE_TELEMETRY="1"',
        'export CLAUDE_CODE_ENHANCED_TELEMETRY_BETA="1"',
        'export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"',
    ].join("\n");
    appendToShellRc(env, vars, "code-tools-telemetry");
    return { component: "telemetry-env", success: true, message: "Telemetry env vars added to shell rc" };
}
async function createTasksLessons(_env) {
    const tasksDir = join(homedir(), "tasks");
    const lessonsFile = join(tasksDir, "lessons.md");
    if (fileExists(lessonsFile)) {
        return { component: "tasks/lessons.md", success: true, message: "Already exists", skipped: true };
    }
    const content = [
        "# Lessons Learned",
        "",
        "Self-improvement log. Append new entries with date and context.",
        "Review at session start. Do not repeat known mistakes.",
        "",
        "## Template",
        "",
        "### YYYY-MM-DD — [Topic]",
        "- **What happened:** ...",
        "- **Root cause:** ...",
        "- **Lesson:** ...",
        "- **Prevention:** ...",
        "",
    ].join("\n");
    ensureDir(tasksDir);
    writeFile(lessonsFile, content);
    return { component: "tasks/lessons.md", success: true, message: "Created tasks/lessons.md" };
}
export async function installPrimordial(env, _backup) {
    const steps = [
        installSettingsJson,
        installClaudeMd,
        installAgentSymlinks,
        installHooks,
        installTmuxConf,
        installStarshipToml,
        installMise,
        installJust,
        addGitWorktreeAliases,
        enableTelemetryEnvVars,
        createTasksLessons,
    ];
    const results = [];
    for (const step of steps) {
        try {
            const result = await step(env);
            results.push(result);
            if (result.success && !result.skipped) {
                log.success(`${result.component}: ${result.message}`);
            }
            else if (result.skipped) {
                log.dim(`${result.component}: ${result.message}`);
            }
            else {
                log.error(`${result.component}: ${result.message}`);
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            results.push({ component: step.name, success: false, message });
            log.error(`${step.name}: ${message}`);
        }
    }
    return results;
}
//# sourceMappingURL=primordial.js.map