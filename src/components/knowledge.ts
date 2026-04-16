import { $ } from "bun";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, fileExists, log } from "../utils.js";

const APPIMAGE_PATH = (env: DetectedEnvironment) => join(env.homeDir, ".local", "bin", "Obsidian.AppImage");
const SYMLINK_PATH = (env: DetectedEnvironment) => join(env.homeDir, ".local", "bin", "obsidian");

export const knowledgeCategory: ComponentCategory = {
  id: "knowledge",
  name: "Knowledge",
  tier: "optional",
  description: "Personal knowledge management — Obsidian + claude-obsidian wiki integration",
  defaultEnabled: false,
  components: [
    {
      id: 32,
      name: "obsidian",
      displayName: "Obsidian",
      description: "Markdown-based knowledge management app (AppImage on Linux, brew cask on macOS)",
      tier: "optional",
      category: "knowledge",
      packages: [
        {
          name: "obsidian",
          displayName: "Obsidian",
          brew: "brew install --cask obsidian",
        },
      ],
      verifyCommand: "test -x $HOME/.local/bin/Obsidian.AppImage || command -v obsidian",
    },
    {
      id: 33,
      name: "claude-obsidian",
      displayName: "claude-obsidian",
      description: "Claude Code integration for Obsidian vaults",
      tier: "optional",
      category: "knowledge",
      packages: [
        {
          name: "claude-obsidian",
          displayName: "claude-obsidian",
          npm: "npm install -g claude-obsidian",
        },
      ],
      verifyCommand: "claude-obsidian --version",
    },
  ],
};

/**
 * Linux Obsidian install: pull the AppImage from obsidianmd/obsidian-releases,
 * drop it in ~/.local/bin/Obsidian.AppImage, chmod +x, and symlink ~/.local/bin/obsidian
 * so `commandExists("obsidian")` returns true.
 *
 * Source: https://obsidian.md/download (AppImage is the first-listed Linux option).
 */
async function installObsidianAppImage(env: DetectedEnvironment): Promise<{ ok: boolean; message: string }> {
  const arch = env.arch === "arm64" ? "arm64" : "amd64";
  const apiOut = await $`curl -fsSL https://api.github.com/repos/obsidianmd/obsidian-releases/releases/latest`.text().catch(() => "");
  let url: string | undefined;
  let version = "unknown";
  try {
    const release = JSON.parse(apiOut) as { tag_name?: string; assets?: Array<{ name: string; browser_download_url: string }> };
    version = release.tag_name ?? "unknown";
    const asset = release.assets?.find((a) => {
      if (!a.name.endsWith(".AppImage")) return false;
      // amd64 AppImage has no arch suffix; arm64 has "-arm64"
      return arch === "arm64" ? a.name.includes("arm64") : !a.name.includes("arm64");
    });
    url = asset?.browser_download_url;
  } catch {
    /* fall through */
  }

  if (!url) {
    return { ok: false, message: `Could not resolve Obsidian AppImage for ${arch} from GitHub releases API` };
  }

  const target = APPIMAGE_PATH(env);
  const binDir = join(env.homeDir, ".local", "bin");
  await fs.mkdir(binDir, { recursive: true });
  const dl = await $`curl -fsSL ${url} -o ${target}`.nothrow();
  if (dl.exitCode !== 0) {
    return { ok: false, message: `Download failed (curl exit ${dl.exitCode}) from ${url}` };
  }
  await $`chmod +x ${target}`.nothrow();

  // Wrapper script so `obsidian` works as a command. --no-sandbox is needed because
  // modern Ubuntu kernels (with kernel.apparmor_restrict_unprivileged_userns=1) block
  // Electron's setuid sandbox unless chrome-sandbox is installed setuid root.
  // The alternative (sudo sysctl) requires admin; --no-sandbox is the no-sudo path.
  const wrapper = SYMLINK_PATH(env);
  await fs.rm(wrapper, { force: true });
  await Bun.write(wrapper, `#!/bin/sh\nexec "${target}" --no-sandbox "$@"\n`);
  await $`chmod +x ${wrapper}`.nothrow();

  // Desktop entry for app-menu integration
  const desktopDir = join(env.homeDir, ".local", "share", "applications");
  await fs.mkdir(desktopDir, { recursive: true });
  const desktopFile = join(desktopDir, "obsidian.desktop");
  await Bun.write(
    desktopFile,
    [
      "[Desktop Entry]",
      "Name=Obsidian",
      "GenericName=Knowledge Base",
      `Exec=${target} --no-sandbox %U`,
      "Terminal=false",
      "Type=Application",
      "Icon=obsidian",
      "Categories=Office;TextEditor;Utility;",
      "MimeType=x-scheme-handler/obsidian;",
      "StartupWMClass=obsidian",
      "Comment=A knowledge base that works on local Markdown files",
      "",
    ].join("\n"),
  );

  return { ok: true, message: `Obsidian ${version} installed to ${target} (\`obsidian\` command + app-menu entry created)` };
}

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  // --- Obsidian ---
  try {
    const appImagePath = APPIMAGE_PATH(env);
    const alreadyInstalled = commandExists("obsidian") || (await fileExists(appImagePath));

    if (alreadyInstalled) {
      log.info("Obsidian already installed, skipping");
      results.push({
        component: "Obsidian",
        status: "already-installed",
        message: "Obsidian is already installed",
        verifyPassed: true,
      });
    } else if (dryRun) {
      const dryMsg =
        env.os === "macos"
          ? "brew install --cask obsidian"
          : `download AppImage from obsidianmd/obsidian-releases → ${appImagePath}`;
      log.info(`[dry-run] Would install Obsidian: ${dryMsg}`);
      results.push({
        component: "Obsidian",
        status: "skipped",
        message: `[dry-run] Would install Obsidian: ${dryMsg}`,
        verifyPassed: false,
      });
    } else if (env.os === "macos" && commandExists("brew")) {
      await $`brew install --cask obsidian`.nothrow();
      const installed = commandExists("obsidian");
      results.push({
        component: "Obsidian",
        status: installed ? "installed" : "failed",
        message: installed ? "Obsidian installed via brew" : "brew install ran but obsidian binary not found",
        verifyPassed: installed,
      });
    } else {
      log.info("Installing Obsidian via AppImage (no sudo)...");
      const result = await installObsidianAppImage(env);
      results.push({
        component: "Obsidian",
        status: result.ok ? "installed" : "failed",
        message: result.message,
        verifyPassed: result.ok,
      });
    }
  } catch (err) {
    results.push({
      component: "Obsidian",
      status: "failed",
      message: `Obsidian install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  // --- claude-obsidian ---
  try {
    if (commandExists("claude-obsidian")) {
      log.info("claude-obsidian already installed, skipping");
      results.push({
        component: "claude-obsidian",
        status: "already-installed",
        message: "claude-obsidian is already installed",
        verifyPassed: true,
      });
    } else if (dryRun) {
      log.info("[dry-run] Would run: npm install -g claude-obsidian");
      results.push({
        component: "claude-obsidian",
        status: "skipped",
        message: "[dry-run] Would install claude-obsidian",
        verifyPassed: false,
      });
    } else {
      await $`sh -c "npm install -g claude-obsidian"`.nothrow();
      const installed = commandExists("claude-obsidian");
      results.push({
        component: "claude-obsidian",
        status: installed ? "installed" : "failed",
        message: installed ? "claude-obsidian installed successfully" : "claude-obsidian install ran but binary not found",
        verifyPassed: installed,
      });
    }
  } catch (err) {
    results.push({
      component: "claude-obsidian",
      status: "failed",
      message: `claude-obsidian install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  return results;
}
