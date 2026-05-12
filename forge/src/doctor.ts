import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  MARKETPLACES, FORGE_MARKETPLACE, PLUGINS, MP_DIR, BOOTSTRAPPED, CONFIG_PATH,
  SETTINGS_PATH, KMP_PATH, HOME, FORGE_VERSION,
  readJson, ensureForgeHome,
} from "./state";
import type { ClaudeSettings } from "./types";

const FAKE_EVENTS: Record<string, string> = {
  UserPromptSubmit: '{"hook_event_name":"UserPromptSubmit","prompt":"hi","session_id":"abc","cwd":"/tmp"}',
  PreToolUse: '{"hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"/tmp/x"},"session_id":"abc","cwd":"/tmp"}',
  PostToolUse: '{"hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"/tmp/x"},"tool_response":"ok","session_id":"abc","cwd":"/tmp"}',
  SessionStart: '{"hook_event_name":"SessionStart","source":"startup","session_id":"abc","cwd":"/tmp"}',
  Stop: '{"hook_event_name":"Stop","session_id":"abc","cwd":"/tmp"}',
};

const EXPECTED_MCPS = ["docfork", "deepwiki", "github", "snyk"];

const SYSTEM_TOOLS: Array<{ name: string; hint: string; required: boolean }> = [
  { name: "bun", hint: "curl -fsSL https://bun.sh/install | bash", required: true },
  { name: "node", hint: "https://nodejs.org or your package manager", required: true },
  { name: "npx", hint: "ships with node", required: true },
  { name: "jq", hint: "apt install jq | brew install jq", required: true },
  { name: "git", hint: "your package manager", required: true },
  { name: "gh", hint: "https://cli.github.com — Phase 6 PR creation", required: true },
  { name: "claude", hint: "Claude Code itself", required: true },
  { name: "jj", hint: "cargo install jj-cli — Phase 4 parcel snapshots", required: true },
  { name: "python3", hint: "Phase 5 PBT + mutation", required: true },
  { name: "cargo", hint: "rustup — Phase 5 Rust mutation (cargo-mutants)", required: true },
  { name: "apprise", hint: "pip install apprise — Stop-hook notifications", required: true },
  { name: "opengrep", hint: "Phase 2 security scan (SAST)", required: true },
  { name: "grype", hint: "Phase 2 security scan (SCA)", required: true },
  { name: "syft", hint: "Phase 2 security scan (SBOM)", required: true },
  { name: "mutmut", hint: "pip install mutmut — Phase 5 Python mutation", required: true },
];

export async function run(args: string[]): Promise<void> {
  const quiet = args.includes("--quiet");
  const hooksOnly = args.includes("--hooks");
  const jsonMode = args.includes("--json");
  await ensureForgeHome();

  // --quiet: legacy SessionStart hook mode — emit additionalContext JSON for state/updates only
  if (quiet) { await runQuietMode(); return; }
  if (hooksOnly) { const fail = await checkHooksOnly(); process.exit(fail > 0 ? 1 : 0); }

  const results: HealthResult[] = [];
  results.push(await checkBootstrapped());
  results.push(await checkMarketplaces());
  results.push(await checkPlugins());
  results.push(await checkStatusLine());
  results.push(await checkClaudeHudConfig());
  results.push(await checkProtectMcpStubbed());
  results.push(await checkMcpJson());
  results.push(await checkClaudeMemPlugin());
  results.push(await checkSystemTools());
  results.push(await checkHooks());
  results.push(await checkUpdates());

  if (jsonMode) {
    console.log(JSON.stringify({ forge: FORGE_VERSION, results }, null, 2));
  } else {
    for (const r of results) printResult(r);
    console.log();
    const fail = results.filter((r) => r.status === "fail").length;
    const warn = results.filter((r) => r.status === "warn").length;
    if (fail === 0 && warn === 0) console.log(`✅ forge ${FORGE_VERSION}: all green.`);
    else console.log(`⚠️  forge ${FORGE_VERSION}: ${fail} fail, ${warn} warn — see above.`);
  }
  process.exit(results.some((r) => r.status === "fail") ? 1 : 0);
}

interface HealthResult {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  lines?: string[];
}

