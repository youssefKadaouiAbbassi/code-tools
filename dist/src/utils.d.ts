import type { DetectedEnvironment, InstallPackage, InstallResult } from "./types.js";
export declare function exec(cmd: string, opts?: {
    cwd?: string;
    silent?: boolean;
}): {
    stdout: string;
    exitCode: number;
};
export declare function commandExists(cmd: string): boolean;
export declare function ensureDir(path: string): void;
export declare function fileExists(path: string): boolean;
export declare function copyFile(src: string, dest: string): void;
export declare function writeFile(path: string, content: string): void;
export declare function readFile(path: string): string;
export declare function makeExecutable(path: string): void;
export declare function templateReplace(content: string, vars: Record<string, string>): string;
export declare function getClaudeHome(): string;
export declare function getConfigHome(): string;
export declare function symlinkSafe(target: string, link: string): void;
export declare function installBinary(pkg: InstallPackage, env: DetectedEnvironment): InstallResult;
export declare function appendToShellRc(env: DetectedEnvironment, line: string, marker: string): void;
export declare const log: {
    info: (msg: string) => void;
    success: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    dim: (msg: string) => void;
};
