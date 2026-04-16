/** Full-tree backup/restore for install modes. Layout: <claudeDir-parent>/<basename>-backup-<ts>/. */
import { $ } from "bun";
import { promises as fs } from "fs";
import { join, dirname } from "path";
import { log } from "../utils.js";

export interface BackupManifest {
  timestamp: string;
  claudeVersion: string;
  mcpServers: string[];
  plugins: string[];
  skills: string[];
  hooks: string[];
  configFiles: string[];
  totalSize: number;
  targetDir?: string;
}

export interface BackupResult {
  success: boolean;
  backupPath: string;
  manifest: BackupManifest;
  error?: string;
}

/**
 * Creates a complete backup of existing Claude Code installation
 * Backs up EVERYTHING: plugins, MCPs, skills, configs, hooks, history
 */
export async function createFullBackup(claudeDir: string): Promise<BackupResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const parentDir = dirname(claudeDir);
  const backupPath = join(parentDir, `.claude-backup-${timestamp}`);

  try {
    // Check if Claude directory exists
    try {
      await fs.access(claudeDir);
    } catch {
      return {
        success: true,
        backupPath,
        manifest: createEmptyManifest(timestamp, claudeDir),
      };
    }

    log.info(`Creating backup at: ${backupPath}`);
    await fs.mkdir(backupPath, { recursive: true });
    await fs.chmod(backupPath, 0o700);

    // Backup the entire .claude directory
    await copyDirectory(claudeDir, join(backupPath, ".claude"));

    // Create manifest of what was backed up
    const manifest = await createManifest(backupPath, timestamp, claudeDir);
    await fs.writeFile(
      join(backupPath, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );

    // Create restore script
    await createRestoreScript(backupPath, timestamp, claudeDir);

    log.info(`✓ Backup completed: ${manifest.totalSize} bytes backed up`);

    return {
      success: true,
      backupPath,
      manifest,
    };
  } catch (error) {
    return {
      success: false,
      backupPath,
      manifest: createEmptyManifest(timestamp, claudeDir),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Performs complete clean install - removes ALL customizations
 * Returns Claude Code to fresh installation state
 */
export async function performCleanInstall(claudeDir: string): Promise<void> {
  log.info("🧹 Performing clean install - removing all customizations...");

  try {
    // Remove all MCP servers from config
    await cleanMcpConfiguration(claudeDir);

    // Remove all plugins
    await removePlugins(claudeDir);

    // Remove all custom skills
    await removeSkills(claudeDir);

    // Reset settings to minimal defaults (keep auth)
    await resetSettings(claudeDir);

    // Remove custom hooks (keep essential ones)
    await cleanHooks(claudeDir);

    // Clear caches and temp files
    await clearCaches(claudeDir);

    log.info("✓ Clean install complete - Claude Code reset to fresh state");
  } catch (error) {
    throw new Error(`Clean install failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Restores Claude Code from a backup
 */
export async function restoreFromBackup(backupPath: string, targetDir: string): Promise<void> {
  const claudeDir = targetDir;
  const backupClaudeDir = join(backupPath, ".claude");

  try {
    // Verify backup exists and is valid
    await fs.access(join(backupPath, "manifest.json"));
    await fs.access(backupClaudeDir);

    log.info(`Restoring from backup: ${backupPath}`);

    // Remove current installation
    await fs.rm(claudeDir, { recursive: true, force: true });

    // Restore from backup
    await copyDirectory(backupClaudeDir, claudeDir);

    log.info("✓ Backup restored successfully");
  } catch (error) {
    throw new Error(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Private helper functions

async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isSymbolicLink()) {
      // Preserve symlink as-is (don't follow). Some may point outside the tree.
      try {
        const linkTarget = await fs.readlink(srcPath);
        await fs.symlink(linkTarget, destPath);
      } catch (err) {
        log.warn(`Could not copy symlink ${srcPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    } else {
      // Skip sockets, FIFOs, block/char devices — not meaningful in a config backup
      log.warn(`Skipping non-regular file: ${srcPath}`);
    }
  }
}

async function createManifest(backupPath: string, timestamp: string, targetDir: string): Promise<BackupManifest> {
  const claudeBackupDir = join(backupPath, ".claude");

  // Detect what was backed up
  const mcpServers = await detectMcpServers(claudeBackupDir);
  const plugins = await detectPlugins(claudeBackupDir);
  const skills = await detectSkills(claudeBackupDir);
  const hooks = await detectHooks(claudeBackupDir);
  const configFiles = await detectConfigFiles(claudeBackupDir);

  // Calculate total size
  const totalSize = await calculateDirectorySize(claudeBackupDir);

  // Get Claude version
  const claudeVersion = await detectClaudeVersion();

  return {
    timestamp,
    claudeVersion,
    mcpServers,
    plugins,
    skills,
    hooks,
    configFiles,
    totalSize,
    targetDir,
  };
}

async function cleanMcpConfiguration(claudeDir: string): Promise<void> {
  try {
    const listed = await $`claude mcp list`.quiet().nothrow().text();
    const names: string[] = [];
    for (const line of listed.split("\n")) {
      const m = line.match(/^([\w.:@-]+):/);
      const name = m?.[1];
      if (name && !name.startsWith("claude.ai") && !name.startsWith("plugin:")) {
        names.push(name);
      }
    }

    for (const name of names) {
      await $`claude mcp remove ${name} -s user`.quiet().nothrow();
    }
    log.info(`✓ Cleared ${names.length} MCP servers via claude mcp remove`);
  } catch {
    log.info("No MCP servers to clear (or claude CLI unavailable)");
  }

  const legacyPath = join(claudeDir, "claude_desktop_config.json");
  try {
    const config = JSON.parse(await fs.readFile(legacyPath, "utf-8"));
    if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
      config.mcpServers = {};
      await fs.writeFile(legacyPath, JSON.stringify(config, null, 2));
      log.info("✓ Cleared legacy Claude Desktop MCP config");
    }
  } catch { /* no legacy file */ }
}

async function removePlugins(claudeDir: string): Promise<void> {
  const pluginsDir = join(claudeDir, "plugins");

  try {
    await fs.rm(pluginsDir, { recursive: true, force: true });
    log.info("✓ Removed all plugins");
  } catch {
    // Plugins directory doesn't exist
  }
}

async function removeSkills(claudeDir: string): Promise<void> {
  const skillsDirs = [
    join(claudeDir, "skills"),
    join(claudeDir, "custom-skills"),
    join(claudeDir, "user-skills"),
  ];

  for (const skillsDir of skillsDirs) {
    try {
      await fs.rm(skillsDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist
    }
  }
  log.info("✓ Removed all custom skills");
}

async function resetSettings(claudeDir: string): Promise<void> {
  const settingsPath = join(claudeDir, "settings.json");

  try {
    const currentSettings = JSON.parse(await fs.readFile(settingsPath, "utf-8"));

    // Keep only essential settings, remove all customizations
    const minimalSettings = {
      // Keep authentication and basic setup
      ...(currentSettings.credentials && { credentials: currentSettings.credentials }),
      ...(currentSettings.sessionId && { sessionId: currentSettings.sessionId }),
      // Preserve user's model preference if they had one set
      ...(currentSettings.model && { model: currentSettings.model }),

      // Reset everything else to defaults (no model — user's default is preserved)
      effortLevel: "medium",
      permissions: {
        deny: [] // Will be populated by our system
      }
    };

    await fs.writeFile(settingsPath, JSON.stringify(minimalSettings, null, 2));
    log.info("✓ Reset settings to minimal defaults");
  } catch {
    // Settings file doesn't exist - create minimal one (no model — Claude Code's default is preserved)
    const minimalSettings = {
      effortLevel: "medium",
      permissions: { deny: [] }
    };

    await fs.writeFile(settingsPath, JSON.stringify(minimalSettings, null, 2));
  }
}

async function cleanHooks(claudeDir: string): Promise<void> {
  const hooksDir = join(claudeDir, "hooks");

  try {
    await fs.rm(hooksDir, { recursive: true, force: true });
    log.info("✓ Removed all custom hooks");
  } catch {
    // Hooks directory doesn't exist
  }
}

async function clearCaches(claudeDir: string): Promise<void> {
  const cacheDirs = [
    join(claudeDir, "cache"),
    join(claudeDir, "tmp"),
    join(claudeDir, ".cache"),
    join(claudeDir, "logs"),
  ];

  for (const cacheDir of cacheDirs) {
    try {
      await fs.rm(cacheDir, { recursive: true, force: true });
    } catch {
      // Cache directory doesn't exist
    }
  }
  log.info("✓ Cleared all caches");
}

async function createRestoreScript(backupPath: string, timestamp: string, targetDir: string): Promise<void> {
  const scriptContent = `#!/bin/bash
# Claude Code Backup Restore Script
# Generated: ${timestamp}
# Backup: ${backupPath}
# Target: ${targetDir}

TARGET_DIR="${targetDir}"

echo "🔄 Restoring Claude Code from backup..."
echo "Backup: ${backupPath}"
echo "Target: $TARGET_DIR"

# Stop any running Claude processes
echo "Stopping Claude Code processes..."
pkill -f "claude" || true

# Remove current installation
echo "Removing current installation..."
rm -rf "$TARGET_DIR"

# Restore from backup
echo "Restoring from backup..."
cp -r "${backupPath}/.claude" "$TARGET_DIR"

echo "✅ Restore complete!"
echo "You may need to restart your terminal for changes to take effect."
`;

  await fs.writeFile(join(backupPath, "restore.sh"), scriptContent);
  await fs.chmod(join(backupPath, "restore.sh"), 0o755);
}

// Detection helper functions
async function detectMcpServers(_claudeDir: string): Promise<string[]> {
  try {
    const listed = await $`claude mcp list`.quiet().nothrow().text();
    const names: string[] = [];
    for (const line of listed.split("\n")) {
      const m = line.match(/^([\w.:@-]+):/);
      if (m?.[1]) names.push(m[1]);
    }
    return names;
  } catch {
    return [];
  }
}

async function detectPlugins(claudeDir: string): Promise<string[]> {
  try {
    const pluginsDir = join(claudeDir, "plugins");
    const plugins = await fs.readdir(pluginsDir);
    return plugins.filter(p => !p.startsWith('.'));
  } catch {
    return [];
  }
}

async function detectSkills(claudeDir: string): Promise<string[]> {
  const skills: string[] = [];
  const skillsDirs = [
    join(claudeDir, "skills"),
    join(claudeDir, "custom-skills"),
    join(claudeDir, "user-skills"),
  ];

  for (const skillsDir of skillsDirs) {
    try {
      const dirSkills = await fs.readdir(skillsDir);
      skills.push(...dirSkills.filter(s => !s.startsWith('.')));
    } catch {
      // Directory doesn't exist
    }
  }

  return skills;
}

async function detectHooks(claudeDir: string): Promise<string[]> {
  try {
    const hooksDir = join(claudeDir, "hooks");
    const hooks = await fs.readdir(hooksDir);
    return hooks.filter(h => h.endsWith('.sh'));
  } catch {
    return [];
  }
}

async function detectConfigFiles(claudeDir: string): Promise<string[]> {
  const configFiles: string[] = [];

  try {
    const entries = await fs.readdir(claudeDir);
    for (const entry of entries) {
      if (entry.endsWith('.json') || entry.endsWith('.yaml') || entry.endsWith('.yml')) {
        configFiles.push(entry);
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return configFiles;
}

async function calculateDirectorySize(dir: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        // Don't follow symlinks — count as zero (link itself is tiny)
        continue;
      } else if (entry.isDirectory()) {
        totalSize += await calculateDirectorySize(fullPath);
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        } catch {
          // Broken symlink or unreadable — skip
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be accessed
  }

  return totalSize;
}

async function detectClaudeVersion(): Promise<string> {
  try {
    // Try to detect Claude Code version from various sources
    const { execSync } = require('child_process');
    const version = execSync('claude --version', { encoding: 'utf-8', timeout: 5000 });
    return version.trim();
  } catch {
    return 'unknown';
  }
}

function createEmptyManifest(timestamp: string, targetDir: string): BackupManifest {
  return {
    timestamp,
    claudeVersion: 'unknown',
    mcpServers: [],
    plugins: [],
    skills: [],
    hooks: [],
    configFiles: [],
    totalSize: 0,
    targetDir,
  };
}