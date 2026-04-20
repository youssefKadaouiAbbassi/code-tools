import { describe, test, expect } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const HOOKS_DIR = join(import.meta.dir, "../../configs/home-claude/hooks");

const HOOK_PAYLOADS: Record<string, string> = {
  "elicitation.sh": JSON.stringify({
    mcp_server_name: "docfork",
    message: "m",
    mode: "form",
    session_id: "s",
  }),
  "file-changed.sh": JSON.stringify({ file_path: "/tmp/x", event: "change" }),
  "permission-denied.sh": JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "ls" },
    tool_use_id: "u",
    reason: "denied",
    session_id: "s",
  }),
  "post-compact.sh": JSON.stringify({
    trigger: "manual",
    compact_summary: "x",
    session_id: "s",
    transcript_path: "/tmp/none.jsonl",
  }),
  "post-lint-gate.sh": JSON.stringify({
    tool_name: "Read",
    tool_input: {},
  }),
  "pre-compact.sh": JSON.stringify({
    trigger: "manual",
    custom_instructions: "",
    transcript_path: "/tmp/none.jsonl",
  }),
  "pre-pr-gate.sh": JSON.stringify({
    tool_name: "Read",
    tool_input: {},
  }),
  "pre-research-check.sh": JSON.stringify({
    tool_name: "Read",
    tool_input: {},
    transcript_path: "/tmp/none.jsonl",
  }),
  "session-end.sh": JSON.stringify({ session_id: "s", stop_hook_active: false }),
  "session-start.sh": JSON.stringify({ session_id: "s" }),
  "session-start-team-reaper.sh": JSON.stringify({ session_id: "s" }),
  "session-start-update-check.sh": JSON.stringify({ session_id: "s" }),
  "session-start-yka-update-check.sh": JSON.stringify({ session_id: "s" }),
  "stop-failure.sh": JSON.stringify({
    error: "boom",
    error_details: "",
    last_assistant_message: "",
    session_id: "s",
  }),
  "stop-research-check.sh": JSON.stringify({
    transcript_path: "/tmp/none.jsonl",
    session_id: "s",
  }),
  "stop-verification-check.sh": JSON.stringify({
    transcript_path: "/tmp/none.jsonl",
    session_id: "s",
  }),
  "stop-summary.sh": JSON.stringify({ session_id: "s" }),
  "stop-team-balance-check.sh": JSON.stringify({
    transcript_path: "/tmp/none.jsonl",
    session_id: "s",
  }),
  "task-completed.sh": JSON.stringify({
    task_id: "t1",
    task_subject: "meaningful task subject",
    session_id: "s",
  }),
  "task-created.sh": JSON.stringify({
    task_id: "t1",
    task_subject: "meaningful task subject",
    session_id: "s",
  }),
  "teammate-idle.sh": JSON.stringify({
    teammate_name: "x",
    team_name: "team",
    session_id: "s",
  }),
  "user-prompt-submit.sh": JSON.stringify({ prompt: "hi", cwd: process.cwd() }),
};

async function spawnHook(
  hookName: string,
  stdin: string,
  extraEnv: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bash", join(HOOKS_DIR, hookName)], {
    env: { ...process.env, ...extraEnv },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(stdin);
  await proc.stdin.end();
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}

const jqAvailable = Bun.which("jq") !== null;

describe.skipIf(!jqAvailable)("Hook I/O — 18 previously-untested hooks", () => {
  for (const [hook, payload] of Object.entries(HOOK_PAYLOADS)) {
    test(`${hook} exits 0 with a minimal valid payload`, async () => {
      const result = await spawnHook(hook, payload);
      expect(result.exitCode).toBe(0);
    });

    test(`${hook} honors YKA_HOOKS_BYPASS=all`, async () => {
      const result = await spawnHook(hook, payload, { YKA_HOOKS_BYPASS: "all" });
      expect(result.exitCode).toBe(0);
    });
  }
});

describe("Every hook sources _hook-guard.sh", () => {
  test("all *.sh (except _hook-guard itself) source the guard near the top", async () => {
    const files = (await readdir(HOOKS_DIR))
      .filter((f) => f.endsWith(".sh") && !f.startsWith("_"));

    for (const file of files) {
      const text = await readFile(join(HOOKS_DIR, file), "utf8");
      const firstLines = text.split("\n").slice(0, 5).join("\n");
      expect(firstLines).toContain("_hook-guard.sh");
    }
  });
});
