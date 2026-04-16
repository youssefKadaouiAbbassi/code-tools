import { describe, test, expect } from "bun:test";
import { join } from "node:path";

const HOOKS_DIR = join(import.meta.dir, "../../configs/hooks");
const FIXTURES_DIR = join(import.meta.dir, "../fixtures");

type HookResult = {
  exitCode: number;
  stdout: string;
  decision: "allow" | "deny";
  reason?: string;
};

async function runHook(hookName: string, stdinFile: string): Promise<HookResult> {
  const hookPath = join(HOOKS_DIR, hookName);
  const input = await Bun.file(join(FIXTURES_DIR, stdinFile)).text();

  const proc = Bun.spawn(["bash", hookPath], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(input);
  await proc.stdin.end();

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();

  // PreToolUse hooks emit {"hookSpecificOutput":{"permissionDecision":"deny",…}} on block,
  // or nothing on allow.
  let decision: "allow" | "deny" = "allow";
  let reason: string | undefined;
  const trimmed = stdout.trim();
  if (trimmed.length > 0) {
    const parsed = JSON.parse(trimmed) as {
      hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
    };
    if (parsed.hookSpecificOutput?.permissionDecision === "deny") {
      decision = "deny";
      reason = parsed.hookSpecificOutput.permissionDecisionReason;
    }
  }

  return { exitCode, stdout, decision, reason };
}

const jqAvailable = Bun.which("jq") !== null;

describe.skipIf(!jqAvailable)("Hook I/O tests", () => {
  describe("pre-destructive-blocker.sh", () => {
    test("safe command (ls -la) → allow (silent exit 0)", async () => {
      const result = await runHook("pre-destructive-blocker.sh", "hook-stdin-bash.json");
      expect(result.exitCode).toBe(0);
      expect(result.decision).toBe("allow");
    });

    test("destructive command (rm -rf /) → blocked by settings deny before hook, so hook sees it and is allowed to skip", async () => {
      // NOTE: rm -rf / is now blocked by settings.json deny (literal prefix match),
      // which fires BEFORE PreToolUse hooks. The hook retains regex coverage for
      // patterns settings can't express. Verify the hook still BLOCKS a destructive
      // pattern settings.json doesn't cover — DROP TABLE.
      const dropTableInput = { tool_name: "Bash", tool_input: { command: "DROP TABLE users;" } };
      const proc = Bun.spawn(["bash", join(HOOKS_DIR, "pre-destructive-blocker.sh")], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      proc.stdin.write(JSON.stringify(dropTableInput));
      await proc.stdin.end();
      await proc.exited;
      const stdout = (await new Response(proc.stdout).text()).trim();
      expect(stdout).toContain("permissionDecision");
      expect(stdout).toContain("deny");
      expect(stdout).toContain("DROP TABLE");
    });

    test("non-Bash tool (Edit) → allow (silent exit 0)", async () => {
      const result = await runHook("pre-destructive-blocker.sh", "hook-stdin-edit.json");
      expect(result.exitCode).toBe(0);
      expect(result.decision).toBe("allow");
    });
  });

  describe("pre-secrets-guard.sh", () => {
    test("clean command (ls -la) → allow (silent exit 0)", async () => {
      const result = await runHook("pre-secrets-guard.sh", "hook-stdin-bash.json");
      expect(result.exitCode).toBe(0);
      expect(result.decision).toBe("allow");
    });

    test("AWS key leak → deny with reason", async () => {
      const result = await runHook("pre-secrets-guard.sh", "hook-stdin-bash-secrets.json");
      expect(result.decision).toBe("deny");
      expect(typeof result.reason).toBe("string");
      expect(result.reason!.length).toBeGreaterThan(0);
      expect(result.reason).toContain("AWS");
    });

    test("non-Bash tool (Edit) → allow (silent exit 0)", async () => {
      const result = await runHook("pre-secrets-guard.sh", "hook-stdin-edit.json");
      expect(result.exitCode).toBe(0);
      expect(result.decision).toBe("allow");
    });
  });
});
