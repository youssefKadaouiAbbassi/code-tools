import { existsSync } from "node:fs";

// Detect the forge-dev docker container. L1/L2/L3 stack-integration tests
// invoke Stryker, fast-check, Hypothesis, cargo-mutants, Playwright,
// Opengrep, Grype, etc. — none of which are guaranteed on developer hosts.
// The forge-dev Dockerfile preinstalls all of them; the host runs L0 only.
export const isContainer =
  existsSync("/workspace/forge") && existsSync("/root/.bun/bin");

// Use as: `containerOnly("test name", () => { ... })`
// On host, the test is skipped with a clear reason in the run output.
// In container, it runs normally.
export const containerOnly = (name: string, fn: () => void | Promise<void>, timeout?: number) => {
  // Use bun:test from the caller's context — exported via top-level test/skip.
  // The actual test function gets imported per-file; this helper just produces
  // the right test-or-skip selector. Callers `import { test }` and use this
  // for the condition only.
  return isContainer
    ? { run: true, label: name }
    : { run: false, label: `${name} (skipped — not in forge-dev container)` };
};
