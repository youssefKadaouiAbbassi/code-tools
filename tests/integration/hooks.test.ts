import { describe, test, expect } from "bun:test";
import { $ } from "bun";
import { join } from "node:path";

const HOOKS_DIR = join(import.meta.dir, "../../configs/hooks");
const FIXTURES_DIR = join(import.meta.dir, "../fixtures");

async function runHook(
  hookName: string,
  stdinFile: string
): Promise<{ decision: string; reason?: string }> {
  const hookPath = join(HOOKS_DIR, hookName);
  const input = await Bun.file(join(FIXTURES_DIR, stdinFile)).text();

  try {
    const result = await $`echo ${input} | bash ${hookPath}`.text();
    return JSON.parse(result.trim());
  } catch (err: any) {
    // Some hooks output JSON even on non-zero exit
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout.toString().trim());
      } catch {}
    }
    throw err;
  }
}

const jqAvailable = Bun.which("jq") !== null;

describe.skipIf(!jqAvailable)("Hook I/O tests", () => {
  describe("pre-destructive-blocker.sh", () => {
    test("safe command (ls -la) → allow", async () => {
      const result = await runHook(
        "pre-destructive-blocker.sh",
        "hook-stdin-bash.json"
      );
      expect(result.decision).toBe("allow");
    });

    test("destructive command (rm -rf /) → block with reason", async () => {
      const result = await runHook(
        "pre-destructive-blocker.sh",
        "hook-stdin-bash-destructive.json"
      );
      expect(result.decision).toBe("block");
      expect(typeof result.reason).toBe("string");
      expect(result.reason!.length).toBeGreaterThan(0);
    });

    test("non-Bash tool (Edit) → allow", async () => {
      const result = await runHook(
        "pre-destructive-blocker.sh",
        "hook-stdin-edit.json"
      );
      expect(result.decision).toBe("allow");
    });
  });

  describe("pre-secrets-guard.sh", () => {
    test("clean command (ls -la) → allow", async () => {
      const result = await runHook(
        "pre-secrets-guard.sh",
        "hook-stdin-bash.json"
      );
      expect(result.decision).toBe("allow");
    });

    test("AWS key leak → block with reason", async () => {
      const result = await runHook(
        "pre-secrets-guard.sh",
        "hook-stdin-bash-secrets.json"
      );
      expect(result.decision).toBe("block");
      expect(typeof result.reason).toBe("string");
      expect(result.reason!.length).toBeGreaterThan(0);
    });

    test("non-Bash tool (Edit) → allow", async () => {
      const result = await runHook(
        "pre-secrets-guard.sh",
        "hook-stdin-edit.json"
      );
      expect(result.decision).toBe("allow");
    });
  });
});
