import { existsSync } from "node:fs";
import { writeFile, rm, mkdir, chmod } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  MARKETPLACES, FORGE_MARKETPLACE, PLUGINS, EXTRA_PLUGINS,
  KMP_PATH, MP_DIR, SETTINGS_PATH, BOOTSTRAPPED, CONFIG_PATH,
  BIN_DIR, FORGE_WRAPPER, HOME, FORGE_VERSION,
  ensureForgeHome, readJson, writeJsonAtomic, backup, logLine,
} from "./state";

export async function run(args: string[]): Promise<void> {
  const localFlag = args.indexOf("--local");
  const localPath = localFlag >= 0 ? resolve(args[localFlag + 1] || process.cwd()) : null;
  const withExtras = args.includes("--with-extras") || args.includes("--full");
  const skipPrereqs = args.includes("--skip-prereqs");

  const allPlugins = withExtras ? [...PLUGINS, ...EXTRA_PLUGINS] : PLUGINS;
  console.log("🔨 forge install"
    + (localPath ? ` (local: ${localPath})` : "")
    + (withExtras ? ` (with extras: +${EXTRA_PLUGINS.length})` : ""));
  console.log();

  if (!skipPrereqs) await installPrereqs();

  await ensureForgeHome();
  if (!existsSync(CONFIG_PATH)) {
    await writeJsonAtomic(CONFIG_PATH, { autoupdate: true });
  }

  const NOW = new Date().toISOString();

  // 1. Register each marketplace through `claude plugin marketplace add` so Claude Code owns known_marketplaces.json.
  console.log("1/3 adding marketplaces...");
  for (const mp of MARKETPLACES) {
    const r = spawnSync("claude", ["plugin", "marketplace", "add", `https://github.com/${mp.repo}`], {
      encoding: "utf8", timeout: 60_000, stdio: "pipe",
    });
    if (r.status === 0) console.log(`  ✓ ${mp.name} ← ${mp.repo}`);
    else if ((r.stderr || "").includes("already")) console.log(`  ✓ ${mp.name} (already added)`);
    else console.log(`  ✗ ${mp.name} FAILED: ${(r.stderr || "").slice(0, 160)}`);
  }

  // forge marketplace: local path (--local) or github
  const forgeSpec = localPath ?? `https://github.com/${FORGE_MARKETPLACE.repo}`;
  if (localPath && !existsSync(join(localPath, ".claude-plugin", "marketplace.json"))) {
    console.log(`  ✗ ${localPath} is not a forge repo (missing .claude-plugin/marketplace.json)`);
    process.exit(1);
  }
  const fr = spawnSync("claude", ["plugin", "marketplace", "add", forgeSpec], { encoding: "utf8", stdio: "pipe" });
  if (fr.status === 0) console.log(`  ✓ forge ← ${forgeSpec}`);
  else if ((fr.stderr || "").includes("already")) console.log(`  ✓ forge (already added)`);
  else console.log(`  ✗ forge FAILED: ${(fr.stderr || "").slice(0, 160)}`);

  // Make sure marketplace listings are fresh (esp. just-added ones)
  spawnSync("claude", ["plugin", "marketplace", "update"], { encoding: "utf8", timeout: 60_000, stdio: "pipe" });
  console.log();

  // 2. Write wrapper script + patch ~/.claude/settings.json
  console.log("2/3 writing user settings...");
  const wrapperCmd = await writeWrapper(localPath);
  await backup(SETTINGS_PATH);
  const settings = await readJson<Record<string, unknown>>(SETTINGS_PATH, {});
  const extra = (settings.extraKnownMarketplaces as Record<string, unknown>) ?? {};
  for (const mp of [...MARKETPLACES, FORGE_MARKETPLACE]) {
    extra[mp.name] = { source: { source: "github", repo: mp.repo } };
  }
  settings.extraKnownMarketplaces = extra;
  // Pre-allowlist forge's MCP tools so `-p` mode and acceptEdits don't gate calls
  const perms = (settings.permissions as Record<string, any>) ?? {};
  const allow = new Set<string>((perms.allow as string[]) ?? []);
  for (const pattern of [
    "mcp__plugin_forge_docfork",
    "mcp__plugin_forge_deepwiki",
    "mcp__plugin_forge_github",
    "mcp__plugin_forge_snyk",
    "mcp__plugin_claude-mem_mcp-search",
  ]) allow.add(pattern);
  perms.allow = Array.from(allow).sort();
  settings.permissions = perms;
  // statusLine: delegate to claude-hud (richer HUD: context, tools, agents, todos).
  // Auto-detects bun vs node; resolves latest claude-hud version from the marketplace cache.
  const claudeHudCmd = buildClaudeHudStatusLineCommand();
  const desiredStatusLine = { type: "command", command: claudeHudCmd };
  const existing = settings.statusLine as { command?: string } | undefined;
  const isStaleForgeOrHud = !existing
    || existing.command?.includes("@yka/forge")
    || existing.command?.includes(FORGE_WRAPPER)
    || existing.command?.includes("claude-hud");
  if (isStaleForgeOrHud) {
    settings.statusLine = desiredStatusLine;
    console.log(`  ✓ statusLine → claude-hud (auto-resolves latest version)`);
  } else {
    console.log(`  − statusLine already set (non-forge/non-hud), skipping: ${JSON.stringify(existing)}`);
  }
  await writeJsonAtomic(SETTINGS_PATH, settings);
  console.log(`  ✓ wrapper installed: ${FORGE_WRAPPER} (${wrapperCmd})`);
  console.log(`  ✓ extraKnownMarketplaces merged (5 entries)`);
  console.log();

  // 3. Install forge plugin + 15 sub-plugins
  console.log(`3/3 installing forge + ${allPlugins.length} sub-plugins...`);
  let ok = 0; let fail = 0;
  // Install forge plugin (which auto-resolves deps on Claude Code v2.1.117+)
  if (claudePluginInstall("forge@forge")) { console.log(`  ✓ forge@forge`); ok++; }
  else { console.log(`  ✗ forge@forge FAILED`); fail++; }
  // Belt-and-suspenders: install each dep explicitly in case auto-resolve missed any
  for (const p of allPlugins) {
    if (claudePluginInstall(p)) { console.log(`  ✓ ${p}`); ok++; }
    else { console.log(`  ✗ ${p} FAILED`); fail++; }
  }

  // 3b. Configure claude-hud + install claude-mem (claude-mem fix runs `claude plugin marketplace update` which re-pulls protect-mcp's broken hooks).
  await configureClaudeHud();
  await installClaudeMem();
  // 3c. Stub protect-mcp hooks LAST (must be after any marketplace refresh).
  await regenerateProtectMcpHooks();

  // 3c. Post-install hook smoke — surface upstream regressions immediately
  console.log();
  console.log("post-install hook smoke...");
  const hookFail = await runHookSmoke();
  if (hookFail > 0) {
    console.log(`  ⚠️  ${hookFail} hook command(s) errored — run \`forge doctor --hooks\` to inspect`);
  } else {
    console.log(`  ✓ all enabled plugins' hooks exit clean`);
  }
  console.log();

  if (fail === 0) {
    await writeFile(BOOTSTRAPPED, NOW, "utf8");
    console.log(`✅ forge installed: ${ok} plugins active.`);
    console.log("👉 Restart Claude Code to activate sub-plugins + status line.");
    await logLine(`install ok: ${ok} plugins`);
  } else {
    console.log(`⚠️  Install finished with ${fail} errors. ${ok} plugins installed.`);
    console.log(`   Re-run 'bunx @yka/forge@latest install' to retry.`);
    await logLine(`install partial: ${ok} ok, ${fail} failed`);
    process.exit(1);
  }
}

