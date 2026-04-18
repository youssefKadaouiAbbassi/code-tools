import { describe, test, expect } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const HELPER = join(import.meta.dir, "../../configs/home-claude/hooks/_hook-stdin.sh");

async function runProbe(
  script: string,
  stdin: string,
  extraEnv: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const dir = await mkdtemp(join(tmpdir(), "hook-stdin-"));
  const probe = join(dir, "probe.sh");
  await writeFile(probe, `#!/usr/bin/env bash\nset -euo pipefail\nsource "${HELPER}"\n${script}\n`);

  const proc = Bun.spawn(["bash", probe], {
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

describe("_hook-stdin.sh helper", () => {
  test("sourcing alone does not execute anything or change exit code", async () => {
    const result = await runProbe(`echo sourced-ok`, "");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("sourced-ok");
  });

  test.skipIf(!jqAvailable)("read_hook_stdin captures stdin into HOOK_INPUT", async () => {
    const result = await runProbe(
      `read_hook_stdin; printf '%s' "$HOOK_INPUT"`,
      '{"tool_name":"Bash","session_id":"abc"}',
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('{"tool_name":"Bash","session_id":"abc"}');
  });

  test.skipIf(!jqAvailable)("hook_tool_name extracts .tool_name", async () => {
    const result = await runProbe(
      `read_hook_stdin; hook_tool_name`,
      '{"tool_name":"Edit","session_id":"s1"}',
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("Edit");
  });

  test.skipIf(!jqAvailable)("hook_session_id extracts .session_id", async () => {
    const result = await runProbe(
      `read_hook_stdin; hook_session_id`,
      '{"tool_name":"Bash","session_id":"xyz-123"}',
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("xyz-123");
  });

  test.skipIf(!jqAvailable)("missing fields return empty string, not error", async () => {
    const result = await runProbe(
      `read_hook_stdin; tn="$(hook_tool_name)"; sid="$(hook_session_id)"; printf 'tn=[%s] sid=[%s]' "$tn" "$sid"`,
      '{}',
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("tn=[] sid=[]");
  });

  test.skipIf(!jqAvailable)("malformed JSON does not crash; returns empty", async () => {
    const result = await runProbe(
      `read_hook_stdin; hook_tool_name; printf '|done'`,
      'not json {{',
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("|done");
  });

  test("empty stdin is safe (no hang, no crash)", async () => {
    const result = await runProbe(
      `read_hook_stdin; printf 'ok=[%s]' "\${HOOK_INPUT:-empty}"`,
      "",
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ok=");
  });

  test("hook_log_dir returns path and ensures the directory exists", async () => {
    const result = await runProbe(
      `dir="$(hook_log_dir)"; test -d "$dir" && printf 'dir-exists=%s' "$dir"`,
      "",
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("dir-exists=");
    expect(result.stdout).toContain("/.claude/session-logs");
  });

  test("hook_timestamp emits ISO 8601 UTC format", async () => {
    const result = await runProbe(`hook_timestamp`, "");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test("helper survives missing jq (gracefully returns empty)", async () => {
    const result = await runProbe(
      `read_hook_stdin; tn="$(hook_tool_name)"; printf 'tn=[%s]' "$tn"`,
      '{"tool_name":"Bash"}',
      { PATH: "/usr/bin:/bin" },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("tn=[");
  });
});
