/** Install mode orchestrator: resolves scope (global/local), install mode (clean/add-on-top/fresh),
 *  and manages backups. Single owner of scope resolution per plan Principle 4.
 */
import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { createFullBackup } from "./utils/backup.js";
import { log } from "./utils.js";
import type { DetectedEnvironment } from "./types.js";

export type InstallMode = "clean" | "add-on-top" | "fresh";
export type ConflictPolicy = "skip" | "overwrite";

export interface ResolvedInstallMode {
  mode: InstallMode;
  resolvedEnv: DetectedEnvironment;
  backupPath?: string;
  conflictPolicy: ConflictPolicy;
  addOnTopLogPath?: string;
}

export interface ResolveInstallModeArgs {
  "clean-install"?: boolean;
  "add-on-top"?: boolean;
  local?: boolean;
  global?: boolean;
  "yes-wipe"?: boolean;
  "force-overwrite"?: boolean;
  "non-interactive"?: boolean;
}

/**
 * Single owner of claude directory resolution.
 * --local → $PWD/.claude; else → $HOME/.claude.
 */
export function resolveClaudeDir(
  args: { local?: boolean },
  cwd: string,
  home: string,
): string {
  if (args.local) return join(cwd, ".claude");
  return join(home, ".claude");
}

/**
 * Pure function returning a new env with claudeDir rewritten for the target scope.
 * shellRcPath and homeDir stay put: shell rc is user-global by design, and --local
 * installs skip shell-rc edits + global binary installs (see primordial.ts).
 */
export function rewriteEnvForScope(
  env: DetectedEnvironment,
  claudeDir: string,
): DetectedEnvironment {
  return { ...env, claudeDir };
}

async function hasExistingInstall(claudeDir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(claudeDir);
    // Consider install "customized" if plugins/ or skills/ or custom hooks exist
    return entries.some(
      (e) => e === "plugins" || e === "skills" || e === "custom-skills",
    );
  } catch {
    return false;
  }
}

async function confirmDestructive(claudeDir: string): Promise<boolean> {
  const finalSegment = claudeDir.split("/").filter(Boolean).pop() ?? ".claude";
  clack.note(
    [
      pc.bold(pc.red("DESTRUCTIVE OPERATION")),
      `This will WIPE: ${pc.cyan(claudeDir)}`,
      `A full backup will be created first.`,
      "",
      `To confirm, type exactly: ${pc.bold(finalSegment)}`,
    ].join("\n"),
    "Clean install confirmation",
  );

  const typed = await clack.text({
    message: `Type "${finalSegment}" to confirm:`,
    validate: (value) => {
      if (value !== finalSegment) return `Expected "${finalSegment}"`;
    },
  });

  if (clack.isCancel(typed)) return false;
  return typed === finalSegment;
}

/**
 * Main orchestrator — resolves mode + scope, creates backups, prompts user.
 * Returns resolved state for downstream install steps.
 */
