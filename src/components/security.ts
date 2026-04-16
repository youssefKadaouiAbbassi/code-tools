import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";

export const securityCategory: ComponentCategory = {
  id: "security",
  name: "Security",
  tier: "recommended",
  description: "Security scanning and sandboxed container execution",
  defaultEnabled: true,
  components: [
    {
      id: 5,
      name: "snyk",
      displayName: "Snyk MCP",
      description: "Security vulnerability scanning MCP server",
      tier: "recommended",
      category: "security",
      packages: [
        {
          name: "snyk",
          displayName: "Snyk MCP",
          npm: "npx -y snyk@latest mcp configure --tool=claude-cli",
        },
      ],
      verifyCommand: "snyk --version",
    },
    {
      id: 15,
      name: "cu",
      displayName: "container-use",
      description: "Sandboxed container execution via Dagger",
      tier: "recommended",
      category: "security",
      packages: [
        {
          name: "cu",
          displayName: "container-use",
          brew: "brew install dagger/tap/container-use",
          curl: "curl -fsSL https://dl.dagger.io/container-use/install.sh | sh",
        },
      ],
      verifyCommand: "container-use --version",
    },
  ],
};

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  // --- Snyk MCP ---
  try {
    if (commandExists("snyk")) {
      log.info("Snyk already installed, skipping");
      results.push({
        component: "Snyk MCP",
        status: "already-installed",
        message: "Snyk is already installed",
        verifyPassed: true,
      });
    } else if (dryRun) {
      log.info("[dry-run] Would run: npx -y snyk@latest mcp configure --tool=claude-cli");
      results.push({
        component: "Snyk MCP",
        status: "skipped",
        message: "[dry-run] Would configure Snyk MCP via claude-cli",
        verifyPassed: false,
      });
    } else {
      // Install snyk globally first, then configure MCP. The original `npx snyk mcp configure`
      // does not install snyk — it runs ephemerally via npx and leaves no binary.
      await $`sh -c "npm install -g snyk@latest"`;
      await $`sh -c "snyk mcp configure --tool=claude-cli"`.nothrow();
      const installed = commandExists("snyk");
      results.push({
        component: "Snyk MCP",
        status: installed ? "installed" : "failed",
        message: installed ? "Snyk MCP configured successfully" : "Snyk MCP setup ran but binary not found",
        verifyPassed: installed,
      });
    }
  } catch (err) {
    results.push({
      component: "Snyk MCP",
      status: "failed",
      message: `Snyk MCP setup failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- container-use ---
  try {
    // Binary is installed as `container-use`; some setups also alias to `cu`.
    const cuExists = () => commandExists("container-use") || commandExists("cu");
    if (cuExists()) {
      log.info("container-use already installed, skipping");
      results.push({
        component: "container-use",
        status: "already-installed",
        message: "container-use is already installed",
        verifyPassed: true,
      });
    } else if (dryRun) {
      const cmd = env.packageManager === "brew"
        ? "brew install dagger/tap/container-use"
        : "curl -fsSL https://dl.dagger.io/container-use/install.sh | sh";
      log.info(`[dry-run] Would run: ${cmd}`);
      results.push({
        component: "container-use",
        status: "skipped",
        message: `[dry-run] Would install container-use via: ${cmd}`,
        verifyPassed: false,
      });
    } else {
      let cmd: string;
      if (env.packageManager === "brew") {
        cmd = "brew install dagger/tap/container-use";
      } else {
        // Download from GitHub releases (the dagger.io hosted installer URL is dead).
        const arch = env.arch === "arm64" ? "arm64" : "amd64";
        const platform = env.os === "macos" ? "darwin" : "linux";
        cmd =
          `set -e; ` +
          `LATEST=$(curl -sS https://api.github.com/repos/dagger/container-use/releases/latest | grep tag_name | head -1 | sed 's/.*"\\(v[^"]*\\)".*/\\1/'); ` +
          `URL="https://github.com/dagger/container-use/releases/download/$LATEST/container-use_${'$'}{LATEST}_${platform}_${arch}.tar.gz"; ` +
          `mkdir -p "$HOME/.local/bin"; ` +
          `TMP=$(mktemp -d); ` +
          `curl -sSL "$URL" | tar -xz -C "$TMP"; ` +
          `mv "$TMP/container-use" "$HOME/.local/bin/container-use"; ` +
          `chmod +x "$HOME/.local/bin/container-use"; ` +
          `rm -rf "$TMP"`;
      }
      await $`sh -c ${cmd}`.nothrow();
      const installed = cuExists();
      results.push({
        component: "container-use",
        status: installed ? "installed" : "failed",
        message: installed ? "container-use installed successfully" : "container-use install ran but binary not found",
        verifyPassed: installed,
      });
    }
  } catch (err) {
    results.push({
      component: "container-use",
      status: "failed",
      message: `container-use install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  return results;
}
