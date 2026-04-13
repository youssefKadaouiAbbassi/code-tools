import type { DetectedEnvironment, InstallResult } from "./types.js";
interface VerifyDetail {
    component: string;
    passed: boolean;
    check: string;
    message: string;
}
interface VerifyReport {
    passed: number;
    failed: number;
    details: VerifyDetail[];
}
export declare function verifyAll(env: DetectedEnvironment, results: InstallResult[]): Promise<VerifyReport>;
export {};
