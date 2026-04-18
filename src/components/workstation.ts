import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";
import { installBinary } from "../packages.js";
import type { ComponentSpec } from "./framework.js";
import { runComponent } from "./framework.js";

export const workstationCategory: ComponentCategory = {
  id: "workstation",
  name: "Workstation Extras",
  tier: "recommended",
  description: "Terminal emulator and dotfile management tools",
  defaultEnabled: true,
  components: [
    {
      id: 36,
      name: "ghostty",
      displayName: "Ghostty",
      description: "Fast, feature-rich GPU-accelerated terminal emulator",
      tier: "recommended",
      category: "workstation",
      userPrompt: true,
      packages: [
        {
          name: "ghostty",
          displayName: "Ghostty",
          brew: "brew install --cask ghostty",
          pacman: "sudo pacman -S --noconfirm ghostty",
          curl: "/bin/bash -c \"$(curl --connect-timeout 15 --max-time 120 -fsSL https://raw.githubusercontent.com/mkasberg/ghostty-ubuntu/HEAD/install.sh)\"",
        },
      ],
      verifyCommand: "ghostty --version",
    },
    {
      id: 37,
      name: "tmux",
      displayName: "tmux",
      description: "Terminal multiplexer (verify only — installed by core)",
      tier: "recommended",
      category: "workstation",
      packages: [
        {
          name: "tmux",
          displayName: "tmux",
        },
      ],
      verifyCommand: "tmux -V",
    },
    {
      id: 39,
      name: "chezmoi",
      displayName: "chezmoi",
      description: "Dotfile manager with templating and encryption",
      tier: "recommended",
      category: "workstation",
      userPrompt: true,
      packages: [
        {
          name: "chezmoi",
          displayName: "chezmoi",
          brew: "brew install chezmoi",
          curl: "BINDIR=\"$HOME/.local/bin\" sh -c \"$(curl --connect-timeout 15 --max-time 120 -sfL get.chezmoi.io)\" -- -b \"$HOME/.local/bin\"",
        },
      ],
      verifyCommand: "chezmoi --version",
    },
    {
      id: 41,
      name: "age",
      displayName: "age",
      description: "Simple, modern file encryption tool",
      tier: "recommended",
      category: "workstation",
      userPrompt: true,
      packages: [
        {
          name: "age",
          displayName: "age",
          brew: "brew install age",
          apt: "sudo apt install -y age",
          pacman: "sudo pacman -S --noconfirm age",
          dnf: "sudo dnf install -y age",
        },
      ],
      verifyCommand: "age --version",
    },
  ],
};

