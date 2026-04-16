import { $ } from "bun";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";


export const orchestrationCategory: ComponentCategory = {
  id: "orchestration",
  name: "Orchestration",
  tier: "optional",
  description: "Multi-agent orchestration and parallel task execution",
  defaultEnabled: false,
  components: [
    {
      id: 25,
      name: "agent-teams",
      displayName: "Agent Teams",
      description: "Claude Code native agent teams (env var in primordial)",
      tier: "optional",
      category: "orchestration",
      packages: [],
      verifyCommand: "echo agent-teams-envvar",
    },
    {
      id: 26,
      name: "multica",
      displayName: "Multica",
      description: "Multi-model orchestration CLI",
      tier: "optional",
      category: "orchestration",
      packages: [
        {
          name: "multica",
          displayName: "Multica",
          npm: "npm install -g multica",
        },
      ],
      verifyCommand: "multica --version",
    },
  ],
};

export async function install(env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  // --- Agent Teams (env var managed by primordial) ---
  try {
    const hasTeams = !!process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    if (hasTeams) {
      log.info("Agent Teams env var already present");
      results.push({
        component: "Agent Teams",
        status: "already-installed",
        message: "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var already set",
        verifyPassed: true,
      });
    } else {
      log.info("Agent Teams: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var should be set in your shell RC by the primordial layer");
      results.push({
        component: "Agent Teams",
        status: "skipped",
        message: "Agent Teams env var is managed by the primordial layer — check your shell RC",
        verifyPassed: false,
      });
    }
  } catch (err) {
    results.push({
      component: "Agent Teams",
      status: "failed",
      message: `Agent Teams check failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  try {
    const frontendPort = process.env.MULTICA_FRONTEND_PORT ?? "3333";
    const backendPort = process.env.MULTICA_BACKEND_PORT ?? "8080";
    const serverDir = join(env.homeDir, ".multica", "server");
    const envFile = join(serverDir, ".env");

    if (dryRun) {
      log.info(`[dry-run] Would run: curl … install.sh | bash -s -- --with-server`);
      log.info(`[dry-run] Would set FRONTEND_PORT=${frontendPort} in ${envFile} and restart compose`);
      log.info(`[dry-run] Would run: multica setup self-host --port ${backendPort} --frontend-port ${frontendPort}`);
      results.push({
        component: "Multica",
        status: "skipped",
        message: `[dry-run] Would install multica CLI + self-hosted server on ports backend=${backendPort} frontend=${frontendPort}`,
        verifyPassed: false,
      });
    } else {
      if (!commandExists("multica") || !await fs.stat(serverDir).then(() => true).catch(() => false)) {
        log.info("Running upstream multica install.sh --with-server …");
        const installScript = "curl -fsSL https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.sh | bash -s -- --with-server";
        await $`sh -c ${installScript}`.nothrow();
      } else {
        log.info("multica CLI + server already present, skipping install.sh");
      }

      const envExists = await fs.stat(envFile).then(() => true).catch(() => false);
      if (envExists) {
        const raw = await fs.readFile(envFile, "utf-8");
        const patched = raw
          .replace(/FRONTEND_PORT=\d+/g, `FRONTEND_PORT=${frontendPort}`)
          .replace(/localhost:3000/g, `localhost:${frontendPort}`);
        if (patched !== raw) {
          await fs.writeFile(envFile, patched);
          log.info(`Rewrote ${envFile}: frontend port → ${frontendPort}`);
          // Recreate containers if docker is available
          if (commandExists("docker")) {
            await $`sh -c ${`cd "${serverDir}" && docker compose -f docker-compose.selfhost.yml up -d`}`.nothrow();
          }
        }
      }

      const setupOut = await $`sh -c ${`yes | multica setup self-host --port ${backendPort} --frontend-port ${frontendPort}`}`.nothrow().text();
      const loginLine = setupOut.split("\n").find((l) => l.includes("/login?cli_callback="))?.trim() ?? "";
      const alreadyAuthed = /Authenticated as/.test(setupOut);
      const installed = commandExists("multica");

      let message: string;
      if (alreadyAuthed) {
        message = `multica self-hosted: CLI + server live on backend=${backendPort} frontend=${frontendPort}. Already authenticated; open http://localhost:${frontendPort} to view your workspace.`;
      } else if (loginLine) {
        message = `multica self-hosted: server live on backend=${backendPort} frontend=${frontendPort}. FINISH AUTH: open this URL in your browser → ${loginLine}`;
      } else {
        message = `multica self-hosted: server live on backend=${backendPort} frontend=${frontendPort}. Run \`multica setup self-host --port ${backendPort} --frontend-port ${frontendPort}\` manually to authenticate.`;
      }

      results.push({
        component: "Multica",
        status: installed ? "installed" : "failed",
        message,
        verifyPassed: installed,
      });
    }
  } catch (err) {
    results.push({
      component: "Multica",
      status: "failed",
      message: `Multica install failed: ${err instanceof Error ? err.message : String(err)}`,
      verifyPassed: false,
    });
  }

  return results;
}
