import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = join(
  import.meta.dir,
  "../../configs/home-claude/hooks/stop-research-check.sh",
);
const ADVISORY = "Research-First Advisory";
const jqAvailable = Bun.which("jq") !== null;

const realUserTurn = (text: string) => ({
  type: "user",
  message: { role: "user", content: text },
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

describe.skipIf(!jqAvailable)("stop-research-check.sh", () => {
  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "stop-research-"));
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  test("(a) fires advisory when assistant makes a library+version claim with no research MCP call", async () => {
    const transcript = writeTranscript([
      realUserTurn("tell me about react"),
      assistantTurn([
        textBlock("React 19 introduced the new useActionState hook that replaces useFormState."),
      ]),
    ]);

    const result = await runHook(transcript);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(ADVISORY);
  });

  test("(b) silent when a research MCP (docfork) was used in the same turn", async () => {
    const transcript = writeTranscript([
      realUserTurn("tell me about react"),
      assistantTurn([
        toolUse("mcp__docfork__search_docs", { query: "react 19" }),
        textBlock("React 19 introduced the new useActionState hook."),
      ]),
    ]);

    const result = await runHook(transcript);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain(ADVISORY);
  });
});
