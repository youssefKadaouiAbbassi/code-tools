import { spawn } from "node:child_process";

export interface ClaudeRun {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export async function runClaude(
  prompt: string,
  cwd: string,
  opts: { model?: "opus"; timeoutMs?: number } = {},
): Promise<ClaudeRun> {
  const start = Date.now();
  return new Promise((resolve) => {
    const proc = spawn(
      "claude",
      ["-p", prompt, "--model", opts.model ?? "opus"],
      { cwd, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (b) => (stdout += b.toString()));
    proc.stderr?.on("data", (b) => (stderr += b.toString()));

    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
    }, opts.timeoutMs ?? 5 * 60_000);

    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stdout, stderr, durationMs: Date.now() - start });
    });
  });
}
