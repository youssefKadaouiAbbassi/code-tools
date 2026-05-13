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
    const cmd = `export HOME=/home/forge CLAUDE_CONFIG_DIR=/home/forge/.claude PATH=/usr/local/bin:/usr/bin:/bin && cd ${JSON.stringify(cwd)} && BRIEF=$(cat ${JSON.stringify(briefFile)}) && claude -p "$BRIEF" --model opus --dangerously-skip-permissions`;
    const proc = spawn("su", ["forge", "-c", cmd], { stdio: ["ignore", "pipe", "pipe"] });
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
