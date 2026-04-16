import { $ } from "bun";
import { mkdir, exists, cp, chmod } from "node:fs/promises";
import { join, dirname } from "node:path";
import pc from "picocolors";
import { deepmergeCustom } from "deepmerge-ts";
import type { DetectedEnvironment, InstallPackage, InstallResult } from "./types.js";

export function commandExists(name: string): boolean {
  if (!/^[a-zA-Z0-9_.\-]+$/.test(name)) return false;
  return Bun.which(name) !== null;
}

export function getPythonCommand(): string {
  const cmd = tryGetPythonCommand();
  if (!cmd) throw new Error("No Python binary found. Please install Python 3: sudo apt install python3");
  return cmd;
}

export function tryGetPythonCommand(): string | null {
  if (commandExists("python3")) return "python3";
  if (commandExists("python")) return "python";
  return null;
}

export async function getCommandVersion(name: string, versionFlag = "--version"): Promise<string | null> {
  if (!/^[a-zA-Z0-9_.\-]+$/.test(name)) return null;
  try {
    const result = await $`${name} ${versionFlag}`.text();
    return result.trim().split("\n")[0];
  } catch {
    return null;
  }
}

export async function readJson<T = unknown>(path: string): Promise<T> {
  return Bun.file(path).json() as Promise<T>;
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await Bun.write(path, JSON.stringify(data, null, 2) + "\n");
}

export async function copyFile(src: string, dest: string): Promise<void> {
  await Bun.write(dest, Bun.file(src));
}

export async function copyDir(src: string, dest: string): Promise<void> {
  await cp(src, dest, { recursive: true });
}

