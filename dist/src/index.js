import * as p from "@clack/prompts";
import pc from "picocolors";
import { detectAll } from "./detect.js";
import { createBackup } from "./backup.js";
import { installPrimordial } from "./primordial.js";
import { allCategories as categories } from "./components/index.js";
import { verifyAll } from "./verify.js";
import { showStatus } from "./status.js";
import { restore } from "./restore.js";
export async function main() {
    const args = process.argv.slice(2);
    if (args.includes("--status")) {
        const env = await detectAll();
        showStatus(env);
        return;
    }
    if (args.includes("--restore")) {
        await restore();
        return;
    }
    const installAll = args.includes("--yes") || args.includes("-y");
    const dryRun = args.includes("--dry-run");
    p.intro(pc.bgCyan(pc.black(" Ultimate Claude Code System — v12 Setup ")));
    console.log();
    console.log(pc.dim("  40 components · 7 MCP servers · 12 principles"));
    console.log(pc.dim("  All free except Claude Max $200/mo"));
    console.log();
    // Phase 1: Detect environment
    const s = p.spinner();
    s.start("Scanning your environment...");
    const env = await detectAll();
    s.stop("Environment detected");
    console.log();
    console.log(`  ${pc.bold("OS:")}              ${env.os}`);
    console.log(`  ${pc.bold("Shell:")}           ${env.shell}`);
    console.log(`  ${pc.bold("Package manager:")} ${env.packageManager ?? pc.yellow("none detected")}`);
    console.log(`  ${pc.bold("Claude Code:")}     ${env.installedTools.has("claude") ? pc.green(env.installedTools.get("claude")) : pc.red("not installed")}`);
    console.log(`  ${pc.bold("Docker:")}          ${env.installedTools.has("docker") ? pc.green("yes") : pc.yellow("not found")}`);
    console.log(`  ${pc.bold("Node:")}            ${env.installedTools.has("node") ? pc.green(env.installedTools.get("node")) : pc.red("not found")}`);
    console.log(`  ${pc.bold("Git:")}             ${env.installedTools.has("git") ? pc.green(env.installedTools.get("git")) : pc.red("not found")}`);
    console.log();
    if (!env.installedTools.has("claude")) {
        p.log.error("Claude Code is not installed. Run: curl -fsSL https://claude.ai/install.sh | bash");
        p.outro(pc.red("Setup cancelled — install Claude Code first."));
        process.exit(1);
    }
    // Phase 2: Explain what's about to happen
    p.log.info(pc.bold("Here's what's about to happen:"));
    console.log();
    console.log(pc.dim("  CORE (installing now — these make the system work):"));
    console.log(`    ${pc.cyan("settings.json")}     40+ deny rules blocking destructive commands`);
    console.log(`    ${pc.cyan("CLAUDE.md")}         85 lines of workflow rules + AGENTS.md/GEMINI.md symlinks`);
    console.log(`    ${pc.cyan("6 hook scripts")}    Destructive blocker, secrets guard, lint gate, session hooks`);
    console.log(`    ${pc.cyan("tmux.conf")}         Claude-optimized layout (prefix Ctrl-A, status bar)`);
    console.log(`    ${pc.cyan("Starship prompt")}   Shows git branch + context% + cost`);
    console.log(`    ${pc.cyan("mise + just")}       Tool version management + task runner`);
    console.log(`    ${pc.cyan("Git aliases")}       Worktree shortcuts (gw-new, gw-list, gw-clean)`);
    console.log(`    ${pc.cyan("Telemetry")}         Enables native /cost tracking`);
    console.log();
    console.log(pc.dim("  Your existing configs will be backed up to ~/.claude-backup/"));
    console.log();
    if (dryRun) {
        p.log.warn("Dry run — no changes will be made.");
        p.outro("Dry run complete.");
        return;
    }
    // Phase 3: Backup
    s.start("Backing up existing configs...");
    const filesToBackup = [
        `${env.claudeDir}/settings.json`,
        `${env.claudeDir}/CLAUDE.md`,
        `${env.homeDir}/.tmux.conf`,
        `${env.configDir}/starship.toml`,
    ].filter((f) => {
        try {
            return require("node:fs").existsSync(f);
        }
        catch {
            return false;
        }
    });
    const backup = await createBackup(filesToBackup);
    s.stop(`Backed up ${backup.files.length} files to ${pc.dim(backup.backupDir)}`);
    // Phase 4: Install primordial
    s.start("Installing core system...");
    const primordialResults = await installPrimordial(env, backup);
    const primordialOk = primordialResults.filter((r) => r.success).length;
    s.stop(`Core installed (${pc.green(String(primordialOk))}/${primordialResults.length} components)`);
    for (const r of primordialResults) {
        if (r.skipped)
            console.log(`  ${pc.dim("↩")} ${r.component} — ${pc.dim(r.message)}`);
        else if (r.success)
            console.log(`  ${pc.green("✓")} ${r.component}`);
        else
            console.log(`  ${pc.red("✗")} ${r.component} — ${r.message}`);
    }
    console.log();
    // Phase 5: Optional components
    let selectedCategories;
    if (installAll) {
        selectedCategories = categories;
        p.log.info("Installing all components (--yes flag)");
    }
    else {
        const choice = await p.select({
            message: "What do you want on top of the core?",
            options: [
                { value: "all", label: pc.bold("Everything") + pc.dim(" — all 40 components, full maximalist"), hint: "recommended" },
                { value: "pick", label: "Let me pick", hint: "choose by category" },
                { value: "none", label: "Nothing", hint: "just the core" },
            ],
        });
        if (p.isCancel(choice)) {
            p.outro("Setup cancelled.");
            process.exit(0);
        }
        if (choice === "all") {
            selectedCategories = categories;
        }
        else if (choice === "none") {
            selectedCategories = [];
        }
        else {
            selectedCategories = [];
            for (const cat of categories) {
                console.log();
                console.log(pc.bold(cat.name));
                console.log(pc.dim(cat.description));
                const install = await p.confirm({
                    message: `Install ${cat.name}?`,
                    initialValue: cat.recommended,
                });
                if (p.isCancel(install)) {
                    p.outro("Setup cancelled.");
                    process.exit(0);
                }
                if (install) {
                    selectedCategories.push(cat);
                }
            }
        }
    }
    // Phase 6: Install selected categories
    const allResults = [...primordialResults];
    for (const cat of selectedCategories) {
        console.log();
        s.start(`Installing ${cat.name}...`);
        for (const comp of cat.components) {
            const result = await comp.install(env);
            allResults.push(result);
            if (result.skipped) {
                // silent
            }
            else if (result.success) {
                console.log(`  ${pc.green("✓")} ${comp.name}`);
            }
            else {
                console.log(`  ${pc.red("✗")} ${comp.name} — ${result.message}`);
            }
        }
        s.stop(`${cat.name} done`);
    }
    // Phase 7: Verify
    console.log();
    s.start("Verifying installation...");
    const verification = await verifyAll(env, allResults);
    s.stop(`Verified: ${pc.green(String(verification.passed))} passed, ${verification.failed > 0 ? pc.red(String(verification.failed)) : "0"} failed`);
    // Phase 8: Summary
    console.log();
    console.log(pc.bold("Summary:"));
    console.log();
    const installed = allResults.filter((r) => r.success && !r.skipped);
    const skipped = allResults.filter((r) => r.skipped);
    const failed = allResults.filter((r) => !r.success);
    console.log(`  ${pc.green("✓")} Installed: ${installed.length} components`);
    if (skipped.length > 0)
        console.log(`  ${pc.dim("↩")} Already had: ${skipped.length} components`);
    if (failed.length > 0)
        console.log(`  ${pc.red("✗")} Failed: ${failed.length} components`);
    console.log();
    console.log(pc.dim("  Run anytime:"));
    console.log(pc.dim("    code-tools-setup --status     Check what's installed"));
    console.log(pc.dim("    code-tools-setup --restore    Restore backed up configs"));
    console.log(pc.dim("    code-tools-setup              Re-run installer"));
    console.log();
    p.outro(pc.green("Setup complete! Restart your terminal to activate tmux + Starship."));
}
//# sourceMappingURL=index.js.map