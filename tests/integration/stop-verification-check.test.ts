import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = join(
  import.meta.dir,
  "../../configs/home-claude/hooks/stop-verification-check.sh",
);
const ADVISORY = "Verification-Before-Completion Advisory";
const jqAvailable = Bun.which("jq") !== null;

const realUserTurn = (text: string) => ({
  type: "user",
  message: { role: "user", content: text },
});

const toolResultTurn = (id: string, result: string) => ({
  type: "user",
  message: {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: id, content: result }],
  },
});

const assistantTurn = (content: unknown[]) => ({
  type: "assistant",
  message: { content },
});

const toolUse = (name: string, input: Record<string, unknown> = {}) => ({
  type: "tool_use",
  name,
  input,
});

const textBlock = (text: string) => ({ type: "text", text });

let sandbox: string;

function writeTranscript(records: object[]): string {
  const path = join(sandbox, `t-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  writeFileSync(path, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return path;
}

async function runHook(transcriptPath: string) {
  const proc = Bun.spawn(["bash", HOOK], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(JSON.stringify({ transcript_path: transcriptPath, session_id: "s" }));
  await proc.stdin.end();
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}

describe.skipIf(!jqAvailable)("stop-verification-check.sh", () => {
  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "stop-verif-"));
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  test("(a) fires advisory when Write + done-claim and no verification Skill", async () => {
    const transcript = writeTranscript([
      realUserTurn("fix the bug"),
      assistantTurn([
        toolUse("Write", { file_path: "/tmp/x", content: "y" }),
        textBlock("done"),
      ]),
    ]);

    const result = await runHook(transcript);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(ADVISORY);
  });

  test("(b) silent when verification-before-completion Skill was invoked", async () => {
    const transcript = writeTranscript([
      realUserTurn("fix the bug"),
      assistantTurn([
        toolUse("Write", { file_path: "/tmp/x", content: "y" }),
        toolUse("Skill", { skill: "verification-before-completion" }),
        textBlock("done"),
      ]),
    ]);

    const result = await runHook(transcript);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain(ADVISORY);
  });

  test("(c) silent when the turn contains no Write/Edit/MultiEdit tool_use", async () => {
    const transcript = writeTranscript([
      realUserTurn("what does this code do?"),
      assistantTurn([
        toolUse("Read", { file_path: "/tmp/x" }),
        toolUse("Grep", { pattern: "foo" }),
        textBlock("done"),
      ]),
    ]);

    const result = await runHook(transcript);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain(ADVISORY);
  });

  test("(d) silent when assistant text has no done-claim keyword", async () => {
    const transcript = writeTranscript([
      realUserTurn("modify x"),
      assistantTurn([
        toolUse("Write", { file_path: "/tmp/x", content: "y" }),
        textBlock("I modified the function to handle the new path."),
      ]),
    ]);

    const result = await runHook(transcript);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain(ADVISORY);
  });

  test("(e) fires advisory even when tool_result-wrapped user records follow the assistant turn (boundary regression-lock)", async () => {
    const transcript = writeTranscript([
      realUserTurn("fix the bug"),
      assistantTurn([
        toolUse("Write", { file_path: "/tmp/x", content: "y" }),
        textBlock("done"),
      ]),
      toolResultTurn("x1", "ok"),
      toolResultTurn("x2", "ok2"),
    ]);

    const result = await runHook(transcript);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(ADVISORY);
  });
});