export async function fileExists(path: string): Promise<boolean> {
  return exists(path);
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export function getConfigsDir(): string {
  return join(import.meta.dir, "..", "configs");
}

export const mergeSettings = deepmergeCustom({
  mergeArrays: (values, _utils, meta) => {
    if (meta?.key === "deny") return [...new Set(values.flat())];
    return values[values.length - 1];
  },
  mergeRecords: (values, utils, meta) => {
    if (meta?.key === "mcpServers") return Object.assign({}, ...values);
    return utils.defaultMergeFunctions.mergeRecords(values, utils, meta);
  },
});

export async function mergeJsonFile(targetPath: string, patch: Record<string, unknown>): Promise<void> {
  let existing: Record<string, unknown> = {};
  if (await fileExists(targetPath)) {
    existing = await readJson<Record<string, unknown>>(targetPath);
  }
  const merged = mergeSettings(existing, patch);
  await writeJson(targetPath, merged);
}

export type McpSpec =
  | { transport: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
  | { transport: "http" | "sse"; url: string; headers?: Record<string, string> };

export async function registerMcp(
  name: string,
  spec: McpSpec,
  opts: { scope?: "user" | "local" | "project" } = {},
): Promise<boolean> {
  if (!commandExists("claude")) return false;
  const scope = opts.scope ?? "user";

  await $`claude mcp remove ${name} -s ${scope}`.quiet().nothrow();

  let addExit: number;
  if (spec.transport === "stdio") {
    const envFlags = Object.entries(spec.env ?? {}).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
    const args = spec.args ?? [];
    addExit = (await $`claude mcp add ${name} -s ${scope} ${envFlags} -- ${spec.command} ${args}`.quiet().nothrow()).exitCode;
  } else {
    const headerFlags = Object.entries(spec.headers ?? {}).flatMap(([k, v]) => ["-H", `${k}: ${v}`]);
    addExit = (await $`claude mcp add ${name} -s ${scope} --transport ${spec.transport} ${spec.url} ${headerFlags}`.quiet().nothrow()).exitCode;
  }

  if (addExit !== 0) return false;

  const listed = await $`claude mcp list`.quiet().nothrow();
  if (listed.exitCode !== 0) return false;
  return new RegExp(`^${name}:`, "m").test(listed.text());
}

const MARKER = "# code-tools-managed";

export async function appendToShellRc(
  env: DetectedEnvironment,
  lines: string[],
  sectionName = "code-tools"
): Promise<void> {
  const rcPath = env.shellRcPath;
  let content = "";
  if (await fileExists(rcPath)) {
    content = await Bun.file(rcPath).text();
  }

  const block = `\n${MARKER} start:${sectionName}\n${lines.join("\n")}\n${MARKER} end:${sectionName}\n`;

  if (content.includes(`${MARKER} start:${sectionName}`)) {
    const regex = new RegExp(
      `\\n${MARKER} start:${sectionName}\\n[\\s\\S]*?\\n${MARKER} end:${sectionName}\\n`,
      "g"
    );
    content = content.replace(regex, block);
  } else {
    content += block;
  }

  await Bun.write(rcPath, content);
}

export async function installBinary(
  pkg: InstallPackage,
  env: DetectedEnvironment,
  dryRun = false
): Promise<InstallResult> {
  const name = pkg.displayName || pkg.name;

  if (commandExists(pkg.name)) {
    return { component: name, status: "already-installed", message: `${name} is already installed`, verifyPassed: true };
  }

  let cmd: string | undefined;
  switch (env.packageManager) {
    case "brew": cmd = pkg.brew; break;
    case "apt": cmd = pkg.apt; break;
    case "pacman": cmd = pkg.pacman; break;
    case "dnf": cmd = pkg.dnf; break;
  }
  if (!cmd) cmd = pkg.npm ?? pkg.cargo ?? pkg.pip ?? pkg.curl;
  if (!cmd) cmd = pkg.manual;

  if (!cmd) {
    return { component: name, status: "skipped", message: `No install method for ${name} on ${env.packageManager}`, verifyPassed: false };
  }

  if (dryRun) {
    return { component: name, status: "skipped", message: `[dry-run] Would run: ${cmd}`, verifyPassed: false };
  }

  try {
    // Don't quiet: sudo prompts must reach the terminal.
    await $`sh -c ${cmd}`;
    const installed = commandExists(pkg.name);
    return {
      component: name,
      status: installed ? "installed" : "failed",
      message: installed ? `${name} installed successfully` : `${name} install command ran but binary not found`,
      verifyPassed: installed,
    };
  } catch (error) {
    return {
      component: name,
      status: "failed",
      message: `Failed to install ${name}: ${error instanceof Error ? error.message : String(error)}`,
      verifyPassed: false,
    };
  }
}

export function getSecretsFilePath(homeDir: string): string {
  return join(homeDir, ".config", "code-tools", "secrets.env");
}

export async function loadSecretsFromFile(path: string): Promise<Record<string, string>> {
  if (!(await fileExists(path))) return {};
  const text = await Bun.file(path).text();
  const result: Record<string, string> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const stripped = line.startsWith("export ") ? line.slice(7) : line;
    const eq = stripped.indexOf("=");
    if (eq <= 0) continue;
    const key = stripped.slice(0, eq).trim();
    let value = stripped.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

export async function saveSecretsToFile(path: string, additions: Record<string, string>): Promise<void> {
  const existing = await loadSecretsFromFile(path);
  const merged = { ...existing, ...additions };

  await mkdir(dirname(path), { recursive: true });

  const header = [
    "# Managed by code-tools — API keys for MCP servers and integrations.",
    "# Sourced by your shell rc. Do NOT commit this file.",
    "",
  ].join("\n");
  const body = Object.entries(merged)
    .map(([k, v]) => `export ${k}=${JSON.stringify(v)}`)
    .join("\n");
  await Bun.write(path, header + body + "\n");

  await chmod(path, 0o600);
}

export async function promptForMissingEnvVars(
  requiredEnvVars: Array<{ key: string; description: string }>,
  interactive = true,
  existingSecrets: Record<string, string> = {},
): Promise<Record<string, string>> {
  const missing: Record<string, string> = {};
  const missingVars = requiredEnvVars.filter(({ key }) => !process.env[key] && !existingSecrets[key]);

  if (missingVars.length === 0) return {};

  if (!interactive) {
    log.warn(`Missing environment variables: ${missingVars.map((v) => v.key).join(", ")}`);
    log.info("Run in interactive mode or set these environment variables to enable full functionality");
    return {};
  }

  const clack = await import("@clack/prompts");
  log.info("Some components require API keys. Let's set them up:");

  for (const { key, description } of missingVars) {
    const value = await clack.text({
      message: `Enter ${key}`,
      placeholder: `Your ${description} API key`,
      validate: (input: string) => (input.length === 0 ? "API key is required" : undefined),
    });

    if (clack.isCancel(value)) {
      log.warn(`Skipping ${key} - you can set it later in your shell profile`);
      continue;
    }

    missing[key] = value as string;
  }

  return missing;
}

export const log = {
  info: (msg: string) => console.log(pc.cyan("ℹ"), msg),
  warn: (msg: string) => console.log(pc.yellow("⚠"), msg),
  error: (msg: string) => console.log(pc.red("✗"), msg),
  success: (msg: string) => console.log(pc.green("✓"), msg),
  debug: (msg: string) => {
    if (process.env.VERBOSE) console.log(pc.gray("…"), pc.gray(msg));
  },
};
