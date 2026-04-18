// OS detection
export type OS = 'macos' | 'linux';
export type Shell = 'zsh' | 'bash' | 'fish';
export type PackageManager = 'brew' | 'apt' | 'pacman' | 'dnf';
export type LinuxDistro = 'ubuntu' | 'debian' | 'fedora' | 'arch' | 'other';

// Environment
export interface DetectedEnvironment {
  os: OS;
  arch: 'arm64' | 'x64';
  shell: Shell;
  shellRcPath: string;           // e.g., ~/.zshrc
  packageManager: PackageManager;
  linuxDistro?: LinuxDistro;
  homeDir: string;
  claudeDir: string;             // ~/.claude
  existingTools: Map<string, string>;  // tool name -> version
  nodeVersion?: string;
  bunVersion?: string;
  claudeCodeVersion?: string;
  dockerAvailable: boolean;
}

// Install packages
export interface InstallPackage {
  name: string;        // binary name to check
  displayName: string; // human-readable name
  brew?: string;
  apt?: string;
  pacman?: string;
  dnf?: string;
  npm?: string;
  cargo?: string;
  pip?: string;
  curl?: string;       // full curl command
  manual?: string;     // manual install instructions
}

// Install results
export type InstallStatus = 'installed' | 'skipped' | 'failed' | 'already-installed';

export interface InstallResult {
  component: string;
  status: InstallStatus;
  message: string;
  verifyPassed: boolean;
}

// Component definition
export type Tier = 'core' | 'recommended' | 'optional';

export interface Component {
  id: number;
  name: string;
  displayName: string;
  description: string;      // shown to user during interactive prompts
  tier: Tier;
  category: string;
  packages: InstallPackage[];
  mcpConfig?: MCPServerConfig;
  configFiles?: ConfigDeployment[];
  shellRcLines?: string[];  // lines to add to shell rc
  envVars?: Record<string, string>;
  verifyCommand: string;    // shell command that returns 0 if installed correctly
  warningNote?: string;     // e.g., "Crawl4AI v0.8.5 supply chain issue"
  requiresDocker?: boolean;
  userPrompt?: boolean;     // true = prompt user individually (for optional tools within recommended categories)
}

// Categories
export interface ComponentCategory {
  id: string;
  name: string;
  tier: Tier;
  description: string;
  defaultEnabled: boolean;   // true for recommended, false for optional
  components: Component[];
}

// MCP
export interface MCPServerConfig {
  name: string;
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export type McpSpec =
  | { transport: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { transport: 'http' | 'sse'; url: string; headers?: Record<string, string> };

// Config deployment
export interface ConfigDeployment {
  sourcePath: string;   // relative to configs/ dir
  targetPath: string;   // absolute target (e.g., ~/.claude/settings.json)
  strategy: 'copy' | 'symlink' | 'merge' | 'create-only';
  backupFirst: boolean;
}

// Backup
export interface BackupEntry {
  originalPath: string;
  backupPath: string;
  timestamp: string;
}

export interface BackupManifest {
  timestamp: string;
  entries: BackupEntry[];
}

// Verification
export interface VerificationResult {
  component: string;
  passed: boolean;
  message: string;
  details?: string;
}

export interface VerificationReport {
  totalChecked: number;
  passed: number;
  failed: number;
  skipped: number;
  results: VerificationResult[];
}