async function ensureKMP(): Promise<void> {
  await Bun.write(KMP_PATH, JSON.stringify({}, null, 2)).catch(() => {});
  if (!existsSync(KMP_PATH)) {
    await writeJsonAtomic(KMP_PATH, {});
  }
}

async function registerKMP(mp: { name: string; repo: string }, loc: string, now: string): Promise<void> {
  const kmp = await readJson<Record<string, unknown>>(KMP_PATH, {});
  kmp[mp.name] = {
    source: { source: "github", repo: mp.repo },
    installLocation: loc,
    lastUpdated: now,
  };
  await writeJsonAtomic(KMP_PATH, kmp);
}


export async function regenerateProtectMcpHooks(): Promise<void> {
  // Stub the broken upstream protect-mcp hooks (calls obsolete `evaluate`/`sign` subcommands).
  // Walk every marketplaces/* AND cache/* dir to find every copy — upstream registers under
  // multiple marketplace names (e.g. claude-code-workflows + wshobson-agents).
  const { readdirSync, statSync } = await import("node:fs");
  const roots = [
    join(HOME, ".claude", "plugins", "marketplaces"),
    join(HOME, ".claude", "plugins", "cache"),
  ];
  const stubs: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const d = stack.pop()!;
      let entries: string[] = [];
      try { entries = readdirSync(d); } catch { continue; }
      for (const e of entries) {
        const p = join(d, e);
        try {
          if (statSync(p).isDirectory()) stack.push(p);
          else if (e === "hooks.json" && p.includes("/protect-mcp/")) stubs.push(p);
        } catch { /* skip */ }
      }
    }
  }
  let patched = 0;
  for (const f of stubs) {
    await writeFile(f, JSON.stringify({ hooks: {} }, null, 2), "utf8");
    patched++;
  }
  if (patched) console.log(`  ✓ protect-mcp per-tool-call hooks disabled (${patched} file(s)) — Phase 6 signing via skill remains active`);
}

