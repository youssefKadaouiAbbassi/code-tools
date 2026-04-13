import { commandExists, installBinary, log } from "../utils.js";
export const workstation = {
    id: "workstation",
    name: "Workstation",
    description: "Terminal, multiplexer, and encrypted dotfile management",
    recommended: true,
    components: [
        {
            name: "Ghostty",
            description: "GPU-accelerated terminal — Claude Code treats as first-class",
            install: async (env) => {
                if (commandExists("ghostty")) {
                    return { component: "Ghostty", success: true, message: "Already installed", skipped: true };
                }
                log.info("Ghostty — download from https://ghostty.org");
                log.info("GPU-accelerated terminal with first-class Claude Code support");
                return { component: "Ghostty", success: true, message: "Download from ghostty.org" };
            },
            verify: async (env) => {
                return commandExists("ghostty");
            },
        },
        {
            name: "tmux",
            description: "Terminal multiplexer — parallel sessions, detach/reattach",
            install: async (env) => {
                return installBinary({ name: "tmux", brew: "tmux", apt: "tmux", pacman: "tmux", dnf: "tmux" }, env);
            },
            verify: async (env) => {
                return commandExists("tmux");
            },
        },
        {
            name: "chezmoi",
            description: "Encrypted portable dotfiles management",
            install: async (env) => {
                return installBinary({ name: "chezmoi", brew: "chezmoi", apt: "chezmoi", pacman: "chezmoi", curl: "sh -c \"$(curl -fsLS get.chezmoi.io)\"" }, env);
            },
            verify: async (env) => {
                return commandExists("chezmoi");
            },
        },
        {
            name: "age",
            description: "Modern file encryption for chezmoi secrets",
            install: async (env) => {
                return installBinary({ name: "age", brew: "age", apt: "age", pacman: "age", dnf: "age" }, env);
            },
            verify: async (env) => {
                return commandExists("age");
            },
        },
    ],
};
//# sourceMappingURL=workstation.js.map