function ghosttySpec(skipped: Set<number>): ComponentSpec {
  return {
    id: 36,
    name: "ghostty",
    displayName: "Ghostty",
    description: "Fast, feature-rich GPU-accelerated terminal emulator",
    tier: "recommended",
    category: "workstation",
    userPrompt: true,
    probe: async () => ({ present: commandExists("ghostty") }),
    plan: () => ({ kind: "install", steps: [] }),
    install: async (env, _plan, dryRun) => {
      try {
        if (skipped.has(36)) {
          return {
            component: "Ghostty",
            status: "skipped",
            message: "Ghostty installation skipped by user choice",
            verifyPassed: false,
          };
        }
        if (commandExists("ghostty")) {
          log.info("Ghostty already installed, skipping");
          return {
            component: "Ghostty",
            status: "already-installed",
            message: "Ghostty is already installed",
            verifyPassed: true,
          };
        }
        if (dryRun) {
          const cmd = env.packageManager === "brew"
            ? "brew install --cask ghostty"
            : env.packageManager === "pacman"
            ? "sudo pacman -S --noconfirm ghostty"
            : "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/mkasberg/ghostty-ubuntu/HEAD/install.sh)\"";
          log.info(`[dry-run] Would run: ${cmd}`);
          return {
            component: "Ghostty",
            status: "skipped",
            message: `[dry-run] Would install Ghostty via: ${cmd}`,
            verifyPassed: false,
          };
        }
        if (env.packageManager === "brew") {
          await $`sh -c "brew install --cask ghostty"`;
          const installed = commandExists("ghostty");
          return {
            component: "Ghostty",
            status: installed ? "installed" : "failed",
            message: installed ? "Ghostty installed successfully" : "Ghostty install ran but binary not found",
            verifyPassed: installed,
          };
        }
        if (env.packageManager === "pacman") {
          await $`sh -c "sudo pacman -S --noconfirm ghostty"`;
          const installed = commandExists("ghostty");
          return {
            component: "Ghostty",
            status: installed ? "installed" : "failed",
            message: installed ? "Ghostty installed successfully" : "Ghostty install ran but binary not found",
            verifyPassed: installed,
          };
        }
        log.info("Installing Ghostty via community Ubuntu installer (will prompt for sudo)...");
        const scriptPath = `/tmp/ghostty-install-${Date.now()}.sh`;
        const scriptUrl = "https://raw.githubusercontent.com/mkasberg/ghostty-ubuntu/HEAD/install.sh";
        const fetched = await $`curl --connect-timeout 15 --max-time 120 -fsSL ${scriptUrl} -o ${scriptPath}`.nothrow();
        let installed = false;
        let ranExitCode: number | undefined;
        if (fetched.exitCode === 0) {
          const ran = await $`bash ${scriptPath}`.nothrow();
          ranExitCode = ran.exitCode;
          await $`rm -f ${scriptPath}`.nothrow();
          installed = commandExists("ghostty");
        } else {
          log.warn(`Could not download Ghostty installer (curl exit ${fetched.exitCode})`);
        }

        if (installed) {
          return {
            component: "Ghostty",
            status: "installed",
            message: "Ghostty installed successfully via Ubuntu installer",
            verifyPassed: true,
          };
        }
        if (fetched.exitCode !== 0) {
          return {
            component: "Ghostty",
            status: "failed",
            message: `Failed to download installer from ${scriptUrl} (curl exit ${fetched.exitCode})`,
            verifyPassed: false,
          };
        }
        log.warn(`Ghostty installer exited with code ${ranExitCode}, manual installation required`);
        return {
          component: "Ghostty",
          status: "skipped",
          message: `Ghostty installer failed (exit ${ranExitCode}) — your distro may be unsupported; see https://ghostty.org/download`,
          verifyPassed: false,
        };
      } catch (err) {
        return {
          component: "Ghostty",
          status: "failed",
          message: `Ghostty install failed: ${err instanceof Error ? err.message : String(err)}`,
          verifyPassed: false,
        };
      }
    },
    verify: async () => commandExists("ghostty"),
  };
}