async function writeWrapper(localPath: string | null): Promise<string> {
  await mkdir(BIN_DIR, { recursive: true });
  const target = localPath
    ? `exec bun ${join(localPath, "dist", "cli.js")} "$@"`
    : `exec bunx -y @yka/forge@latest "$@"`;
  const script = `#!/usr/bin/env bash\n# forge wrapper — generated by 'forge install'. Do not edit; rerun install to change.\n${target}\n`;
  await writeFile(FORGE_WRAPPER, script, "utf8");
  await chmod(FORGE_WRAPPER, 0o755);
  return localPath ? `local: ${localPath}/dist/cli.js` : "npm: @yka/forge@latest";
}


function buildClaudeHudStatusLineCommand(): string {
  // Prefer node (always available where Claude Code runs); claude-hud ships compiled dist/index.js
  // Single-quoted string so ${shell-vars} remain literal — Claude Code wraps this in bash -c at runtime.
  const inner =
    'cols=$(stty size </dev/tty 2>/dev/null | awk \'{print $2}\'); ' +
    'export COLUMNS=$(( ${cols:-120} > 4 ? ${cols:-120} - 4 : 1 )); ' +
    'plugin_dir=$(ls -1d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1); ' +
    'exec node "${plugin_dir}dist/index.js"';
  return "bash -c '" + inner.replace(/'/g, "'\"'\"'") + "'";
}