function printResult(r: HealthResult): void {
  const icon = r.status === "ok" ? "✓" : r.status === "warn" ? "⚠" : "✗";
  console.log(`${icon} ${r.name}: ${r.detail}`);
  for (const l of r.lines ?? []) console.log(`    ${l}`);
}

async function checkBootstrapped(): Promise<HealthResult> {
  if (existsSync(BOOTSTRAPPED)) return { name: "bootstrapped", status: "ok", detail: "marker present" };
  return { name: "bootstrapped", status: "fail", detail: "NOT BOOTSTRAPPED — run `forge install`" };
}

async function checkMarketplaces(): Promise<HealthResult> {
  const kmp = await readJson<Record<string, any>>(KMP_PATH, {});
  const expected = [...MARKETPLACES, FORGE_MARKETPLACE].map((m) => m.name);
  const missing = expected.filter((n) => !kmp[n]);
  if (missing.length === 0) return { name: "marketplaces", status: "ok", detail: `${expected.length}/${expected.length} registered` };
  return { name: "marketplaces", status: "fail", detail: `${expected.length - missing.length}/${expected.length} registered`, lines: missing.map((m) => `missing: ${m}`) };
}

async function checkPlugins(): Promise<HealthResult> {
  const settings = await readJson<Record<string, any>>(SETTINGS_PATH, {});
  const enabled = Object.entries(settings.enabledPlugins ?? {}).filter(([, v]) => v === true).map(([k]) => k);
  const expected = ["forge@forge", ...PLUGINS];
  const missing = expected.filter((spec) => !enabled.includes(spec));
  const detail = `${expected.length - missing.length}/${expected.length} enabled`;
  if (missing.length === 0) return { name: "plugins", status: "ok", detail };
  return { name: "plugins", status: "fail", detail, lines: missing.map((m) => `missing: ${m}`) };
}

async function checkStatusLine(): Promise<HealthResult> {
  const settings = await readJson<Record<string, any>>(SETTINGS_PATH, {});
  const cmd = settings.statusLine?.command as string | undefined;
  if (!cmd) return { name: "statusLine", status: "fail", detail: "not set in settings.json" };
  if (cmd.includes("claude-hud")) return { name: "statusLine", status: "ok", detail: "→ claude-hud" };
  return { name: "statusLine", status: "warn", detail: `not pointing at claude-hud: ${cmd.slice(0, 80)}` };
}

async function checkClaudeHudConfig(): Promise<HealthResult> {
  const p = join(HOME, ".claude", "plugins", "claude-hud", "config.json");
  if (!existsSync(p)) return { name: "claude-hud config", status: "fail", detail: `missing: ${p}` };
  const cfg = await readJson<Record<string, any>>(p, {});
  const customLine = cfg.display?.customLine as string | undefined;
  if (!customLine || !customLine.includes("forge")) return { name: "claude-hud config", status: "warn", detail: `customLine not set to [forge ${FORGE_VERSION}]` };
  return { name: "claude-hud config", status: "ok", detail: `customLine=${customLine}` };
}

async function checkProtectMcpStubbed(): Promise<HealthResult> {
  const roots = [join(HOME, ".claude", "plugins", "marketplaces"), join(HOME, ".claude", "plugins", "cache")];
  const broken: string[] = [];
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
          else if (e === "hooks.json" && p.includes("/protect-mcp/")) {
            const content = readFileSync(p, "utf8");
            if (/evaluate|sign/.test(content)) broken.push(p);
          }
        } catch { /* skip */ }
      }
    }
  }
  if (broken.length === 0) return { name: "protect-mcp hooks", status: "ok", detail: "all stubbed" };
  return { name: "protect-mcp hooks", status: "fail", detail: `${broken.length} broken hook(s) — run \`forge update\``, lines: broken };
}

