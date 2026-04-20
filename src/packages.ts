import { $ } from "bun";
import type { DetectedEnvironment, InstallPackage, InstallResult } from "./types.js";
import { commandExists } from "./utils.js";

export const CORE_PLUGINS = [
  "feature-dev",
  "code-review",
  "pr-review-toolkit",
  "commit-commands",
  "claude-code-setup",
  "claude-md-management",
  "frontend-design",
  "skill-creator",
  "session-report",
  "plugin-dev",
] as const;

export const LAZYGIT_CURL =
  "set -e; " +
  "ARCH=$(uname -m | sed 's/x86_64/x86_64/;s/aarch64/arm64/'); " +
  "OS=$(uname -s | tr A-Z a-z | sed 's/darwin/Darwin/;s/linux/Linux/'); " +
  "LAZY_VER=$(curl --connect-timeout 15 --max-time 30 -sS https://api.github.com/repos/jesseduffield/lazygit/releases/latest | grep tag_name | head -1 | sed 's/.*\"v\\([^\"]*\\)\".*/\\1/'); " +
  "URL=\"https://github.com/jesseduffield/lazygit/releases/download/v${LAZY_VER}/lazygit_${LAZY_VER}_${OS}_${ARCH}.tar.gz\"; " +
  "mkdir -p \"$HOME/.local/bin\"; TMP=$(mktemp -d); " +
  "curl --connect-timeout 15 --max-time 300 -sSL \"$URL\" | tar -xz -C \"$TMP\"; " +
  "mv \"$TMP/lazygit\" \"$HOME/.local/bin/lazygit\"; chmod +x \"$HOME/.local/bin/lazygit\"; rm -rf \"$TMP\"";

export const SOPS_CURL =
  "set -e; ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/'); " +
  "OS=$(uname -s | tr A-Z a-z); " +
  "VER=$(curl --connect-timeout 15 --max-time 30 -sS https://api.github.com/repos/getsops/sops/releases/latest | grep tag_name | head -1 | sed 's/.*\"\\(v[^\"]*\\)\".*/\\1/'); " +
  "mkdir -p \"$HOME/.local/bin\"; " +
  "curl --connect-timeout 15 --max-time 300 -sSL \"https://github.com/getsops/sops/releases/download/${VER}/sops-${VER}.${OS}.${ARCH}\" -o \"$HOME/.local/bin/sops\"; " +
  "chmod +x \"$HOME/.local/bin/sops\"";

export const GITLEAKS_CURL =
  "set -e; ARCH=$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/'); " +
  "OS=$(uname -s | tr A-Z a-z); " +
  "VER=$(curl --connect-timeout 15 --max-time 30 -sS https://api.github.com/repos/gitleaks/gitleaks/releases/latest | grep tag_name | head -1 | sed 's/.*\"v\\([^\"]*\\)\".*/\\1/'); " +
  "mkdir -p \"$HOME/.local/bin\"; TMP=$(mktemp -d); " +
  "curl --connect-timeout 15 --max-time 300 -sSL \"https://github.com/gitleaks/gitleaks/releases/download/v${VER}/gitleaks_${VER}_${OS}_${ARCH}.tar.gz\" | tar -xz -C \"$TMP\"; " +
  "mv \"$TMP/gitleaks\" \"$HOME/.local/bin/gitleaks\"; chmod +x \"$HOME/.local/bin/gitleaks\"; rm -rf \"$TMP\"";

