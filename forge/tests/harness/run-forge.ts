import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ForgeRun {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export async function runForge(brief: string, cwd: string, timeoutMs = 30 * 60_000): Promise<ForgeRun> {
  const start = Date.now();
  const briefFile = join(cwd, ".forge-brief.txt");
  writeFileSync(briefFile, "/forge:forge " + brief);
  return new Promise((resolve) => {
    // Why root + acceptEdits (not `su forge` + --dangerously-skip-permissions):
    // mounted host credentials are 600 ubuntu:ubuntu inside the container, so
    // only root can read them — `su forge` fails with "Not logged in". Root
    // cannot use --dangerously-skip-permissions (Claude Code refuses), so we
    // use acceptEdits. L3 tests assert what forge PRODUCES, not what it gets
    // to skip; acceptEdits unblocks the runner for the bun build of `claude -p`.
    const cmd = `export CLAUDE_CONFIG_DIR=/root/.claude PATH=/root/.bun/bin:/usr/local/bin:/usr/bin:/bin && cd ${JSON.stringify(cwd)} && BRIEF=$(cat ${JSON.stringify(briefFile)}) && claude -p "$BRIEF" --model opus --permission-mode acceptEdits`;
    const proc = spawn("bash", ["-c", cmd], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (b) => (stdout += b.toString()));
    proc.stderr?.on("data", (b) => (stderr += b.toString()));
    const timer = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, timeoutMs);
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stdout, stderr, durationMs: Date.now() - start });
    });
  });
}
