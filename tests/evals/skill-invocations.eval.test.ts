import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const claudeBin = Bun.which("claude");
const optedIn = process.env.RUN_CLAUDE_EVALS === "1";

if (optedIn && !claudeBin) {
  throw new Error(
    "RUN_CLAUDE_EVALS=1 but `claude` binary not on PATH. Install Claude Code or unset RUN_CLAUDE_EVALS.",
  );
}

const shouldRun = optedIn && claudeBin !== null;

type ToolUse = { name: string; input?: Record<string, unknown> };

function extractToolUses(stdout: string): ToolUse[] {
  const uses: ToolUse[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: unknown;
    try { event = JSON.parse(trimmed); } catch { continue; }
    if (!event || typeof event !== "object") continue;
    const msg = (event as { message?: { content?: unknown } }).message;
    const content = msg?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block && typeof block === "object" && (block as { type?: string }).type === "tool_use") {
        uses.push({
          name: (block as { name: string }).name,
          input: (block as { input?: Record<string, unknown> }).input,
        });
      }
    }
  }
  return uses;
}

function skillInvocations(uses: ToolUse[]): string[] {
  return uses
    .filter((u) => u.name === "Skill")
    .map((u) => String(u.input?.skill ?? ""))
    .filter(Boolean);
}

function runClaudePrompt(
  prompt: string,
  sandbox: string,
  timeoutMs = 180_000,
): { skills: string[]; stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(
    [claudeBin!, "-p", prompt, "--output-format", "stream-json", "--verbose"],
    { cwd: sandbox, stdout: "pipe", stderr: "pipe", timeout: timeoutMs },
  );
  const stdout = new TextDecoder().decode(proc.stdout);
  const stderr = new TextDecoder().decode(proc.stderr);
  return {
    skills: skillInvocations(extractToolUses(stdout)),
    stdout,
    stderr,
    exitCode: proc.exitCode ?? 1,
  };
}

describe.skipIf(!shouldRun)("skill-invocations eval (claude -p subprocess)", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "skill-eval-"));
  mkdirSync(join(sandbox, "src"), { recursive: true });
  writeFileSync(join(sandbox, "src", "utils.ts"), "");

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  test(
    "trivial task: invokes karpathy-guidelines + coding-style + verification-before-completion (TDD not required by /do Phase 3 for tiny tweaks)",
    () => {
      const r = runClaudePrompt(
        "Add a function foo() that returns 42 to src/utils.ts, and write a bun test for it.",
        sandbox,
      );
      if (r.exitCode !== 0) {
        throw new Error(`claude -p exited ${r.exitCode}. stderr:\n${r.stderr}\nstdout tail:\n${r.stdout.slice(-500)}`);
      }
      expect(r.skills).toContain("karpathy-guidelines");
      expect(r.skills).toContain("coding-style");
      expect(r.skills).toContain("verification-before-completion");
    },
    200_000,
  );

  test(
    "non-trivial task: ALSO invokes do (routing) + test-driven-development (correctness-critical impl)",
    () => {
      const sub = mkdtempSync(join(tmpdir(), "skill-eval-complex-"));
      mkdirSync(join(sub, "src"), { recursive: true });
      try {
        const r = runClaudePrompt(
          "Implement a TokenBucket rate limiter class in src/rate-limiter.ts with methods acquire(n) and reset(). It must refill at a configurable rate. Include bun tests covering the refill behavior, edge cases, and concurrent acquire. This is correctness-critical infrastructure code.",
          sub,
          420_000,
        );
        if (r.exitCode !== 0) {
          throw new Error(`claude -p exited ${r.exitCode}. stderr:\n${r.stderr}\nstdout tail:\n${r.stdout.slice(-500)}`);
        }
        expect(r.skills).toContain("karpathy-guidelines");
        expect(r.skills).toContain("coding-style");
        expect(r.skills).toContain("do");
        expect(r.skills).toContain("test-driven-development");
        expect(r.skills).toContain("verification-before-completion");
      } finally {
        rmSync(sub, { recursive: true, force: true });
      }
    },
    480_000,
  );
});
