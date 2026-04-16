import { describe, test, expect } from "bun:test";
import { GenericContainer } from "testcontainers";
import { join } from "node:path";

const CONTAINERS_DIR = join(import.meta.dir, "containers");

async function dockerAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["docker", "info"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

const hasDocker = await dockerAvailable();
const runE2E = process.env.RUN_E2E_TESTS === "true";

describe.skipIf(!hasDocker || !runE2E)("Container E2E", () => {
  test(
    "Ubuntu primordial install",
    async () => {
      const image = await GenericContainer.fromDockerfile(
        CONTAINERS_DIR,
        "ubuntu.Dockerfile"
      ).build();

      const container = await image
        .withCommand(["sleep", "infinity"])
        .withCopyDirectoriesToContainer([{ source: ".", target: "/app" }])
        .start();

      try {
        const installResult = await container.exec([
          "bash",
          "-c",
          "cd /app && bun install --frozen-lockfile 2>&1",
        ]);
        expect(installResult.exitCode).toBe(0);

        const result = await container.exec([
          "bash",
          "-c",
          "cd /app && bun run bin/setup.ts --non-interactive --tier primordial 2>&1",
        ]);
        expect(result.exitCode).toBe(0);

        const settingsCheck = await container.exec([
          "bash",
          "-c",
          "jq '.permissions.deny | length' /root/.claude/settings.json",
        ]);
        expect(settingsCheck.exitCode).toBe(0);
        expect(parseInt(settingsCheck.output.trim())).toBeGreaterThanOrEqual(
          40
        );

        const hookCheck = await container.exec([
          "test",
          "-x",
          "/root/.claude/hooks/pre-destructive-blocker.sh",
        ]);
        expect(hookCheck.exitCode).toBe(0);

        const jqCheck = await container.exec(["jq", "--version"]);
        expect(jqCheck.exitCode).toBe(0);
      } finally {
        await container.stop();
      }
    },
    300_000
  );

  test(
    "Ubuntu idempotent — run twice",
    async () => {
      const image = await GenericContainer.fromDockerfile(
        CONTAINERS_DIR,
        "ubuntu.Dockerfile"
      ).build();

      const container = await image
        .withCommand(["sleep", "infinity"])
        .withCopyDirectoriesToContainer([{ source: ".", target: "/app" }])
        .start();

      try {
        await container.exec([
          "bash",
          "-c",
          "cd /app && bun install --frozen-lockfile 2>&1",
        ]);

        const run1 = await container.exec([
          "bash",
          "-c",
          "cd /app && bun run bin/setup.ts --non-interactive --tier primordial 2>&1",
        ]);
        expect(run1.exitCode).toBe(0);

        const run2 = await container.exec([
          "bash",
          "-c",
          "cd /app && bun run bin/setup.ts --non-interactive --tier primordial 2>&1",
        ]);
        expect(run2.exitCode).toBe(0);

        const settingsCheck = await container.exec([
          "bash",
          "-c",
          "jq '.permissions.deny | length' /root/.claude/settings.json",
        ]);
        expect(parseInt(settingsCheck.output.trim())).toBeGreaterThanOrEqual(
          40
        );
      } finally {
        await container.stop();
      }
    },
    300_000
  );
});
