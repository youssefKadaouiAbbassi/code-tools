import { exec, fileExists, log } from "../utils.js";
import { join } from "node:path";
export const design = {
    id: "design",
    name: "Design",
    description: "AI design generation and DESIGN.md brand templates",
    recommended: false,
    components: [
        {
            name: "Google Stitch",
            description: "DESIGN.md export, MCP + 7 skills — full apps in ~30min",
            install: async (env) => {
                log.info("Google Stitch is a web service — visit https://stitch.withgoogle.com");
                log.info("Export DESIGN.md files and use with MCP integration");
                return { component: "Google Stitch", success: true, message: "Web service — visit stitch.withgoogle.com" };
            },
            verify: async (env) => {
                return true;
            },
        },
        {
            name: "awesome-design-md",
            description: "66 brand DESIGN.md template files",
            install: async (env) => {
                const targetDir = join(env.homeDir, ".config", "design-templates");
                if (fileExists(targetDir)) {
                    return { component: "awesome-design-md", success: true, message: "Already cloned", skipped: true };
                }
                const { exitCode } = exec(`git clone --depth 1 https://github.com/nicepkg/awesome-design-md.git ${targetDir}`);
                if (exitCode === 0) {
                    return { component: "awesome-design-md", success: true, message: `Cloned to ${targetDir}` };
                }
                return { component: "awesome-design-md", success: false, message: "Failed to clone awesome-design-md" };
            },
            verify: async (env) => {
                return fileExists(join(env.homeDir, ".config", "design-templates"));
            },
        },
    ],
};
//# sourceMappingURL=design.js.map