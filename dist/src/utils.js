import { execSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import pc from "picocolors";
export function exec(cmd, opts) {
    try {
        const stdout = execSync(cmd, {
            cwd: opts?.cwd,
            encoding: "utf-8",
            stdio: opts?.silent ? "pipe" : ["pipe", "pipe", "pipe"],
            timeout: 120_000,
        });
        return { stdout: stdout.trim(), exitCode: 0 };
    }
    catch (e) {
        return { stdout: e.stdout?.toString().trim() ?? "", exitCode: e.status ?? 1 };
    }
}
export function commandExists(cmd) {
    const { exitCode } = exec(`which ${cmd}`, { silent: true });
    return exitCode === 0;
}
export function ensureDir(path) {
    if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
    }
}
export function fileExists(path) {
    return existsSync(path);
}
export function copyFile(src, dest) {
    ensureDir(dirname(dest));
    copyFileSync(src, dest);
}
export function writeFile(path, content) {
    ensureDir(dirname(path));
    writeFileSync(path, content, "utf-8");
}
export function readFile(path) {
    return readFileSync(path, "utf-8");
}
export function makeExecutable(path) {
    chmodSync(path, 0o755);
}
export function templateReplace(content, vars) {
    return Object.entries(vars).reduce((result, [key, value]) => result.replaceAll(`\${${key}}`, value), content);
}
export function getClaudeHome() {
    return join(homedir(), ".claude");
}
export function getConfigHome() {
    return join(homedir(), ".config");
}
export function symlinkSafe(target, link) {
    const { unlinkSync, symlinkSync } = require("node:fs");
    try {
        if (existsSync(link))
            unlinkSync(link);
        symlinkSync(target, link);
    }
    catch {
        copyFile(target, link);
    }
}
export function installBinary(pkg, env) {
    if (commandExists(pkg.name)) {
        return { component: pkg.name, success: true, message: "Already installed", skipped: true };
    }
    const commands = [
        { check: env.packageManager === "brew" && !!pkg.brew, cmd: `brew install ${pkg.brew}`, label: "brew" },
        { check: env.packageManager === "apt" && !!pkg.apt, cmd: `sudo apt-get install -y ${pkg.apt}`, label: "apt" },
        { check: env.packageManager === "pacman" && !!pkg.pacman, cmd: `sudo pacman -S --noconfirm ${pkg.pacman}`, label: "pacman" },
        { check: env.packageManager === "dnf" && !!pkg.dnf, cmd: `sudo dnf install -y ${pkg.dnf}`, label: "dnf" },
        { check: !!pkg.npm, cmd: `npm install -g ${pkg.npm}`, label: "npm" },
        { check: !!pkg.cargo, cmd: `cargo install ${pkg.cargo}`, label: "cargo" },
        { check: !!pkg.pip, cmd: `pip install ${pkg.pip}`, label: "pip" },
        { check: !!pkg.curl, cmd: pkg.curl, label: "curl" },
    ];
    for (const { check, cmd, label } of commands) {
        if (check) {
            const { exitCode } = exec(cmd);
            if (exitCode === 0) {
                return { component: pkg.name, success: true, message: `Installed via ${label}` };
            }
        }
    }
    return { component: pkg.name, success: false, message: `Could not install ${pkg.name} — no compatible package manager found` };
}
export function appendToShellRc(env, line, marker) {
    const rcFile = env.shell === "zsh" ? join(homedir(), ".zshrc")
        : env.shell === "fish" ? join(homedir(), ".config/fish/config.fish")
            : join(homedir(), ".bashrc");
    if (!fileExists(rcFile)) {
        writeFile(rcFile, `${line}\n`);
        return;
    }
    const content = readFile(rcFile);
    if (content.includes(marker))
        return;
    writeFile(rcFile, `${content}\n# ${marker}\n${line}\n`);
}
export const log = {
    info: (msg) => console.log(pc.cyan("ℹ"), msg),
    success: (msg) => console.log(pc.green("✓"), msg),
    warn: (msg) => console.log(pc.yellow("⚠"), msg),
    error: (msg) => console.log(pc.red("✗"), msg),
    dim: (msg) => console.log(pc.dim(msg)),
};
//# sourceMappingURL=utils.js.map