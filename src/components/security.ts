import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";
import type { ComponentSpec } from "./framework.js";
import { runComponent } from "./framework.js";

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
          curl: "curl --connect-timeout 15 --max-time 300 -fsSL https://dl.dagger.io/container-use/install.sh | sh",
        },
      ],
      verifyCommand: "container-use --version",
    },
  ],
};

const snykSpec: ComponentSpec = {
  id: 5,
  name: "snyk",
  displayName: "Snyk MCP",
  description: "Security vulnerability scanning MCP server",
  tier: "recommended",
  category: "security",
  probe: async () => ({ present: commandExists("snyk") }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async (_env, _plan, dryRun) => {
    try {
      const existed = commandExists("snyk");
      if (dryRun) {
        const verb = existed ? "upgrade" : "install";
        log.info(`[dry-run] Would ${verb}: npm install -g snyk@latest && snyk mcp configure --tool=claude-cli`);
        return {
          component: "Snyk MCP",
          status: "skipped",
          message: `[dry-run] Would ${verb} Snyk MCP`,
          verifyPassed: false,
        };
      }
      await $`sh -c "npm install -g snyk@latest"`;
      await $`sh -c "snyk mcp configure --tool=claude-cli"`.nothrow();
      const installed = commandExists("snyk");
      return {
        component: "Snyk MCP",
        status: installed ? "installed" : "failed",
        message: installed ? (existed ? "Snyk upgraded + MCP reconfigured" : "Snyk MCP configured successfully") : "Snyk MCP setup ran but binary not found",
        verifyPassed: installed,
      };
    } catch (err) {
      return {
        component: "Snyk MCP",
        status: "failed",
        message: `Snyk MCP setup failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => commandExists("snyk"),
};

const containerUseSpec: ComponentSpec = {
  id: 15,
  name: "cu",
  displayName: "container-use",
  description: "Sandboxed container execution via Dagger",
  tier: "recommended",
  category: "security",
  probe: async () => ({ present: commandExists("container-use") || commandExists("cu") }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async (env, _plan, dryRun) => {
    try {
      const cuExists = () => commandExists("container-use") || commandExists("cu");
      const existed = cuExists();
      if (dryRun) {
        const verb = existed ? "upgrade" : "install";
        const cmd = env.packageManager === "brew"
          ? (existed ? "brew upgrade dagger/tap/container-use" : "brew install dagger/tap/container-use")
          : "curl --connect-timeout 15 --max-time 300 -fsSL https://dl.dagger.io/container-use/install.sh | sh";
        log.info(`[dry-run] Would ${verb}: ${cmd}`);
        return {
          component: "container-use",
          status: "skipped",
          message: `[dry-run] Would ${verb} container-use`,
          verifyPassed: false,
        };
      }
      let cmd: string;
      if (env.packageManager === "brew") {
        cmd = existed ? "brew upgrade dagger/tap/container-use" : "brew install dagger/tap/container-use";
      } else {
        const arch = env.arch === "arm64" ? "arm64" : "amd64";
        const platform = env.os === "macos" ? "darwin" : "linux";
        cmd =
          `set -e; ` +
          `LATEST=$(curl --connect-timeout 15 --max-time 30 -sS https://api.github.com/repos/dagger/container-use/releases/latest | grep tag_name | head -1 | sed 's/.*"\\(v[^"]*\\)".*/\\1/'); ` +
          `URL="https://github.com/dagger/container-use/releases/download/$LATEST/container-use_${'$'}{LATEST}_${platform}_${arch}.tar.gz"; ` +
          `mkdir -p "$HOME/.local/bin"; ` +
          `TMP=$(mktemp -d); ` +
          `curl --connect-timeout 15 --max-time 300 -sSL "$URL" | tar -xz -C "$TMP"; ` +
          `mv "$TMP/container-use" "$HOME/.local/bin/container-use"; ` +
          `chmod +x "$HOME/.local/bin/container-use"; ` +
          `rm -rf "$TMP"`;
      }
      await $`sh -c ${cmd}`.nothrow();
      const installed = cuExists();
      return {
        component: "container-use",
        status: installed ? "installed" : "failed",
        message: installed ? (existed ? "container-use upgraded to latest" : "container-use installed successfully") : "container-use install ran but binary not found",
        verifyPassed: installed,
      };
    } catch (err) {
      return {
        component: "container-use",
        status: "failed",
        message: `container-use install failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => commandExists("container-use") || commandExists("cu"),
};

export const securitySpecs: ComponentSpec[] = [snykSpec, containerUseSpec];

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const spec of securitySpecs) {
    results.push(await runComponent(spec, env, dryRun));
  }
  return results;
}
