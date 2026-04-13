import { exec, commandExists } from "../utils.js";
export const orchestration = {
    id: "orchestration",
    name: "Orchestration",
    description: "Issue-based agent orchestration with compounding skills",
    recommended: false,
    components: [
        {
            name: "Multica",
            description: "Agent issue board — skills compound over time, 4 runtimes",
            install: async (env) => {
                if (commandExists("multica")) {
                    return { component: "Multica", success: true, message: "Already installed", skipped: true };
                }
                const { exitCode: tapCode } = exec("brew tap multica-ai/tap");
                if (tapCode !== 0) {
                    return { component: "Multica", success: false, message: "Failed to tap multica-ai/tap — ensure brew is available" };
                }
                const { exitCode } = exec("brew install multica");
                if (exitCode === 0) {
                    return { component: "Multica", success: true, message: "Installed via brew (multica-ai/tap)" };
                }
                return { component: "Multica", success: false, message: "Failed to install Multica via brew" };
            },
            verify: async (env) => {
                return commandExists("multica");
            },
        },
    ],
};
//# sourceMappingURL=orchestration.js.map