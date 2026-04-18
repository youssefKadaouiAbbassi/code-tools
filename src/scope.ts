/** Single owner of scope resolution per plan Principle 4.
 *  Pure path math: no I/O, no homedir() / cwd() — callers pass them in.
 */
import { join } from "node:path";
import type { DetectedEnvironment } from "./types.js";

export function resolveClaudeDir(
  args: { local?: boolean },
  cwd: string,
  home: string,
): string {
  if (args.local) return join(cwd, ".claude");
  return join(home, ".claude");
}

/** shellRcPath and homeDir stay put: shell rc is user-global by design, and --local
 *  installs skip shell-rc edits + global binary installs (see core.ts). */
export function rewriteEnvForScope(
  env: DetectedEnvironment,
  claudeDir: string,
): DetectedEnvironment {
  return { ...env, claudeDir };
}

export function isLocalScope(env: DetectedEnvironment): boolean {
  const home = env.homeDir.replace(/\/+$/, "");
  return !env.claudeDir.startsWith(home + "/");
}

export function templateDir(env: DetectedEnvironment): "home-claude" | "project-claude" {
  return isLocalScope(env) ? "project-claude" : "home-claude";
}
