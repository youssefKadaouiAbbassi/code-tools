import { describe, it, expect, mock } from "bun:test";
import { runLaneInContainer, createBaseContainer, dockerAvailable } from "./container-runner";
import { GenericContainer } from "testcontainers";

// Mock testcontainers for unit testing
const mockContainer = {
  exec: mock(() => Promise.resolve({ exitCode: 0, output: "test output" })),
  stop: mock(() => Promise.resolve()),
  copyArchiveFromContainer: mock(() => Promise.resolve(new ArrayBuffer(0)))
};

const mockImage = {
  withCommand: mock(() => mockImage),
  withCopyDirectoriesToContainer: mock(() => mockImage),
  withWorkingDir: mock(() => mockImage),
  withEnvironment: mock(() => mockImage),
  start: mock(() => Promise.resolve(mockContainer))
};

const mockGenericContainer = {
  build: mock(() => Promise.resolve(mockImage))
};

describe("container-runner", () => {
  it("exports runLaneInContainer function", () => {
    expect(typeof runLaneInContainer).toBe("function");
  });

  it("exports createBaseContainer function", () => {
    expect(typeof createBaseContainer).toBe("function");
  });

  it("exports dockerAvailable function", () => {
    expect(typeof dockerAvailable).toBe("function");
  });

  it("dockerAvailable returns a boolean", async () => {
    const result = await dockerAvailable();
    expect(typeof result).toBe("boolean");
  });

  it("createBaseContainer returns GenericContainer builder", () => {
    const container = createBaseContainer();
    expect(container).toHaveProperty("build");
    expect(typeof container.build).toBe("function");
  });

  it("runLaneInContainer handles successful execution", async () => {
    const opts = {
      lane: "unit",
      image: mockGenericContainer as any,
      env: { TEST_VAR: "value" },
      withAuth: false
    };

    const result = await runLaneInContainer(opts);

    expect(result).toHaveProperty("exitCode");
    expect(result).toHaveProperty("logs");
    expect(typeof result.exitCode).toBe("number");
    expect(typeof result.logs).toBe("string");
  });

  it("runLaneInContainer includes lane in environment", async () => {
    const opts = {
      lane: "integration",
      image: mockGenericContainer as any,
      env: {},
      withAuth: false
    };

    await runLaneInContainer(opts);

    // Verify that withEnvironment was called with LANE and TEST_LANE
    expect(mockImage.withEnvironment).toHaveBeenCalledWith("LANE", "integration");
    expect(mockImage.withEnvironment).toHaveBeenCalledWith("TEST_LANE", "integration");
  });

  it("runLaneInContainer includes auth environment when withAuth=true", async () => {
    const originalApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";

    const opts = {
      lane: "e2e",
      image: mockGenericContainer as any,
      env: {},
      withAuth: true
    };

    await runLaneInContainer(opts);

    expect(mockImage.withEnvironment).toHaveBeenCalledWith("ANTHROPIC_API_KEY", "test-key");

    // Restore original
    if (originalApiKey) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("runLaneInContainer sets up container correctly", async () => {
    const opts = {
      lane: "unit",
      image: mockGenericContainer as any
    };

    await runLaneInContainer(opts);

    // Verify container setup sequence
    expect(mockGenericContainer.build).toHaveBeenCalled();
    expect(mockImage.withCommand).toHaveBeenCalledWith(["sleep", "infinity"]);
    expect(mockImage.withCopyDirectoriesToContainer).toHaveBeenCalledWith([
      { source: ".", target: "/workspace" }
    ]);
    expect(mockImage.withWorkingDir).toHaveBeenCalledWith("/workspace");
    expect(mockImage.start).toHaveBeenCalled();
  });

  it("runLaneInContainer creates output directory", async () => {
    const opts = {
      lane: "unit",
      image: mockGenericContainer as any
    };

    await runLaneInContainer(opts);

    expect(mockContainer.exec).toHaveBeenCalledWith([
      "mkdir", "-p", "/workspace/test-output/unit/"
    ]);
  });

  it("runLaneInContainer executes test command", async () => {
    const opts = {
      lane: "integration",
      image: mockGenericContainer as any
    };

    await runLaneInContainer(opts);

    // Find the test execution call
    const testCommand = mockContainer.exec.mock.calls.find(call =>
      call[0][0] === "bash" &&
      call[0][1] === "-c" &&
      call[0][2].includes("bun test tests/integration")
    );

    expect(testCommand).toBeDefined();
  });

  it("runLaneInContainer handles container cleanup", async () => {
    const opts = {
      lane: "unit",
      image: mockGenericContainer as any
    };

    await runLaneInContainer(opts);

    expect(mockContainer.stop).toHaveBeenCalled();
  });

  it("runLaneInContainer handles errors gracefully", async () => {
    const failingImage = {
      build: mock(() => Promise.reject(new Error("Build failed")))
    };

    const opts = {
      lane: "unit",
      image: failingImage as any
    };

    const result = await runLaneInContainer(opts);

    expect(result.exitCode).toBe(1);
    expect(result.logs).toContain("Container execution failed");
  });

  it("runLaneInContainer extracts test output", async () => {
    const opts = {
      lane: "unit",
      image: mockGenericContainer as any
    };

    await runLaneInContainer(opts);

    expect(mockContainer.copyArchiveFromContainer).toHaveBeenCalledWith(
      "/workspace/test-output/unit/"
    );
  });
});