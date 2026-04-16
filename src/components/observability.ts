import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";

export const observabilityCategory: ComponentCategory = {
  id: "observability",
  name: "Observability",
  tier: "optional",
  description: "Telemetry and usage monitoring for Claude Code",
  defaultEnabled: false,
  components: [
    {
      id: 23,
      name: "native-telemetry",
      displayName: "Native Telemetry",
      description: "OpenTelemetry env vars for Claude Code (set in primordial)",
      tier: "optional",
      category: "observability",
      packages: [],
      verifyCommand: "echo native-telemetry-envvars",
    },
    {
      id: 24,
      name: "ccflare",
      displayName: "ccflare",
      description: "Claude API proxy + monitoring TUI (token spend, per-session cost, tool breakdown, trends). Default port 8787 to avoid multica's 8080.",
      tier: "optional",
      category: "observability",
      packages: [],
      verifyCommand: "ccflare --help",
    },
  ],
};

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  // --- Native Telemetry (env vars set in primordial) ---
  try {
    const hasOtel = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT || !!process.env.CLAUDE_CODE_ENABLE_TELEMETRY;
    if (hasOtel) {
      log.info("Native telemetry env vars already present");
      results.push({
        component: "Native Telemetry",
        status: "already-installed",
        message: "Telemetry env vars already configured in environment",
        verifyPassed: true,
      });
    } else {
      log.info("Native telemetry: OTEL_EXPORTER_OTLP_ENDPOINT and CLAUDE_CODE_ENABLE_TELEMETRY should be set in your shell RC by the primordial layer");
      results.push({
        component: "Native Telemetry",
        status: "skipped",
        message: "Telemetry env vars are managed by the primordial layer — check your shell RC",
        verifyPassed: false,
      });
    }
  } catch (err) {
    results.push({
      component: "Native Telemetry",
      status: "failed",
      message: `Native telemetry check failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- ccflare (upstream: snipeship/ccflare — git+bun, no npm package) ---
  //
  // Two npm packages carry the name `ccflare` / `better-ccflare` but neither
  // tracks the real repo (0.0.2 placeholder from 8 months ago). The live TUI
  // lives at github.com/snipeship/ccflare and must be cloned + built with bun.
  //
  // Port 8080 is ccflare's upstream default, which clashes with multica's
  // backend. Launcher script sets CCFLARE_PORT=8787 by default; user can
  // override via env.
  try {
    const { join } = await import("node:path");
    const { promises: fs } = await import("node:fs");
    const repoDir = join(env.homeDir, ".ccflare");
    const launcher = join(env.homeDir, ".local", "bin", "ccflare");
    const installed = () => commandExists("ccflare");

    if (installed()) {
      log.info("ccflare already installed, skipping");
      results.push({
        component: "ccflare",
        status: "already-installed",
        message: `ccflare installed — launch with \`ccflare\` (default port 8787, override with CCFLARE_PORT)`,
        verifyPassed: true,
      });
    } else if (dryRun) {
      log.info("[dry-run] Would clone snipeship/ccflare to ~/.ccflare, run bun install + build");
      results.push({
        component: "ccflare",
        status: "skipped",
        message: "[dry-run] Would install ccflare via git+bun on port 8787",
        verifyPassed: false,
      });
    } else if (!commandExists("bun")) {
      results.push({
        component: "ccflare",
        status: "skipped",
        message: "bun not found — install bun first, then re-run setup (ccflare requires bun >=1.2.8)",
        verifyPassed: false,
      });
    } else {
      const repoExists = await fs.stat(repoDir).then(() => true).catch(() => false);
      if (!repoExists) {
        await $`git clone --depth 1 https://github.com/snipeship/ccflare ${repoDir}`.nothrow();
      }
      await $`sh -c ${`cd "${repoDir}" && bun install && bun run build`}`.nothrow();

      // Resolve bun's absolute path so the systemd unit works under a
      // non-login shell (systemd --user doesn't source .bashrc).
      const bunPath = (await $`sh -c "command -v bun"`.nothrow().text()).trim() || "bun";

      await fs.mkdir(join(env.homeDir, ".local", "bin"), { recursive: true });
      const script = `#!/usr/bin/env bash
# ccflare launcher — TUI + proxy server. Defaults to port 8787 so it doesn't
# clash with multica's backend on 8080. Override via CCFLARE_PORT=<N>.
# bun path is baked in at install time for systemd-unit compatibility.
cd "$HOME/.ccflare" && exec "${bunPath}" run apps/tui/src/main.ts --port "\${CCFLARE_PORT:-8787}" "$@"
`;
      await fs.writeFile(launcher, script);
      await $`chmod +x ${launcher}`.nothrow();

      // systemd user unit — auto-start ccflare in headless proxy+dashboard
      // mode (`--serve`). Without this the hook's clickable URL goes to a
      // closed port on reboot.
      if (env.os === "linux" && commandExists("systemctl")) {
        const unitDir = join(env.homeDir, ".config", "systemd", "user");
        await fs.mkdir(unitDir, { recursive: true });
        const unit = `[Unit]
Description=ccflare Claude API proxy + monitoring dashboard
After=network.target

[Service]
Type=simple
Environment=CCFLARE_PORT=8787
ExecStart=%h/.local/bin/ccflare --serve
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`;
        await fs.writeFile(join(unitDir, "ccflare.service"), unit);
        await $`systemctl --user daemon-reload`.nothrow();
        await $`systemctl --user enable --now ccflare.service`.nothrow();
      }

      results.push({
        component: "ccflare",
        status: installed() ? "installed" : "failed",
        message: installed()
          ? `ccflare installed at ${repoDir}, launcher → ${launcher}; systemd user unit starts it on port 8787 at login`
          : "ccflare git/build finished but launcher not on PATH — ensure ~/.local/bin is in PATH",
        verifyPassed: installed(),
      });
    }
  } catch (err) {
    results.push({
      component: "ccflare",
      status: "failed",
      message: `ccflare install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  return results;
}