export const DEV_CLI_PACKAGES: readonly InstallPackage[] = [
  {
    name: "rg",
    displayName: "ripgrep",
    brew: "brew install ripgrep",
    apt: "sudo apt-get install -y ripgrep",
    pacman: "sudo pacman -S --noconfirm ripgrep",
    dnf: "sudo dnf install -y ripgrep",
    cargo: "cargo install ripgrep --locked",
  },
  {
    name: "fd",
    displayName: "fd",
    brew: "brew install fd",
    apt: "sudo apt-get install -y fd-find && mkdir -p \"$HOME/.local/bin\" && ln -sf \"$(command -v fdfind)\" \"$HOME/.local/bin/fd\"",
    pacman: "sudo pacman -S --noconfirm fd",
    dnf: "sudo dnf install -y fd-find",
    cargo: "cargo install fd-find --locked",
  },
  {
    name: "fzf",
    displayName: "fzf",
    brew: "brew install fzf",
    apt: "sudo apt-get install -y fzf",
    pacman: "sudo pacman -S --noconfirm fzf",
    dnf: "sudo dnf install -y fzf",
    curl: "git clone --depth 1 https://github.com/junegunn/fzf.git \"$HOME/.fzf\" && \"$HOME/.fzf/install\" --bin --no-update-rc && mkdir -p \"$HOME/.local/bin\" && ln -sf \"$HOME/.fzf/bin/fzf\" \"$HOME/.local/bin/fzf\"",
  },
  {
    name: "bat",
    displayName: "bat",
    brew: "brew install bat",
    apt: "sudo apt-get install -y bat && mkdir -p \"$HOME/.local/bin\" && ln -sf \"$(command -v batcat)\" \"$HOME/.local/bin/bat\"",
    pacman: "sudo pacman -S --noconfirm bat",
    dnf: "sudo dnf install -y bat",
    cargo: "cargo install bat --locked",
  },
  {
    name: "delta",
    displayName: "delta",
    brew: "brew install git-delta",
    pacman: "sudo pacman -S --noconfirm git-delta",
    cargo: "cargo install git-delta --locked",
  },
  {
    name: "jaq",
    displayName: "jaq",
    brew: "brew install jaq",
    pacman: "sudo pacman -S --noconfirm jaq",
    cargo: "cargo install jaq --locked",
  },
  {
    name: "zoxide",
    displayName: "zoxide",
    brew: "brew install zoxide",
    apt: "sudo apt-get install -y zoxide",
    pacman: "sudo pacman -S --noconfirm zoxide",
    dnf: "sudo dnf install -y zoxide",
    curl: "curl --connect-timeout 15 --max-time 120 -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | sh",
  },
  {
    name: "lazygit",
    displayName: "lazygit",
    brew: "brew install lazygit",
    pacman: "sudo pacman -S --noconfirm lazygit",
    dnf: "sudo dnf copr enable -y atim/lazygit && sudo dnf install -y lazygit",
    curl: LAZYGIT_CURL,
  },
  {
    name: "uv",
    displayName: "uv",
    brew: "brew install uv",
    curl: "curl --connect-timeout 15 --max-time 300 -LsSf https://astral.sh/uv/install.sh | sh",
  },
  {
    name: "bun",
    displayName: "bun",
    brew: "brew install oven-sh/bun/bun",
    curl: "curl --connect-timeout 15 --max-time 300 -fsSL https://bun.sh/install | bash",
  },
  {
    name: "sops",
    displayName: "sops",
    brew: "brew install sops",
    apt: "sudo apt-get install -y sops",
    pacman: "sudo pacman -S --noconfirm sops",
    dnf: "sudo dnf install -y sops",
    curl: SOPS_CURL,
  },
  {
    name: "gitleaks",
    displayName: "gitleaks",
    brew: "brew install gitleaks",
    pacman: "sudo pacman -S --noconfirm gitleaks",
    dnf: "sudo dnf install -y gitleaks",
    curl: GITLEAKS_CURL,
  },
];

export function toUpgradeCommand(installCmd: string, pm: string): string {
  if (pm === "brew") {
    const upgradeVariant = installCmd.replace(/\bbrew install\b/g, "brew upgrade");
    return `${upgradeVariant} 2>/dev/null || ${installCmd}`;
  }
  if (pm === "apt") {
    return installCmd
      .replace(/\bapt-get install\b/g, "apt-get install --only-upgrade")
      .replace(/\bapt install\b/g, "apt install --only-upgrade");
  }
  if (pm === "pacman") {
    return installCmd.replace(/\bpacman -S\b/g, "pacman -Syu");
  }
  if (pm === "dnf") {
    return installCmd.replace(/\bdnf install\b/g, "dnf upgrade");
  }
  return installCmd;
}

export async function installBinary(
  pkg: InstallPackage,
  env: DetectedEnvironment,
  dryRun = false
): Promise<InstallResult> {
  const name = pkg.displayName || pkg.name;
  const alreadyPresent = commandExists(pkg.name);

  let cmd: string | undefined;
  switch (env.packageManager) {
    case "brew": cmd = pkg.brew; break;
    case "apt": cmd = pkg.apt; break;
    case "pacman": cmd = pkg.pacman; break;
    case "dnf": cmd = pkg.dnf; break;
  }
  if (!cmd) cmd = pkg.npm ?? pkg.cargo ?? pkg.pip ?? pkg.curl;
  if (!cmd) cmd = pkg.manual;

  if (!cmd) {
    if (alreadyPresent) {
      return { component: name, status: "already-installed", message: `${name} present (no upgrade path for ${env.packageManager})`, verifyPassed: true };
    }
    return { component: name, status: "skipped", message: `No install method for ${name} on ${env.packageManager}`, verifyPassed: false };
  }

  if (alreadyPresent) {
    cmd = toUpgradeCommand(cmd, env.packageManager);
  }

  if (dryRun) {
    const verb = alreadyPresent ? "upgrade" : "install";
    return { component: name, status: "skipped", message: `[dry-run] Would ${verb} ${name}: ${cmd}`, verifyPassed: false };
  }

  try {
    await $`sh -c ${cmd}`;
    const installed = commandExists(pkg.name);
    return {
      component: name,
      status: installed ? "installed" : "failed",
      message: installed
        ? alreadyPresent
          ? `${name} refreshed to latest`
          : `${name} installed successfully`
        : `${name} install command ran but binary not found`,
      verifyPassed: installed,
    };
  } catch (error) {
    return {
      component: name,
      status: "failed",
      message: `Failed to install ${name}: ${error instanceof Error ? error.message : String(error)}`,
      verifyPassed: false,
    };
  }
}
