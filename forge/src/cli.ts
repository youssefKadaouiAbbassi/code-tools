#!/usr/bin/env bun
/**
 * forge — Claude Code plugin orchestrator CLI.
 * Distributes via npm (`bunx @yka/forge@latest <cmd>`); the actual plugin lives at
 * github.com/youssefKadaouiAbbassi/forge and is installed by `forge install`.
 */

const VERSION = "0.0.1";

const commands = {
  install: () => import("./install"),
  update: () => import("./update"),
  uninstall: () => import("./uninstall"),
  reinstall: () => import("./reinstall"),
  doctor: () => import("./doctor"),
  statusline: () => import("./statusline"),
};

function help(): void {
  console.log(`forge ${VERSION}

Usage:
  bunx @yka/forge@latest <command> [options]

Commands:
  install [--local <path>] [--with-extras|--full] [--skip-prereqs]
                Auto-install 7 system tools (cargo, jj, apprise, mutmut, syft,
                grype, opengrep — used by forge phases 2/4/5/6; sudo may be
                prompted), then add 5 marketplaces, install forge + 7 KEEP
                plugins + claude-hud, wire claude-hud as statusLine, configure
                HUD, stub upstream-broken protect-mcp hooks.
                --with-extras adds hookify + superpowers.
                --local <path> uses a local forge checkout (dev mode).
                --skip-prereqs skips the system-tool auto-install.

  update [enable|disable|status]
                Refresh all marketplaces (git pull), update forge + each sub-plugin,
                re-stub protect-mcp hooks, re-write claude-hud config.
                Sub-args toggle the SessionStart auto-update prompt.

  uninstall [--keep-deps]
                Remove forge + every plugin from forge marketplaces, strip
                statusLine + extraKnownMarketplaces + enabledPlugins entries,
                wipe ~/.claude/forge/. --keep-deps leaves shared marketplaces.

  reinstall [--local <path>] [--with-extras]
                Uninstall everything then install fresh. Use after upstream
                breakage or to apply config/version bumps.

  doctor [--quiet|--hooks|--json]
                Default: full health check (bootstrapped → marketplaces →
                plugins → statusLine → claude-hud config → protect-mcp stubs →
                MCPs declared → system tools → hook smoke → updates available).
                --hooks: hook smoke only.
                --quiet: JSON output for SessionStart hook (state/update hint only).
                --json: full health as JSON.

  statusline    Render forge's minimal status line.
                Debug/CI only — production HUD is claude-hud.

Examples:
  bunx @yka/forge@latest install
  bunx @yka/forge@latest install --with-extras
  bunx @yka/forge@latest doctor
  bunx @yka/forge@latest doctor --hooks
  bunx @yka/forge@latest update disable

Issues: https://github.com/youssefKadaouiAbbassi/forge/issues
`);
}

const cmd = Bun.argv[2];
if (!cmd || cmd === "--help" || cmd === "-h") {
  help();
  process.exit(0);
}
if (cmd === "--version" || cmd === "-v") {
  console.log(VERSION);
  process.exit(0);
}

const loader = commands[cmd as keyof typeof commands];
if (!loader) {
  console.error(`forge: unknown command "${cmd}"`);
  help();
  process.exit(1);
}

const mod = await loader();
await mod.run(Bun.argv.slice(3));
