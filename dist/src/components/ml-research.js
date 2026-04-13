import { exec, fileExists } from "../utils.js";
import { join } from "node:path";
export const mlResearch = {
    id: "ml-research",
    name: "ML Research",
    description: "Autonomous ML experiment orchestration",
    recommended: false,
    components: [
        {
            name: "autoresearch",
            description: "Autonomous ML research — 700 experiments, 11% speedup benchmark",
            install: async (env) => {
                const { exitCode: pipCheck } = exec("pip show autoresearch", { silent: true });
                if (pipCheck === 0) {
                    return { component: "autoresearch", success: true, message: "Already installed", skipped: true };
                }
                const { exitCode } = exec("pip install autoresearch");
                if (exitCode === 0) {
                    return { component: "autoresearch", success: true, message: "Installed via pip" };
                }
                const cloneDir = join(env.homeDir, ".local", "share", "autoresearch");
                if (!fileExists(cloneDir)) {
                    const { exitCode: gitCode } = exec(`git clone --depth 1 https://github.com/sakanaai/autoresearch.git ${cloneDir}`);
                    if (gitCode === 0) {
                        exec(`pip install -e ${cloneDir}`);
                        return { component: "autoresearch", success: true, message: `Installed from git clone at ${cloneDir}` };
                    }
                }
                return { component: "autoresearch", success: false, message: "Failed to install autoresearch" };
            },
            verify: async (env) => {
                const { exitCode } = exec("pip show autoresearch", { silent: true });
                return exitCode === 0;
            },
        },
    ],
};
//# sourceMappingURL=ml-research.js.map