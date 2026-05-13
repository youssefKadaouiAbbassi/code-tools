import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  MARKETPLACES, FORGE_MARKETPLACE, MP_DIR, HOME, KMP_PATH, SETTINGS_PATH, FORGE_HOME,
  readJson, writeJsonAtomic, backup,
} from "./state";

export async function run(args: string[]): Promise<void> {
  const keepDeps = args.includes("--keep-deps");

  console.log("🔨 forge uninstall (deep clean)");
  console.log();

  const settingsBefore = await readJson<Record<string, any>>(SETTINGS_PATH, {});
  const enabled = Object.keys(settingsBefore.enabledPlugins ?? {});
  const ourSuffixes = [...MARKETPLACES, FORGE_MARKETPLACE].map((m) => `@${m.name}`);
  const ourPlugins = enabled.filter((id) => ourSuffixes.some((s) => id.endsWith(s)));
  if (!ourPlugins.includes("forge@forge")) ourPlugins.push("forge@forge");
  for (const spec of ourPlugins) {
    spawnSync("claude", ["plugin", "uninstall", spec], { stdio: "ignore", timeout: 30_000 });
    console.log(`  ✓ uninstalled ${spec}`);
  }

  if (!keepDeps) {
    for (const mp of [...MARKETPLACES, FORGE_MARKETPLACE]) {
      spawnSync("claude", ["plugin", "marketplace", "remove", mp.name], { stdio: "ignore", timeout: 15_000 });
      console.log(`  ✓ removed marketplace: ${mp.name}`);
    }
    for (const mp of [...MARKETPLACES, FORGE_MARKETPLACE]) {
      const loc = join(MP_DIR, mp.name);
      if (existsSync(loc)) await rm(loc, { recursive: true, force: true });
      const cacheLoc = join(HOME, ".claude", "plugins", "cache", mp.name);
      if (existsSync(cacheLoc)) await rm(cacheLoc, { recursive: true, force: true });
    }
  } else {
    console.log("  - keeping dep marketplaces (--keep-deps)");
  }

  if (existsSync(KMP_PATH)) {
    const kmp = await readJson<Record<string, unknown>>(KMP_PATH, {});
    for (const mp of [...MARKETPLACES, FORGE_MARKETPLACE]) delete kmp[mp.name];
    await writeJsonAtomic(KMP_PATH, kmp);
  }

  await backup(SETTINGS_PATH);
  const settings = await readJson<Record<string, any>>(SETTINGS_PATH, {});
  if (settings.statusLine?.command?.includes?.("forge")) {
    delete settings.statusLine;
    console.log("  ✓ removed forge statusLine");
  }
  if (settings.extraKnownMarketplaces) {
    for (const mp of [...MARKETPLACES, FORGE_MARKETPLACE]) delete settings.extraKnownMarketplaces[mp.name];
  }
  if (settings.enabledPlugins) {
    const before = Object.keys(settings.enabledPlugins).length;
    for (const id of Object.keys(settings.enabledPlugins)) {
      if (ourSuffixes.some((s) => id.endsWith(s))) delete settings.enabledPlugins[id];
    }
    const removed = before - Object.keys(settings.enabledPlugins).length;
    if (removed) console.log(`  ✓ stripped ${removed} enabledPlugins entries`);
  }
  await writeJsonAtomic(SETTINGS_PATH, settings);

  if (existsSync(FORGE_HOME)) {
    await rm(FORGE_HOME, { recursive: true, force: true });
    console.log(`  ✓ removed ${FORGE_HOME}`);
  }

  console.log();
  // Uninstall claude-mem plugin (registered under marketplace 'thedotmack')
  spawnSync("bash", ["-c", "npx -y claude-mem@latest uninstall </dev/null"], { stdio: "ignore", timeout: 60_000 });
  console.log("  ✓ uninstalled claude-mem plugin");

  console.log("=== verification ===");
  const issues: string[] = [];
  const s2 = await readJson<Record<string, any>>(SETTINGS_PATH, {});
  if (s2.statusLine?.command?.includes?.("forge")) issues.push(`statusLine still references forge: ${JSON.stringify(s2.statusLine)}`);
  const stillExtra = Object.keys(s2.extraKnownMarketplaces ?? {}).filter((k) => [...MARKETPLACES, FORGE_MARKETPLACE].some((m) => m.name === k));
  if (stillExtra.length) issues.push(`extraKnownMarketplaces residue: ${stillExtra.join(", ")}`);
  const stillEnabled = Object.keys(s2.enabledPlugins ?? {}).filter((id) => ourSuffixes.some((s) => id.endsWith(s)));
  if (stillEnabled.length) issues.push(`enabledPlugins residue: ${stillEnabled.join(", ")}`);
  for (const mp of [...MARKETPLACES, FORGE_MARKETPLACE]) {
    if (existsSync(join(MP_DIR, mp.name))) issues.push(`marketplace dir still exists: ${mp.name}`);
    const cache = join(HOME, ".claude", "plugins", "cache", mp.name);
    if (existsSync(cache)) issues.push(`cache dir still exists: ${mp.name}`);
  }
  if (existsSync(FORGE_HOME)) issues.push(`${FORGE_HOME} still exists`);
  const kmp = await readJson<Record<string, unknown>>(KMP_PATH, {});
  const stillKmp = Object.keys(kmp).filter((k) => [...MARKETPLACES, FORGE_MARKETPLACE].some((m) => m.name === k));
  if (stillKmp.length) issues.push(`known_marketplaces residue: ${stillKmp.join(", ")}`);

  if (issues.length === 0) {
    console.log("  ✅ clean — no forge residue");
    console.log();
    console.log("✅ forge uninstalled.");
  } else {
    console.log("  ⚠️  residue found:");
    for (const i of issues) console.log(`    - ${i}`);
    process.exit(1);
  }
}