async function checkMcpJson(): Promise<HealthResult> {
  const candidates = [
    join(HOME, ".claude", "plugins", "marketplaces", "forge", "plugin", ".mcp.json"),
    join(HOME, ".claude", "plugins", "cache", "forge", "forge", "0.0.1", ".mcp.json"),
  ];
  let mcpPath: string | undefined;
  for (const c of candidates) if (existsSync(c)) { mcpPath = c; break; }
  if (!mcpPath) {
    // search for any forge .mcp.json
    const root = join(HOME, ".claude", "plugins");
    const stack = [root];
    while (stack.length && !mcpPath) {
      const d = stack.pop()!;
      let entries: string[] = [];
      try { entries = readdirSync(d); } catch { continue; }
      for (const e of entries) {
        const p = join(d, e);
        try {
          if (statSync(p).isDirectory()) stack.push(p);
          else if (e === ".mcp.json" && p.includes("forge")) { mcpPath = p; break; }
        } catch { /* skip */ }
      }
    }
  }
  if (!mcpPath) return { name: ".mcp.json", status: "fail", detail: "forge .mcp.json not found" };
  let parsed: any;
  try { parsed = JSON.parse(readFileSync(mcpPath, "utf8")); } catch (e: any) { return { name: ".mcp.json", status: "fail", detail: `parse error: ${e.message}` }; }
  const declared = Object.keys(parsed.mcpServers ?? {});
  const missing = EXPECTED_MCPS.filter((s) => !declared.includes(s));
  if (missing.length === 0) return { name: ".mcp.json", status: "ok", detail: `${EXPECTED_MCPS.length}/${EXPECTED_MCPS.length} MCPs declared` };
  return { name: ".mcp.json", status: "fail", detail: `${EXPECTED_MCPS.length - missing.length}/${EXPECTED_MCPS.length} declared`, lines: missing.map((m) => `missing: ${m}`) };
}


async function checkClaudeMemPlugin(): Promise<HealthResult> {
  const settings = await readJson<Record<string, any>>(SETTINGS_PATH, {});
  const enabled = Object.keys(settings.enabledPlugins ?? {});
  if (enabled.includes("claude-mem@thedotmack")) return { name: "claude-mem plugin", status: "ok", detail: "claude-mem@thedotmack enabled (provides mcp__plugin_claude-mem_mcp-search__*)" };
  return { name: "claude-mem plugin", status: "fail", detail: "claude-mem@thedotmack NOT enabled — run \`forge install\` to install it" };
}

async function checkSystemTools(): Promise<HealthResult> {
  const missing: string[] = [];
  const missingOptional: string[] = [];
  for (const t of SYSTEM_TOOLS) {
    const onPath = spawnSync("command", ["-v", t.name], { encoding: "utf8", shell: "/bin/bash" });
    const fallbackPaths = [
      `${HOME}/.cargo/bin/${t.name}`,
      `${HOME}/.local/bin/${t.name}`,
      `${HOME}/.opengrep/cli/latest/${t.name}`,
    ];
    const onPathOk = onPath.status === 0 && onPath.stdout.trim().length > 0;
    const fallbackOk = fallbackPaths.some((p) => existsSync(p));
    if (!onPathOk && !fallbackOk) {
      if (t.required) missing.push(`${t.name} — ${t.hint}`);
      else missingOptional.push(`${t.name} — ${t.hint}`);
    }
  }
  const total = SYSTEM_TOOLS.length;
  const ok = total - missing.length - missingOptional.length;
  if (missing.length === 0 && missingOptional.length === 0) return { name: "system tools", status: "ok", detail: `${ok}/${total} present` };
  if (missing.length === 0) return { name: "system tools", status: "warn", detail: `${ok}/${total} present (${missingOptional.length} optional missing)`, lines: missingOptional };
  return { name: "system tools", status: "fail", detail: `${ok}/${total} present`, lines: [...missing, ...missingOptional] };
}

async function checkHooks(): Promise<HealthResult> {
  const fail = await checkHooksOnly(true);
  if (fail === 0) return { name: "hook smoke", status: "ok", detail: "all enabled plugins' hooks exit clean" };
  return { name: "hook smoke", status: "fail", detail: `${fail} hook command(s) errored — run \`forge doctor --hooks\` for details` };
}

async function checkUpdates(): Promise<HealthResult> {
  const behind: string[] = [];
  for (const mp of [FORGE_MARKETPLACE, ...MARKETPLACES]) {
    const loc = join(MP_DIR, mp.name);
    if (!existsSync(join(loc, ".git"))) continue;
    spawnSync("git", ["-C", loc, "fetch", "--quiet"], { timeout: 5_000 });
    const local = gitOutput(loc, ["rev-parse", "HEAD"]);
    const remote = gitOutput(loc, ["rev-parse", "@{u}"]);
    if (local && remote && local.trim() !== remote.trim()) behind.push(mp.name);
  }
  if (behind.length === 0) return { name: "updates", status: "ok", detail: "all marketplaces up to date" };
  return { name: "updates", status: "warn", detail: `${behind.length} marketplace(s) behind upstream — run \`forge update\``, lines: behind };
}