const tmuxSpec: ComponentSpec = {
  id: 37,
  name: "tmux",
  displayName: "tmux",
  description: "Terminal multiplexer (verify only — installed by core)",
  tier: "recommended",
  category: "workstation",
  probe: async () => ({ present: commandExists("tmux") }),
  plan: () => ({ kind: "install", steps: [] }),
  install: async () => {
    try {
      const installed = commandExists("tmux");
      if (installed) {
        let version = "unknown";
        try {
          const out = await $`tmux -V`.text();
          version = out.trim();
        } catch { /* ignore */ }
        return {
          component: "tmux",
          status: "already-installed",
          message: `tmux is already installed (${version})`,
          verifyPassed: true,
        };
      }
      log.warn("tmux not found — should have been installed by core layer");
      return {
        component: "tmux",
        status: "skipped",
        message: "tmux not found — install via your package manager (core responsibility)",
        verifyPassed: false,
      };
    } catch (err) {
      return {
        component: "tmux",
        status: "failed",
        message: `tmux verify failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      };
    }
  },
  verify: async () => commandExists("tmux"),
};

function chezmoiSpec(skipped: Set<number>): ComponentSpec {
  return {
    id: 39,
    name: "chezmoi",
    displayName: "chezmoi",
    description: "Dotfile manager with templating and encryption",
    tier: "recommended",
    category: "workstation",
    userPrompt: true,
    probe: async () => ({ present: commandExists("chezmoi") }),
    plan: () => ({ kind: "install", steps: [] }),
    install: async (env, _plan, dryRun) => {
      try {
        if (skipped.has(39)) {
          return {
            component: "chezmoi",
            status: "skipped",
            message: "chezmoi installation skipped by user choice",
            verifyPassed: false,
          };
        }
        const pkg = workstationCategory.components[2].packages[0];
        return await installBinary(pkg, env, dryRun);
      } catch (err) {
        return {
          component: "chezmoi",
          status: "failed",
          message: `chezmoi install failed: ${err instanceof Error ? err.message : String(err)}`,
          verifyPassed: false,
        };
      }
    },
    verify: async () => commandExists("chezmoi"),
  };
}

function ageSpec(skipped: Set<number>): ComponentSpec {
  return {
    id: 41,
    name: "age",
    displayName: "age",
    description: "Simple, modern file encryption tool",
    tier: "recommended",
    category: "workstation",
    userPrompt: true,
    probe: async () => ({ present: commandExists("age") }),
    plan: () => ({ kind: "install", steps: [] }),
    install: async (env, _plan, dryRun) => {
      try {
        if (skipped.has(41)) {
          return {
            component: "age",
            status: "skipped",
            message: "age installation skipped by user choice",
            verifyPassed: false,
          };
        }
        if (commandExists("age")) {
          return {
            component: "age",
            status: "already-installed",
            message: "age is already installed",
            verifyPassed: true,
          };
        }
        if (dryRun) {
          log.info("[dry-run] Would install age from GitHub releases");
          return {
            component: "age",
            status: "skipped",
            message: "[dry-run] Would install age",
            verifyPassed: false,
          };
        }
        const agePkg = workstationCategory.components[3].packages[0];
        if (env.packageManager === "apt" || env.packageManager === "pacman" || env.packageManager === "dnf" || env.packageManager === "brew") {
          return await installBinary(agePkg, env, dryRun);
        }
        const arch = env.arch === "arm64" ? "arm64" : "amd64";
        const cmd =
          `set -e; ` +
          `LATEST=$(curl --connect-timeout 15 --max-time 30 -sS https://api.github.com/repos/FiloSottile/age/releases/latest | grep tag_name | head -1 | sed 's/.*"\\(v[^"]*\\)".*/\\1/'); ` +
          `URL="https://github.com/FiloSottile/age/releases/download/$LATEST/age-${'$'}{LATEST}-linux-${arch}.tar.gz"; ` +
          `mkdir -p "$HOME/.local/bin"; ` +
          `TMP=$(mktemp -d); ` +
          `curl --connect-timeout 15 --max-time 300 -sSL "$URL" | tar -xz -C "$TMP"; ` +
          `mv "$TMP/age/age" "$HOME/.local/bin/age"; ` +
          `mv "$TMP/age/age-keygen" "$HOME/.local/bin/age-keygen"; ` +
          `chmod +x "$HOME/.local/bin/age" "$HOME/.local/bin/age-keygen"; ` +
          `rm -rf "$TMP"`;
        await $`sh -c ${cmd}`.nothrow();
        const installed = commandExists("age");
        return {
          component: "age",
          status: installed ? "installed" : "failed",
          message: installed ? "age installed successfully" : "age install ran but binary not found",
          verifyPassed: installed,
        };
      } catch (err) {
        return {
          component: "age",
          status: "failed",
          message: `age install failed: ${err instanceof Error ? err.message : String(err)}`,
          verifyPassed: false,
        };
      }
    },
    verify: async () => commandExists("age"),
  };
}

export function buildWorkstationSpecs(skipped: Set<number> = new Set()): ComponentSpec[] {
  return [ghosttySpec(skipped), tmuxSpec, chezmoiSpec(skipped), ageSpec(skipped)];
}

export async function install(
  env: DetectedEnvironment,
  dryRun: boolean,
  skippedComponents: Set<number> = new Set(),
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const spec of buildWorkstationSpecs(skippedComponents)) {
    results.push(await runComponent(spec, env, dryRun));
  }
  return results;
}
