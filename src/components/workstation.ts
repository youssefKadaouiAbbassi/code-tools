import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, installBinary, log } from "../utils.js";

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
          curl: "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/mkasberg/ghostty-ubuntu/HEAD/install.sh)\"",
        },
      ],
      verifyCommand: "ghostty --version",
    },
    {
      id: 37,
      name: "tmux",
      displayName: "tmux",
      description: "Terminal multiplexer (verify only — installed by primordial)",
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
          curl: "BINDIR=\"$HOME/.local/bin\" sh -c \"$(curl -sfL get.chezmoi.io)\" -- -b \"$HOME/.local/bin\"",
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

export async function install(
  env: DetectedEnvironment,
  dryRun: boolean,
  skippedComponents: Set<number> = new Set()
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  // --- Ghostty ---
  try {
    if (skippedComponents.has(36)) {
      results.push({
        component: "Ghostty",
        status: "skipped",
        message: "Ghostty installation skipped by user choice",
        verifyPassed: false,
      });
    } else if (commandExists("ghostty")) {
      log.info("Ghostty already installed, skipping");
      results.push({
        component: "Ghostty",
        status: "already-installed",
        message: "Ghostty is already installed",
        verifyPassed: true,
      });
    } else if (dryRun) {
      const cmd = env.packageManager === "brew"
        ? "brew install --cask ghostty"
        : env.packageManager === "pacman"
        ? "sudo pacman -S --noconfirm ghostty"
        : "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/mkasberg/ghostty-ubuntu/HEAD/install.sh)\"";
      log.info(`[dry-run] Would run: ${cmd}`);
      results.push({
        component: "Ghostty",
        status: "skipped",
        message: `[dry-run] Would install Ghostty via: ${cmd}`,
        verifyPassed: false,
      });
    } else if (env.packageManager === "brew") {
      await $`sh -c "brew install --cask ghostty"`;
      const installed = commandExists("ghostty");
      results.push({
        component: "Ghostty",
        status: installed ? "installed" : "failed",
        message: installed ? "Ghostty installed successfully" : "Ghostty install ran but binary not found",
        verifyPassed: installed,
      });
    } else if (env.packageManager === "pacman") {
      await $`sh -c "sudo pacman -S --noconfirm ghostty"`;
      const installed = commandExists("ghostty");
      results.push({
        component: "Ghostty",
        status: installed ? "installed" : "failed",
        message: installed ? "Ghostty installed successfully" : "Ghostty install ran but binary not found",
        verifyPassed: installed,
      });
    } else {
      // Community Ubuntu installer for Debian/Ubuntu-like distros.
      // Download to a temp file and run with bash to avoid quoting/escaping pitfalls
      // that occur when piping curl through sh -c with nested quotes.
      log.info("Installing Ghostty via community Ubuntu installer (will prompt for sudo)...");
      const scriptPath = `/tmp/ghostty-install-${Date.now()}.sh`;
      const scriptUrl = "https://raw.githubusercontent.com/mkasberg/ghostty-ubuntu/HEAD/install.sh";
      const fetched = await $`curl -fsSL ${scriptUrl} -o ${scriptPath}`.nothrow();
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
        results.push({
          component: "Ghostty",
          status: "installed",
          message: "Ghostty installed successfully via Ubuntu installer",
          verifyPassed: true,
        });
      } else if (fetched.exitCode !== 0) {
        results.push({
          component: "Ghostty",
          status: "failed",
          message: `Failed to download installer from ${scriptUrl} (curl exit ${fetched.exitCode})`,
          verifyPassed: false,
        });
      } else {
        log.warn(`Ghostty installer exited with code ${ranExitCode}, manual installation required`);
        results.push({
          component: "Ghostty",
          status: "skipped",
          message: `Ghostty installer failed (exit ${ranExitCode}) — your distro may be unsupported; see https://ghostty.org/download`,
          verifyPassed: false,
        });
      }
    }
  } catch (err) {
    results.push({
      component: "Ghostty",
      status: "failed",
      message: `Ghostty install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- tmux (VERIFY ONLY — installed by primordial) ---
  try {
    const installed = commandExists("tmux");
    if (installed) {
      let version = "unknown";
      try {
        const out = await $`tmux -V`.text();
        version = out.trim();
      } catch {
        // ignore
      }
      results.push({
        component: "tmux",
        status: "already-installed",
        message: `tmux is already installed (${version})`,
        verifyPassed: true,
      });
    } else {
      log.warn("tmux not found — should have been installed by primordial layer");
      results.push({
        component: "tmux",
        status: "skipped",
        message: "tmux not found — install via your package manager (primordial responsibility)",
        verifyPassed: false,
      });
    }
  } catch (err) {
    results.push({
      component: "tmux",
      status: "failed",
      message: `tmux verify failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- chezmoi ---
  try {
    if (skippedComponents.has(39)) {
      results.push({
        component: "chezmoi",
        status: "skipped",
        message: "chezmoi installation skipped by user choice",
        verifyPassed: false,
      });
    } else {
      const pkg = workstationCategory.components[2].packages[0];
      const result = await installBinary(pkg, env, dryRun);
      results.push(result);
    }
  } catch (err) {
    results.push({
      component: "chezmoi",
      status: "failed",
      message: `chezmoi install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- age (sudo-free binary install on Linux; brew on macOS) ---
  try {
    if (skippedComponents.has(41)) {
      results.push({
        component: "age",
        status: "skipped",
        message: "age installation skipped by user choice",
        verifyPassed: false,
      });
    } else if (commandExists("age")) {
      results.push({
        component: "age",
        status: "already-installed",
        message: "age is already installed",
        verifyPassed: true,
      });
    } else if (dryRun) {
      log.info("[dry-run] Would install age from GitHub releases");
      results.push({
        component: "age",
        status: "skipped",
        message: "[dry-run] Would install age",
        verifyPassed: false,
      });
    } else if (env.packageManager === "brew") {
      await $`sh -c "brew install age"`;
      const installed = commandExists("age");
      results.push({
        component: "age",
        status: installed ? "installed" : "failed",
        message: installed ? "age installed successfully" : "age install ran but binary not found",
        verifyPassed: installed,
      });
    } else {
      // Linux: download binary, no sudo needed
      const arch = env.arch === "arm64" ? "arm64" : "amd64";
      const cmd =
        `set -e; ` +
        `LATEST=$(curl -sS https://api.github.com/repos/FiloSottile/age/releases/latest | grep tag_name | head -1 | sed 's/.*"\\(v[^"]*\\)".*/\\1/'); ` +
        `URL="https://github.com/FiloSottile/age/releases/download/$LATEST/age-${'$'}{LATEST}-linux-${arch}.tar.gz"; ` +
        `mkdir -p "$HOME/.local/bin"; ` +
        `TMP=$(mktemp -d); ` +
        `curl -sSL "$URL" | tar -xz -C "$TMP"; ` +
        `mv "$TMP/age/age" "$HOME/.local/bin/age"; ` +
        `mv "$TMP/age/age-keygen" "$HOME/.local/bin/age-keygen"; ` +
        `chmod +x "$HOME/.local/bin/age" "$HOME/.local/bin/age-keygen"; ` +
        `rm -rf "$TMP"`;
      await $`sh -c ${cmd}`.nothrow();
      const installed = commandExists("age");
      results.push({
        component: "age",
        status: installed ? "installed" : "failed",
        message: installed ? "age installed successfully" : "age install ran but binary not found",
        verifyPassed: installed,
      });
    }
  } catch (err) {
    results.push({
      component: "age",
      status: "failed",
      message: `age install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  return results;
}