async function checkHooksOnly(silent = false): Promise<number> {
  const settings = await readJson<Record<string, any>>(SETTINGS_PATH, {});
  const enabled = Object.keys(settings.enabledPlugins ?? {});
  const pluginsRoot = join(HOME, ".claude", "plugins", "marketplaces");
  if (!existsSync(pluginsRoot)) return 0;

  const stack = [pluginsRoot];
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
  if (!silent) console.log("forge doctor --hooks: firing every enabled plugin's hooks with fake payloads\n");
  for (const hookFile of hookFiles) {
    const matched = enabled.find((spec) => hookFile.includes(`/${spec.split("@")[0]}/`));
    if (!matched) continue;
    let cfg: any;
    try { cfg = JSON.parse(readFileSync(hookFile, "utf8")); } catch { continue; }
    if (!cfg.hooks || Object.keys(cfg.hooks).length === 0) {
      if (!silent) console.log(`  − ${matched}: no hooks declared`);
      continue;
    }
    if (!silent) console.log(`--- ${matched} ---`);
    const pluginRoot = hookFile.replace(/\/hooks\/hooks\.json$/, "");
    for (const [event, configs] of Object.entries(cfg.hooks)) {
      const payload = FAKE_EVENTS[event];
      if (!payload) continue;
      for (const cfgEntry of (configs as any[])) {
        for (const h of (cfgEntry.hooks ?? [])) {
          if (h.type !== "command" || !h.command) continue;
          const cmd = h.command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot);
          const r = spawnSync("bash", ["-c", cmd], {
            input: payload, encoding: "utf8", timeout: 15_000,
            env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
          });
          const out = (r.stdout || "") + (r.stderr || "");
          const looksError = /PROTECT_MCP|Missing.*separator|permission denied|hook error|traceback|fatal/i.test(out);
          if (r.status !== 0 || looksError) {
            if (!silent) {
              console.log(`  ✗ ${event}: exit=${r.status}`);
              console.log(`    cmd: ${cmd.slice(0, 100)}`);
              console.log(`    out: ${out.split("\n").slice(0, 3).join(" | ").slice(0, 200)}`);
            }
            fail++;
          } else if (!silent) {
            console.log(`  ✓ ${event}: exit=0`);
          }
        }
      }
    }
  }
  return fail;
}

async function runQuietMode(): Promise<void> {
  if (!existsSync(BOOTSTRAPPED)) {
    printContext(`🔨 FORGE FIRST-INSTALL DETECTED. Run \`bunx @yka/forge@latest install\` from the user's terminal.`);
    return;
  }
  const cfg = await readJson<{ autoupdate?: boolean }>(CONFIG_PATH, {});
  const autoupdate = cfg.autoupdate !== false;
  const behind: string[] = [];
  for (const mp of [FORGE_MARKETPLACE, ...MARKETPLACES]) {
    const loc = join(MP_DIR, mp.name);
    if (!existsSync(join(loc, ".git"))) continue;
    spawnSync("git", ["-C", loc, "fetch", "--quiet"], { timeout: 5_000 });
    const local = gitOutput(loc, ["rev-parse", "HEAD"]);
    const remote = gitOutput(loc, ["rev-parse", "@{u}"]);
    if (local && remote && local.trim() !== remote.trim()) behind.push(mp.name);
  }
  if (behind.length === 0 || !autoupdate) return;
  printContext(`🔨 forge updates available: ${behind.join(", ")}. As soon as the user sends ANY message, use AskUserQuestion to ask "Update forge plugins?" with options "Update now", "Skip for this session", "Disable auto-update prompt". On Update, run \`bunx @yka/forge@latest update\` via Bash.`);
}

function gitOutput(cwd: string, args: string[]): string | undefined {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 5_000 });
  return r.status === 0 ? r.stdout : undefined;
}

function printContext(text: string): void {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }));
}
