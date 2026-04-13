export type OS = "macos" | "linux" | "wsl";
export type Shell = "zsh" | "bash" | "fish";
export type PackageManager = "brew" | "apt" | "pacman" | "dnf" | "zypper" | "nix";
export interface DetectedEnvironment {
    os: OS;
    shell: Shell;
    packageManager: PackageManager | null;
    installedTools: Map<string, string>;
    homeDir: string;
    claudeDir: string;
    configDir: string;
}
export interface BackupManifest {
    timestamp: string;
    backupDir: string;
    files: Array<{
        original: string;
        backup: string;
    }>;
}
export interface InstallResult {
    component: string;
    success: boolean;
    message: string;
    skipped?: boolean;
}
export interface ComponentDef {
    name: string;
    description: string;
    install: (env: DetectedEnvironment) => Promise<InstallResult>;
    verify: (env: DetectedEnvironment) => Promise<boolean>;
}
export interface ComponentCategory {
    id: string;
    name: string;
    description: string;
    recommended: boolean;
    components: ComponentDef[];
}
export interface InstallPackage {
    name: string;
    brew?: string;
    apt?: string;
    pacman?: string;
    dnf?: string;
    npm?: string;
    cargo?: string;
    pip?: string;
    curl?: string;
}
