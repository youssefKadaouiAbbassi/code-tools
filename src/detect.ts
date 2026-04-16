import { $ } from "bun";
import type { DetectedEnvironment, LinuxDistro, OS, PackageManager, Shell } from "./types.js";
import { getCommandVersion } from "./utils.js";

// --- OS detection ---

export function detectOS(): { os: OS; arch: "arm64" | "x64" } {
  const platform = process.platform;
  const os: OS = platform === "darwin" ? "macos" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return { os, arch };
}

// --- Shell detection ---

export function detectShell(): { shell: Shell; rcPath: string } {
  const home = process.env.HOME ?? Bun.env.HOME ?? "~";
  const shellBin = process.env.SHELL ?? "";

  if (shellBin.includes("zsh")) {
    return { shell: "zsh", rcPath: `${home}/.zshrc` };
  }
  if (shellBin.includes("fish")) {
    return { shell: "fish", rcPath: `${home}/.config/fish/config.fish` };
  }
  // Default to bash
  return { shell: "bash", rcPath: `${home}/.bashrc` };
}

// --- Package manager detection ---

export async function detectPackageManager(): Promise<PackageManager> {
  if (Bun.which("brew") !== null) return "brew";
  if (Bun.which("apt") !== null) return "apt";
  if (Bun.which("pacman") !== null) return "pacman";
  if (Bun.which("dnf") !== null) return "dnf";
  // Default fallback for linux
  return "apt";
}

// --- Linux distro detection ---

export async function detectLinuxDistro(): Promise<LinuxDistro | undefined> {
  try {
    const content = await Bun.file("/etc/os-release").text();
    const idLine = content.split("\n").find((line) => line.startsWith("ID="));
    if (!idLine) return undefined;

    const id = idLine.replace("ID=", "").replace(/"/g, "").trim().toLowerCase();

    switch (id) {
      case "ubuntu": return "ubuntu";
      case "debian": return "debian";
      case "fedora": return "fedora";
      case "arch": return "arch";
      default: return "other";
    }
  } catch {
    return undefined;
  }
}

// --- Existing tool detection ---

export async function detectExistingTools(toolNames: string[]): Promise<Map<string, string>> {
  const results = await Promise.all(
    toolNames.map(async (name) => {
      const path = Bun.which(name);
      if (path === null) return [name, null] as const;
      const version = await getCommandVersion(name);
      return [name, version ?? path] as const;
    })
  );

  const map = new Map<string, string>();
  for (const [name, version] of results) {
    if (version !== null) {
      map.set(name, version);
    }
  }
  return map;
}

// --- Claude Code detection ---

export async function detectClaudeCode(): Promise<{ installed: boolean; version?: string }> {
  const path = Bun.which("claude");
  if (path === null) return { installed: false };

  const version = await getCommandVersion("claude");
  return { installed: true, version: version ?? undefined };
}

// --- Docker detection ---

export async function detectDocker(): Promise<boolean> {
  if (Bun.which("docker") === null) return false;
  try {
    await $`docker info`.quiet();
    return true;
  } catch {
    return false;
  }
}

// --- Full environment detection ---

export async function detectEnvironment(): Promise<DetectedEnvironment> {
  const home = process.env.HOME ?? Bun.env.HOME ?? "~";
  const { os, arch } = detectOS();
  const { shell, rcPath } = detectShell();

  const [packageManager, linuxDistro, claudeCode, dockerAvailable, nodeVersionRaw, bunVersionRaw] =
    await Promise.all([
      detectPackageManager(),
      os === "linux" ? detectLinuxDistro() : Promise.resolve(undefined),
      detectClaudeCode(),
      detectDocker(),
      getCommandVersion("node"),
      getCommandVersion("bun"),
    ]);

  const existingTools = await detectExistingTools(["claude", "git", "node", "bun", "docker", "tmux", "starship", "mise", "just", "jq", "gh", "serena-agent", "sg", "playwright", "snyk", "chezmoi", "age"]);

  return {
    os,
    arch,
    shell,
    shellRcPath: rcPath,
    packageManager,
    linuxDistro,
    homeDir: home,
    claudeDir: `${home}/.claude`,
    existingTools,
    nodeVersion: nodeVersionRaw ?? undefined,
    bunVersion: bunVersionRaw ?? undefined,
    claudeCodeVersion: claudeCode.version,
    dockerAvailable,
  };
}
