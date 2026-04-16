import { describe, test, expect } from "bun:test";
import { getAuthMounts, validateAuthFiles, getDockerMountArgs, getTestContainerMounts } from "./auth-mount";

describe("auth-mount", () => {
  test("getAuthMounts returns expected structure", () => {
    const mounts = getAuthMounts();

    expect(mounts).toHaveLength(3);

    // Check required files
    const required = mounts.filter(m => m.required);
    expect(required).toHaveLength(2);
    expect(required.map(m => m.containerPath)).toContain("/home/tester/.claude.json");
    expect(required.map(m => m.containerPath)).toContain("/home/tester/.claude/.credentials.json");

    // Check optional file
    const optional = mounts.filter(m => !m.required);
    expect(optional).toHaveLength(1);
    expect(optional[0].containerPath).toBe("/home/tester/.claude/settings.json");
  });

  test("getAuthMounts works with custom container user", () => {
    const mounts = getAuthMounts("customuser");

    expect(mounts[0].containerPath).toBe("/home/customuser/.claude.json");
    expect(mounts[1].containerPath).toBe("/home/customuser/.claude/.credentials.json");
    expect(mounts[2].containerPath).toBe("/home/customuser/.claude/settings.json");
  });

  test("validateAuthFiles returns validation status", () => {
    const result = validateAuthFiles();

    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("missing");
    expect(result).toHaveProperty("warnings");
    expect(Array.isArray(result.missing)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test("getDockerMountArgs returns proper format", () => {
    // This test may skip if required files don't exist
    try {
      const args = getDockerMountArgs();

      // Should be pairs of -v and mount string
      expect(args.length % 2).toBe(0);

      for (let i = 0; i < args.length; i += 2) {
        expect(args[i]).toBe("-v");
        expect(args[i + 1]).toMatch(/.*:.*:ro$/);
      }
    } catch (error) {
      // Expected if required auth files don't exist
      expect((error as Error).message).toContain("Required authentication file missing");
    }
  });

  test("getTestContainerMounts returns proper format", () => {
    try {
      const mounts = getTestContainerMounts();

      for (const mount of mounts) {
        expect(mount).toHaveProperty("source");
        expect(mount).toHaveProperty("target");
        expect(mount).toHaveProperty("readOnly");
        expect(mount.readOnly).toBe(true);
        expect(typeof mount.source).toBe("string");
        expect(typeof mount.target).toBe("string");
      }
    } catch (error) {
      // Expected if required auth files don't exist
      expect((error as Error).message).toContain("Required authentication file missing");
    }
  });
});