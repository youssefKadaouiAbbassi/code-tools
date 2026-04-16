/**
 * Authentication file mount configuration for Claude Code containers
 *
 * Based on investigation of host ~/.claude/ directory and behavioral tests,
 * this defines the minimal file set needed for Claude Code authentication in containers.
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

export interface AuthMount {
  /** Host path to the authentication file */
  hostPath: string;
  /** Container path where the file should be mounted */
  containerPath: string;
  /** Whether this file is required for authentication to work */
  required: boolean;
  /** Description of what this file contains */
  description: string;
}

/**
 * Get the Claude home directory path
 */
export function getClaudeHome(): string {
  return join(homedir(), ".claude");
}

/**
 * Core authentication files needed for Claude Code to work in containers
 *
 * Key findings from investigation:
 * 1. Claude looks for ~/.claude.json (main config) - REQUIRED
 * 2. Claude looks for ~/.claude/.credentials.json (OAuth tokens) - REQUIRED
 * 3. settings.json contains UI preferences and permissions but not auth
 * 4. Other files in ~/.claude/ are for features like history, cache, plugins
 *
 * Minimal working authentication requires just 2 files:
 * - ~/.claude.json (main configuration)
 * - ~/.claude/.credentials.json (OAuth credentials)
 */
export function getAuthMounts(containerUser: string = "tester"): AuthMount[] {
  const claudeHome = getClaudeHome();
  const containerHome = `/home/${containerUser}`;

  return [
    {
      hostPath: join(homedir(), ".claude.json"),
      containerPath: join(containerHome, ".claude.json"),
      required: true,
      description: "Main Claude configuration file - contains user settings and preferences"
    },
    {
      hostPath: join(claudeHome, ".credentials.json"),
      containerPath: join(containerHome, ".claude", ".credentials.json"),
      required: true,
      description: "OAuth credentials - access tokens, refresh tokens, and subscription info"
    },
    {
      hostPath: join(claudeHome, "settings.json"),
      containerPath: join(containerHome, ".claude", "settings.json"),
      required: false,
      description: "UI settings and security permissions - needed for behavioral tests but not basic auth"
    }
  ];
}

/**
 * Validate that required authentication files exist on the host
 */
export function validateAuthFiles(): { valid: boolean; missing: string[]; warnings: string[] } {
  const mounts = getAuthMounts();
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const mount of mounts) {
    if (!existsSync(mount.hostPath)) {
      if (mount.required) {
        missing.push(mount.hostPath);
      } else {
        warnings.push(`Optional file missing: ${mount.hostPath}`);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings
  };
}

/**
 * Generate Docker volume mount arguments for authentication
 */
export function getDockerMountArgs(containerUser: string = "tester"): string[] {
  const mounts = getAuthMounts(containerUser);
  const args: string[] = [];

  for (const mount of mounts) {
    if (existsSync(mount.hostPath)) {
      args.push("-v", `${mount.hostPath}:${mount.containerPath}:ro`);
    } else if (mount.required) {
      throw new Error(`Required authentication file missing: ${mount.hostPath}`);
    }
  }

  return args;
}

/**
 * Generate testcontainers bind mount configuration for authentication
 */
export function getTestContainerMounts(containerUser: string = "tester"): Array<{source: string, target: string, readOnly: boolean}> {
  const mounts = getAuthMounts(containerUser);
  const bindMounts: Array<{source: string, target: string, readOnly: boolean}> = [];

  for (const mount of mounts) {
    if (existsSync(mount.hostPath)) {
      bindMounts.push({
        source: mount.hostPath,
        target: mount.containerPath,
        readOnly: true
      });
    } else if (mount.required) {
      throw new Error(`Required authentication file missing: ${mount.hostPath}`);
    }
  }

  return bindMounts;
}