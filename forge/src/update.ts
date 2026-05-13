import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  MARKETPLACES, FORGE_MARKETPLACE, PLUGINS, EXTRA_PLUGINS, MP_DIR, KMP_PATH, CONFIG_PATH, SETTINGS_PATH,
  readJson, writeJsonAtomic, logLine,
} from "./state";
import { regenerateProtectMcpHooks, configureClaudeHud } from "./install";

export async function run(args: string[]): Promise<void> {
  const sub = args[0]?.trim();
  if (sub === "enable" || sub === "disable") {
    await writeJsonAtomic(CONFIG_PATH, { autoupdate: sub === "enable" });
    console.log(`✓ forge autoupdate: ${sub === "enable" ? "ENABLED" : "DISABLED"}`);
    return;
  }
  if (sub === "status") {
    const cfg = await readJson<{ autoupdate?: boolean }>(CONFIG_PATH, {});
    console.log(`forge autoupdate: ${cfg.autoupdate !== false}  (config: ${CONFIG_PATH})`);
    return;
  }

  console.log("🔨 forge update");
  console.log();

  // 1. git pull each marketplace
  console.log("1/4 pulling marketplaces...");
  const now = new Date().toISOString();
  const all = [FORGE_MARKETPLACE, ...MARKETPLACES];
  let updated = 0; let failed = 0;
  const kmp = await readJson<Record<string, { lastUpdated?: string }>>(KMP_PATH, {});
  for (const mp of all) {
    const loc = join(MP_DIR, mp.name);
    if (!existsSync(join(loc, ".git"))) { console.log(`  − ${mp.name} (not cloned, skip)`); continue; }
    const before = git(loc, ["rev-parse", "--short", "HEAD"])?.trim();
    const r = spawnSync("git", ["-C", loc, "pull", "--ff-only"], { encoding: "utf8", timeout: 30_000 });
    if (r.status !== 0) { console.log(`  ✗ ${mp.name} pull FAILED`); failed++; continue; }
    const after = git(loc, ["rev-parse", "--short", "HEAD"])?.trim();
    if (before === after) console.log(`  = ${mp.name} @ ${after}`);
    else { console.log(`  ✓ ${mp.name} ${before} → ${after}`); updated++; }
    if (kmp[mp.name]) kmp[mp.name].lastUpdated = now;
  }
  await writeJsonAtomic(KMP_PATH, kmp);

  // 2. claude plugin marketplace update (refresh listings)
  console.log();
  console.log("2/4 refreshing marketplace listings...");
  const r = spawnSync("claude", ["plugin", "marketplace", "update"], { encoding: "utf8", timeout: 60_000, stdio: "pipe" });
  if (r.status === 0) console.log("  ✓ listings refreshed");
  else console.log(`  ✗ refresh failed: ${(r.stderr || "").slice(0, 160)}`);

  // 3. claude plugin update for each enabled forge-marketplace plugin (forge + every PLUGIN; extras if currently installed)
  console.log();
  console.log("3/4 updating plugins...");
  const settings = await readJson<Record<string, any>>(SETTINGS_PATH, {});
  const enabled = Object.keys(settings.enabledPlugins ?? {});
  const candidates = ["forge@forge", ...PLUGINS, ...EXTRA_PLUGINS];
  for (const spec of candidates) {
    if (!enabled.includes(spec)) continue;
    const pr = spawnSync("claude", ["plugin", "update", spec], { encoding: "utf8", timeout: 60_000, stdio: "pipe" });
    if (pr.status === 0) console.log(`  ✓ ${spec}`);
    else console.log(`  ✗ ${spec}: ${(pr.stderr || "").slice(0, 120)}`);
  }

  // 4. re-apply post-install fixes (protect-mcp stub + claude-hud config)
  console.log();
  console.log("4/4 re-applying post-install fixes...");
  await regenerateProtectMcpHooks();
  await configureClaudeHud();

  console.log();
  if (failed === 0) {
    console.log(`✅ forge update complete: ${updated} marketplace(s) refreshed.`);
    console.log(`👉 Restart Claude Code (or /reload-plugins) to apply.`);
    await logLine(`update ok: ${updated} marketplaces refreshed`);
  } else {
    console.log(`⚠️  ${failed} marketplace(s) failed to pull. Inspect git output above.`);
    await logLine(`update partial: ${updated} ok, ${failed} failed`);
    process.exit(1);
  }
}

function git(cwd: string, args: string[]): string | undefined {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout : undefined;
}
