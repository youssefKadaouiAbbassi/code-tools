import { GenericContainer } from "testcontainers";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

export interface RunLaneOptions {
  lane: string;
  image: GenericContainer;
  env?: Record<string, string>;
  withAuth?: boolean;
}

export interface RunLaneResult {
  exitCode: number;
  logs: string;
}

/**
 * Core testcontainers orchestration utility for running test lanes in isolated containers.
 *
 * This function:
 * 1. Builds the container from the provided image/Dockerfile
 * 2. Copies the current directory to the container
 * 3. Executes the test lane with proper environment setup
 * 4. Extracts test outputs from container to host
 * 5. Handles container lifecycle (start, exec, cleanup)
 */
export async function runLaneInContainer(opts: RunLaneOptions): Promise<RunLaneResult> {
  const { lane, image, env = {}, withAuth = false } = opts;

  let container;
  let builtImage;

  try {
    // Build the container image
    builtImage = await image.build();

    // Prepare environment variables
    const containerEnv = {
      ...env,
      LANE: lane,
      TEST_LANE: lane,
      ...(withAuth && {
        // Add authentication-related environment variables if needed
        CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      })
    };

    // Start the container with the project directory copied in
    const containerBuilder = builtImage
      .withCommand(["sleep", "infinity"])
      .withCopyDirectoriesToContainer([
        { source: ".", target: "/workspace" }
      ])
      .withWorkingDir("/workspace");

    // Add environment variables
    for (const [key, value] of Object.entries(containerEnv)) {
      if (value) {
        containerBuilder.withEnvironment(key, value);
      }
    }

    container = await containerBuilder.start();

    // Create test output directory inside container
    const createOutputDirResult = await container.exec([
      "mkdir", "-p", `/workspace/test-output/${lane}/`
    ]);

    if (createOutputDirResult.exitCode !== 0) {
      throw new Error(`Failed to create output directory: ${createOutputDirResult.output}`);
    }

    // Install dependencies if package.json exists
    const installResult = await container.exec([
      "bash", "-c",
      "if [ -f package.json ]; then bun install --frozen-lockfile; fi"
    ]);

    if (installResult.exitCode !== 0) {
      console.warn(`Dependency installation failed: ${installResult.output}`);
    }

    // Execute the test lane
    const testCommand = [
      "bash", "-c",
      `cd /workspace && bun test tests/${lane} --reporter json > test-output/${lane}/results.json 2>&1 || echo "exit_code:$?" >> test-output/${lane}/results.json`
    ];

    const testResult = await container.exec(testCommand);

    // Capture logs from the test execution
    const logs = testResult.output || "";

    // Create host output directory
    const hostOutputDir = join(process.cwd(), "test-output", lane);
    if (!existsSync(join(process.cwd(), "test-output"))) {
      await mkdir(join(process.cwd(), "test-output"), { recursive: true });
    }
    if (!existsSync(hostOutputDir)) {
      await mkdir(hostOutputDir, { recursive: true });
    }

    // Extract test results from container to host
    try {
      const archiveStream = await container.copyArchiveFromContainer(
        `/workspace/test-output/${lane}/`
      );

      // Save the archive stream to host filesystem
      const archivePath = join(hostOutputDir, "results.tar");
      const file = Bun.file(archivePath);
      await Bun.write(file, archiveStream);

      // Extract the archive
      const extractResult = await Bun.spawn([
        "tar", "-xf", archivePath, "-C", hostOutputDir, "--strip-components=1"
      ], {
        cwd: hostOutputDir,
        stdout: "pipe",
        stderr: "pipe"
      }).exited;

      if (extractResult !== 0) {
        console.warn(`Failed to extract test results archive`);
      }
    } catch (error) {
      console.warn(`Failed to extract test output: ${error}`);
    }

    return {
      exitCode: testResult.exitCode,
      logs
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Container execution failed for lane '${lane}':`, errorMessage);

    return {
      exitCode: 1,
      logs: `Container execution failed: ${errorMessage}`
    };
  } finally {
    // Cleanup: stop and remove the container
    if (container) {
      try {
        await container.stop();
      } catch (error) {
        console.warn(`Failed to stop container:`, error);
      }
    }
  }
}

/**
 * Helper function to create a GenericContainer from the base Dockerfile
 */
export function createBaseContainer(): GenericContainer {
  const containersDir = join(process.cwd(), "tests", "containers");
  return GenericContainer.fromDockerfile(containersDir, "base.Dockerfile");
}

/**
 * Helper function to check if Docker is available
 */
export async function dockerAvailable(): Promise<boolean> {
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