export async function configureClaudeHud(): Promise<void> {
  // Forge defaults for long multi-agent runs.
  // Skip: showCost (user pref), showEffortLevel (noise without @effort tagging).
  const forgeDefaults = {
    display: {
      showTools: true,
      showAgents: true,
      showTodos: true,
      showDuration: true,
      showSpeed: true,
      showPromptCache: true,
      showMemoryUsage: true,
      showTokenBreakdown: true,
      showSessionTokens: true,
      usageCompact: true,
      customLine: `[forge ${FORGE_VERSION}]`,
    },
  } as Record<string, any>;
  const cfgDir = join(HOME, ".claude", "plugins", "claude-hud");
  await mkdir(cfgDir, { recursive: true });
  const cfgPath = join(cfgDir, "config.json");
  const existing = await readJson<Record<string, any>>(cfgPath, {});
  const merged = { ...forgeDefaults, ...existing };
  merged.display = { ...forgeDefaults.display, ...(existing.display ?? {}) };
  merged.display.customLine = `[forge ${FORGE_VERSION}]`;
  await writeJsonAtomic(cfgPath, merged);
  console.log(`  ✓ claude-hud configured (9 display knobs ON, customLine=[forge ${FORGE_VERSION}])`);
}


async function runHookSmoke(): Promise<number> {
  // Inline mini-version of doctor.checkHooksOnly to avoid circular import.
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const FAKE: Record<string, string> = {
    UserPromptSubmit: '{"hook_event_name":"UserPromptSubmit","prompt":"hi","session_id":"abc","cwd":"/tmp"}',
    PreToolUse: '{"hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"/tmp/x"},"session_id":"abc","cwd":"/tmp"}',
    PostToolUse: '{"hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"/tmp/x"},"tool_response":"ok","session_id":"abc","cwd":"/tmp"}',
    SessionStart: '{"hook_event_name":"SessionStart","source":"startup","session_id":"abc","cwd":"/tmp"}',
    Stop: '{"hook_event_name":"Stop","session_id":"abc","cwd":"/tmp"}',
  };
  const settings = await readJson<Record<string, any>>(SETTINGS_PATH, {});
  const enabled = Object.keys(settings.enabledPlugins ?? {});
  const pluginsRoot = join(HOME, ".claude", "plugins", "marketplaces");
  if (!existsSync(pluginsRoot)) return 0;
  const stack: string[] = [pluginsRoot];
  const hookFiles: string[] = [];
  while (stack.length) {
    const d = stack.pop()!;
    let entries: string[] = [];
    try { entries = readdirSync(d); } catch { continue; }
    for (const e of entries) {
      const p = join(d, e);
      try { if (statSync(p).isDirectory()) stack.push(p); else if (e === "hooks.json") hookFiles.push(p); } catch { /* skip */ }
    }
  }
  let fail = 0;
  for (const hookFile of hookFiles) {
    const matched = enabled.find((spec) => hookFile.includes(`/${spec.split("@")[0]}/`));
    if (!matched) continue;
    let cfg: any;
    try { cfg = JSON.parse(readFileSync(hookFile, "utf8")); } catch { continue; }
    if (!cfg.hooks || Object.keys(cfg.hooks).length === 0) continue;
    const pluginRoot = hookFile.replace(/\/hooks\/hooks\.json$/, "");
    for (const [event, configs] of Object.entries(cfg.hooks)) {
      const payload = FAKE[event];
      if (!payload) continue;
      for (const cfgEntry of (configs as any[])) {
        for (const h of (cfgEntry.hooks ?? [])) {
          if (h.type !== "command" || !h.command) continue;
          const cmd = h.command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot);
          const r = spawnSync("bash", ["-c", cmd], { input: payload, encoding: "utf8", timeout: 15_000, env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot } });
          const out = (r.stdout || "") + (r.stderr || "");
          if (r.status !== 0 || /PROTECT_MCP|Missing.*separator|permission denied|hook error/i.test(out)) {
            fail++;
          }
        }
      }
    }
  }
  return fail;
}


