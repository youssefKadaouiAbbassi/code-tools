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

describe.skipIf(!shouldRun)("skill-invocations eval (claude -p subprocess)", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "skill-eval-"));
  mkdirSync(join(sandbox, "src"), { recursive: true });
  writeFileSync(join(sandbox, "src", "utils.ts"), "");

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  test(
    "invokes karpathy-guidelines, coding-style, verification-before-completion, and test-driven-development",
    () => {
      const proc = Bun.spawnSync(
        [
          claudeBin!,
          "-p",
          "Add a function foo() that returns 42 to src/utils.ts, and write a bun test for it.",
          "--output-format",
          "stream-json",
          "--verbose",
        ],
        {
          cwd: sandbox,
          stdout: "pipe",
          stderr: "pipe",
          timeout: 180_000,
        },
      );

      const stdout = new TextDecoder().decode(proc.stdout);
      const stderr = new TextDecoder().decode(proc.stderr);

      if (proc.exitCode !== 0) {
        throw new Error(
          `claude -p exited ${proc.exitCode}. stderr:\n${stderr}\nstdout tail:\n${stdout.slice(-500)}`,
        );
      }

      const skills = skillInvocations(extractToolUses(stdout));

      expect(skills).toContain("karpathy-guidelines");
      expect(skills).toContain("coding-style");
      expect(skills).toContain("verification-before-completion");
      expect(skills).toContain("test-driven-development");
    },
    200_000,
  );
});
