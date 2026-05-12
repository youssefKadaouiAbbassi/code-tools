import { mkdir, readFile, writeFile, rename, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import type { MarketplaceEntry, PluginSpec } from "./types";

export type { MarketplaceEntry, PluginSpec, ClaudeSettings, HealthResult } from "./types";
export { makeHealthResult } from "./types";

export const FORGE_VERSION = "0.0.1";
export const HOME = homedir();
export const FORGE_HOME = join(HOME, ".claude", "forge");
export const SETTINGS_PATH = join(HOME, ".claude", "settings.json");
export const KMP_PATH = join(HOME, ".claude", "plugins", "known_marketplaces.json");
export const MP_DIR = join(HOME, ".claude", "plugins", "marketplaces");
export const CONFIG_PATH = join(FORGE_HOME, "config.json");
export const BOOTSTRAPPED = join(FORGE_HOME, ".bootstrapped");
export const LOG_PATH = join(FORGE_HOME, "bootstrap.log");
export const BIN_DIR = join(FORGE_HOME, "bin");
export const FORGE_WRAPPER = join(BIN_DIR, "forge");

export const MARKETPLACES = [
  { name: "claude-plugins-official",  repo: "anthropics/claude-plugins-official" },
  { name: "claude-code-workflows",    repo: "wshobson/agents" },
  { name: "claude-code-plugins-plus", repo: "jeremylongshore/claude-code-plugins-plus-skills" },
  { name: "tdd-guard",                repo: "nizos/tdd-guard" },
  { name: "claude-hud",               repo: "jarrodwatts/claude-hud" },
] as const satisfies readonly MarketplaceEntry[];

export const FORGE_MARKETPLACE = {
  name: "forge",
  repo: "youssefKadaouiAbbassi/forge",
} as const satisfies MarketplaceEntry;

type KnownMarketplace =
  | (typeof MARKETPLACES)[number]["name"]
  | typeof FORGE_MARKETPLACE.name;

export const PLUGINS = [
  "feature-dev@claude-plugins-official",
  "pr-review-toolkit@claude-plugins-official",
  "ralph-loop@claude-plugins-official",
  "tdd-workflows@claude-code-workflows",
  "tdd-guard@tdd-guard",
  "mutation-test-runner@claude-code-plugins-plus",
  "protect-mcp@claude-code-workflows",
  "claude-hud@claude-hud",
] as const satisfies readonly PluginSpec<KnownMarketplace>[];

export const EXTRA_PLUGINS = [
  "hookify@claude-plugins-official",
  "superpowers@claude-plugins-official",
] as const satisfies readonly PluginSpec<KnownMarketplace>[];

export async function ensureForgeHome(): Promise<void> {
  await mkdir(FORGE_HOME, { recursive: true });
}

export async function readJson<T = unknown>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp.${randomUUID()}`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await rename(tmp, path);
}

export async function backup(path: string): Promise<void> {
  if (!existsSync(path)) return;
  const bak = `${path}.bak.${Date.now()}`;
  await writeFile(bak, await readFile(path, "utf8"), "utf8");
}

export async function logLine(msg: string): Promise<void> {
  await ensureForgeHome();
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  await appendFile(LOG_PATH, line, "utf8");
}

export async function readConfig(): Promise<{ autoupdate: boolean }> {
  const cfg = await readJson<{ autoupdate?: boolean }>(CONFIG_PATH, {});
  return { autoupdate: cfg.autoupdate !== false };
}
