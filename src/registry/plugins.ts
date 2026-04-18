import { $ } from "bun";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { DetectedEnvironment, InstallResult } from "../types.js";
import { log } from "../utils.js";
import { requireClaude } from "./mcp.js";

type MemoEntry = { value: Set<string>; expiresAt: number };
const installedCache = new Map<string, MemoEntry>();
const MEMO_TTL_MS = 60_000;

export async function listInstalledPlugins(env: DetectedEnvironment): Promise<Set<string>> {
  const path = join(env.claudeDir, "plugins", "installed_plugins.json");
  const now = Date.now();
  const cached = installedCache.get(path);
  if (cached && cached.expiresAt > now) return cached.value;

  let value = new Set<string>();
  try {
    const data = JSON.parse(await fs.readFile(path, "utf-8")) as { plugins?: Record<string, unknown> };
    value = new Set(Object.keys(data.plugins ?? {}));
  } catch {
    value = new Set();
  }
  installedCache.set(path, { value, expiresAt: now + MEMO_TTL_MS });
  return value;
}

export function clearInstalledPluginsCache(): void {
  installedCache.clear();
}

async function marketplaceRegistered(env: DetectedEnvironment, name: string): Promise<boolean> {
  const path = join(env.claudeDir, "plugins", "known_marketplaces.json");
  try {
    const text = await fs.readFile(path, "utf-8");
    return text.includes(name);
  } catch {
    return false;
  }
}

export async function ensureMarketplace(
  env: DetectedEnvironment,
  slug: string,
  name: string,
): Promise<{ ok: boolean; exitCode?: number }> {
  if (await marketplaceRegistered(env, name)) return { ok: true };
  log.info(`Adding marketplace: ${slug}`);
  const mkt = await $`claude plugin marketplace add ${slug}`.nothrow();
  return { ok: mkt.exitCode === 0, exitCode: mkt.exitCode };
}

export async function installPlugin(
  name: string,
  marketplace: string,
  dryRun: boolean,
): Promise<InstallResult> {
  const key = `${name}@${marketplace}`;
  if (dryRun) {
    log.info(`[dry-run] Would install ${key}`);
    return {
      component: name,
      status: "skipped",
      message: `[dry-run] Would install ${key}`,
      verifyPassed: false,
    };
  }
  if (!requireClaude()) {
    return {
      component: name,
      status: "skipped",
      message: "Claude Code CLI not found — install Claude Code first",
      verifyPassed: false,
    };
  }
  const out = await $`claude plugin install ${key}`.nothrow();
  const ok = out.exitCode === 0;
  return {
    component: name,
    status: ok ? "installed" : "failed",
    message: ok ? `${name} installed` : `claude plugin install ${key} exited ${out.exitCode}`,
    verifyPassed: ok,
  };
}