async function installPrereqs(): Promise<void> {
  console.log("0/3 checking system prereqs...");
  // (name, install cmd, needsSudo) — order matters: cargo before jj/cargo-mutants
  const steps: Array<{ name: string; cmd: string; needsSudo: boolean; postCheck?: string }> = [
    { name: "cargo", cmd: "curl --proto =https --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal", needsSudo: false },
    { name: "jj",    cmd: `bash -c 'source $HOME/.cargo/env 2>/dev/null; cargo install --locked --bin jj jj-cli'`, needsSudo: false },
    { name: "uv",    cmd: "curl -LsSf https://astral.sh/uv/install.sh | sh", needsSudo: false },
    { name: "apprise", cmd: `bash -c 'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"; uv tool install apprise'`, needsSudo: false },
    { name: "mutmut",  cmd: `bash -c 'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"; uv tool install mutmut --with hypothesis --with "pytest<9"'`, needsSudo: false },
    { name: "syft",  cmd: "curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sudo sh -s -- -b /usr/local/bin", needsSudo: true },
    { name: "grype", cmd: "curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sudo sh -s -- -b /usr/local/bin", needsSudo: true },
    { name: "opengrep", cmd: "curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash", needsSudo: false },
  ];

  // Detect what's missing
  const missing = steps.filter((s) => spawnSync("command", ["-v", s.name], { shell: "/bin/bash", encoding: "utf8" }).stdout.trim() === "");
  if (missing.length === 0) { console.log("  ✓ all prereqs present"); console.log(); return; }
  console.log(`  installing ${missing.length} missing tool(s): ${missing.map((m) => m.name).join(", ")}`);

  for (const step of missing) {
    const tag = step.needsSudo ? `${step.name} (needs sudo)` : step.name;
    process.stdout.write(`  → ${tag} ... `);
    const r = spawnSync("bash", ["-c", step.cmd], { stdio: "inherit", timeout: 600_000 });
    if (r.status === 0) console.log(`✓`);
    else { console.log(`✗ exit=${r.status} — re-run install or install manually`); }
  }
  console.log("  (re-run `forge doctor` to verify)");
  console.log();
}


async function installClaudeMem(): Promise<void> {
  // claude-mem is a self-installing Claude Code plugin (NOT a stdio MCP package).
  // Quirk: it writes its marketplace.json to .agents/plugins/ with name="claude-mem-local",
  // but registers itself in known_marketplaces under key "thedotmack". Claude Code looks for
  // marketplace.json at .claude-plugin/ — so we copy + rewrite name to bridge the mismatch.
  const mpDir = join(HOME, ".claude", "plugins", "marketplaces", "thedotmack");
  if (!existsSync(mpDir)) {
    process.stdout.write("  → installing claude-mem plugin ... ");
    const r = spawnSync("bash", ["-c", "npx -y claude-mem@latest install --provider claude"], {
      encoding: "utf8", timeout: 120_000, stdio: "pipe",
    });
    if (r.status === 0) console.log("✓");
    else { console.log(`✗ exit=${r.status}: ${(r.stderr || "").slice(0, 200)}`); return; }
  } else {
    console.log("  ✓ claude-mem plugin already installed");
  }
  await fixClaudeMemMarketplaceJson(mpDir);
}

async function fixClaudeMemMarketplaceJson(mpDir: string): Promise<void> {
  const src = join(mpDir, ".agents", "plugins", "marketplace.json");
  const dstDir = join(mpDir, ".claude-plugin");
  const dst = join(dstDir, "marketplace.json");
  if (!existsSync(src)) return;
  await mkdir(dstDir, { recursive: true });
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(src, "utf8"));
  content.name = "thedotmack";
  await writeJsonAtomic(dst, content);
  // Force Claude Code to re-read the marketplace + plugin so MCP gets registered
  spawnSync("claude", ["plugin", "marketplace", "update"], { stdio: "ignore", timeout: 30_000 });
  spawnSync("claude", ["plugin", "install", "claude-mem@thedotmack"], { stdio: "ignore", timeout: 30_000 });
  console.log(`  ✓ patched claude-mem marketplace.json + refreshed CC plugin state`);
}

function claudePluginInstall(spec: string): boolean {
  const r = spawnSync("claude", ["plugin", "install", spec], {
    encoding: "utf8", timeout: 60_000, stdio: "pipe",
  });
  return r.status === 0;
}
