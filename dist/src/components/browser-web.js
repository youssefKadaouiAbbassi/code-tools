import { exec, commandExists, log } from "../utils.js";
export const browserWeb = {
    id: "browser-web",
    name: "Browser & Web",
    description: "Browser automation, web scraping, library docs, and repo Q&A",
    recommended: true,
    components: [
        {
            name: "Playwright CLI",
            description: "Browser automation CLI — 4x fewer tokens than MCP wrapper",
            install: async (env) => {
                if (commandExists("playwright")) {
                    return { component: "Playwright CLI", success: true, message: "Already installed", skipped: true };
                }
                const { exitCode } = exec("npm install -g playwright");
                if (exitCode === 0) {
                    exec("npx playwright install chromium");
                    return { component: "Playwright CLI", success: true, message: "Installed via npm" };
                }
                return { component: "Playwright CLI", success: false, message: "Failed to install Playwright" };
            },
            verify: async (env) => {
                return commandExists("playwright");
            },
        },
        {
            name: "Crawl4AI",
            description: "Clean markdown from websites — pin v0.8.6+",
            install: async (env) => {
                const { exitCode: checkCode } = exec("pip show crawl4ai", { silent: true });
                if (checkCode === 0) {
                    return { component: "Crawl4AI", success: true, message: "Already installed", skipped: true };
                }
                const { exitCode } = exec("pip install 'crawl4ai>=0.8.6'");
                if (exitCode === 0) {
                    return { component: "Crawl4AI", success: true, message: "Installed via pip (>=0.8.6)" };
                }
                return { component: "Crawl4AI", success: false, message: "Failed to install Crawl4AI" };
            },
            verify: async (env) => {
                const { exitCode } = exec("pip show crawl4ai", { silent: true });
                return exitCode === 0;
            },
        },
        {
            name: "Docfork MCP",
            description: "Library docs for 10K+ libraries — single API call, Cabinets for stack isolation",
            install: async (env) => {
                log.info("Docfork runs via npx @nicepkg/docfork — no global install needed");
                return { component: "Docfork MCP", success: true, message: "Available via npx (no install required)" };
            },
            verify: async (env) => {
                return commandExists("npx");
            },
        },
        {
            name: "DeepWiki",
            description: "Public GitHub repo Q&A — remote HTTP MCP, zero install",
            install: async (env) => {
                log.info("DeepWiki is a remote HTTP MCP — no local install needed");
                return { component: "DeepWiki", success: true, message: "Remote HTTP MCP (zero install)" };
            },
            verify: async () => {
                return true;
            },
        },
    ],
};
//# sourceMappingURL=browser-web.js.map