export async function resolveInstallMode(
  args: ResolveInstallModeArgs,
  env: DetectedEnvironment,
  opts: { interactive: boolean; cwd?: string },
): Promise<ResolvedInstallMode> {
  const cwd = opts.cwd ?? process.cwd();
  const home = env.homeDir || homedir();

  // Interactive scope selection when neither --global nor --local is specified
  let useLocal = args.local;

  if (opts.interactive && !args["non-interactive"] && !args.global && !args.local) {
    const scopeChoice = await clack.select({
      message: "Where should Claude Code be configured?",
      options: [
        {
          value: "global",
          label: "Global (~/.claude)",
          hint: "Recommended - shared across all projects"
        },
        {
          value: "local",
          label: "Local (./claude/)",
          hint: "Project-specific configuration"
        }
      ],
      initialValue: "global",
    });

    if (clack.isCancel(scopeChoice)) {
      clack.cancel("Installation cancelled.");
      process.exit(0);
    }

    useLocal = scopeChoice === "local";
  }

  const claudeDir = resolveClaudeDir({ local: useLocal }, cwd, home);
  const resolvedEnv = rewriteEnvForScope(env, claudeDir);

  const existing = await hasExistingInstall(claudeDir);
  const interactive = opts.interactive && !args["non-interactive"];

  const conflictPolicy: ConflictPolicy = args["force-overwrite"]
    ? "overwrite"
    : "skip";

  // --- clean-install branch ---
  if (args["clean-install"]) {
    if (!existing) {
      // No existing install → skip backup, treat as fresh
      log.info("No existing install detected; --clean-install is a no-op (proceeding with fresh install).");
      return { mode: "fresh", resolvedEnv, conflictPolicy };
    }

    if (!interactive) {
      if (!args["yes-wipe"]) {
        log.error("--non-interactive --clean-install requires --yes-wipe to confirm destructive operation.");
        process.exit(1);
      }
    } else {
      const confirmed = await confirmDestructive(claudeDir);
      if (!confirmed) {
        clack.cancel("Clean install cancelled.");
        process.exit(0);
      }
    }

    const result = await createFullBackup(claudeDir);
    if (!result.success) {
      log.error(`Backup failed: ${result.error ?? "unknown error"}`);
      process.exit(1);
    }
    console.log(pc.green(`Backup: ${result.backupPath}`));
    return { mode: "clean", resolvedEnv, backupPath: result.backupPath, conflictPolicy };
  }

  // --- add-on-top branch ---
  if (args["add-on-top"]) {
    const addOnTopLogPath = await initAddOnTopLog(claudeDir, conflictPolicy);
    return { mode: "add-on-top", resolvedEnv, conflictPolicy, addOnTopLogPath };
  }

  // --- no mode flag ---
  if (!existing) {
    return { mode: "fresh", resolvedEnv, conflictPolicy };
  }

  // existing install, no explicit mode flag
  if (!interactive) {
    console.error(pc.yellow(
      "Warning: existing install detected but no --clean-install or --add-on-top specified. Defaulting to --add-on-top.",
    ));
    const addOnTopLogPath = await initAddOnTopLog(claudeDir, conflictPolicy);
    return { mode: "add-on-top", resolvedEnv, conflictPolicy, addOnTopLogPath };
  }

  const choice = await clack.select({
    message: "Existing install detected. What do you want to do?",
    options: [
      { value: "add-on-top", label: "Add on top (preserve existing, merge new)" },
      { value: "clean", label: "Clean install (backup + wipe + fresh)", hint: "DESTRUCTIVE" },
      { value: "cancel", label: "Cancel" },
    ],
  });

  if (clack.isCancel(choice) || choice === "cancel") {
    clack.cancel("Setup cancelled.");
    process.exit(0);
  }

  if (choice === "clean") {
    const confirmed = await confirmDestructive(claudeDir);
    if (!confirmed) {
      clack.cancel("Clean install cancelled.");
      process.exit(0);
    }
    const result = await createFullBackup(claudeDir);
    if (!result.success) {
      log.error(`Backup failed: ${result.error ?? "unknown error"}`);
      process.exit(1);
    }
    console.log(pc.green(`Backup: ${result.backupPath}`));
    return { mode: "clean", resolvedEnv, backupPath: result.backupPath, conflictPolicy };
  }

  const addOnTopLogPath = await initAddOnTopLog(claudeDir, conflictPolicy);
  return { mode: "add-on-top", resolvedEnv, conflictPolicy, addOnTopLogPath };
}

async function initAddOnTopLog(
  claudeDir: string,
  conflictPolicy: ConflictPolicy,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const writelogDir = join(claudeDir, `.omc-addontop-${timestamp}`);

  try {
    await fs.mkdir(writelogDir, { recursive: true });
    await fs.mkdir(join(writelogDir, "snapshots"), { recursive: true });
    await fs.writeFile(
      join(writelogDir, "manifest.json"),
      JSON.stringify({ timestamp, claudeDir, conflictPolicy }, null, 2),
    );
    // Initialize empty writelog
    await fs.writeFile(join(writelogDir, "writelog.jsonl"), "");
  } catch (err) {
    log.warn(`Could not initialize add-on-top writelog: ${err instanceof Error ? err.message : String(err)}`);
  }

  return writelogDir;
}
