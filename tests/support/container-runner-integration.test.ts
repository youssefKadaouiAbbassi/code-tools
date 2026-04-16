import { describe, it, expect } from "bun:test";
import { runLaneInContainer, createBaseContainer, dockerAvailable } from "./container-runner";

// Integration tests that require Docker (skip if Docker not available)
const hasDocker = await dockerAvailable();
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "true";

describe.skipIf(!hasDocker || !runIntegration)("container-runner integration", () => {
  it.skip(
    "runs a simple test lane in container",
    async () => {
      const baseImage = createBaseContainer();

      const result = await runLaneInContainer({
        lane: "unit",
        image: baseImage,
        env: { NODE_ENV: "test" },
        withAuth: false
      });

      expect(typeof result.exitCode).toBe("number");
      expect(typeof result.logs).toBe("string");
      expect(result.logs.length).toBeGreaterThan(0);
    },
    120_000 // 2 minute timeout for container operations
  );

  it.skip(
    "handles authenticated container runs",
    async () => {
      const baseImage = createBaseContainer();

      const result = await runLaneInContainer({
        lane: "integration",
        image: baseImage,
        env: { TEST_MODE: "auth" },
        withAuth: true
      });

      expect(typeof result.exitCode).toBe("number");
      expect(typeof result.logs).toBe("string");
    },
    120_000
  );
});

// Always run these basic validation tests
describe("container-runner validation", () => {
  it("has correct function signatures", () => {
    expect(typeof runLaneInContainer).toBe("function");
    expect(runLaneInContainer.length).toBe(1); // expects 1 parameter (opts object)

    expect(typeof createBaseContainer).toBe("function");
    expect(createBaseContainer.length).toBe(0); // no parameters

    expect(typeof dockerAvailable).toBe("function");
    expect(dockerAvailable.length).toBe(0); // no parameters
  });

  it("dockerAvailable function works", async () => {
    const result = await dockerAvailable();
    expect(typeof result).toBe("boolean");
  });

  it("createBaseContainer creates buildable image", () => {
    const container = createBaseContainer();
    expect(container).toHaveProperty("build");
    expect(container).toHaveProperty("withBuildArgs");
    expect(container).toHaveProperty("withCache");
  });
});