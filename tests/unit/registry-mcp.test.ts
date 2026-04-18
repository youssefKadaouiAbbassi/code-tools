import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, chmod, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROJECT_DIR = join(import.meta.dir, "..", "..");
const REGISTRY_MCP_PATH = join(PROJECT_DIR, "src", "registry", "mcp.ts");

type FakeClaudeBehavior = {
  addExitCode?: number;
  listExitCode?: number;
  listOutput?: string;
  missingBinary?: boolean;
};

type RunResult = {
  registerResult: boolean;
  calls: string[][];
  stdout: string;
  stderr: string;
};

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runRegisterMcp(
  name: string,
  specJson: string,
  opts: { scope?: "user" | "local" | "project" } | undefined,
  behavior: FakeClaudeBehavior,
  sandbox: string,
): Promise<RunResult> {
  const fakeBin = join(sandbox, "bin");
  const callsLog = join(sandbox, "calls.log");
  const harness = join(sandbox, "harness.ts");

  if (!behavior.missingBinary) {
    const addExit = behavior.addExitCode ?? 0;
    const listExit = behavior.listExitCode ?? 0;
    const listOutput = behavior.listOutput ?? "";
    const script = [
      "#!/usr/bin/env bash",
      `printf '%s\\n' "$*" >> ${shellEscape(callsLog)}`,
      "sub=\"${2:-}\"",
      `if [[ "$1" == "mcp" && "$sub" == "add" ]]; then exit ${addExit}; fi`,
      `if [[ "$1" == "mcp" && "$sub" == "list" ]]; then`,
      `  printf '%s' ${shellEscape(listOutput)}`,
      `  exit ${listExit}`,
      "fi",
      "exit 0",
      "",
    ].join("\n");
    await writeFile(join(fakeBin, "claude"), script);
    await chmod(join(fakeBin, "claude"), 0o755);
  }

  await writeFile(callsLog, "");

  const harnessScript = `
    import { registerMcp } from ${JSON.stringify(REGISTRY_MCP_PATH)};
    const spec = ${specJson};
    const opts = ${JSON.stringify(opts ?? {})};
    const result = await registerMcp(${JSON.stringify(name)}, spec, opts);
    process.stdout.write(JSON.stringify({ registerResult: result }));
  `;
  await writeFile(harness, harnessScript);

  const subPath = behavior.missingBinary
    ? `/usr/bin:/bin`
    : `${fakeBin}:/usr/bin:/bin`;

  const proc = Bun.spawn([process.execPath, "run", harness], {
    env: { ...process.env, PATH: subPath },
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  if (exitCode !== 0) {
    throw new Error(`harness exit ${exitCode}\nstderr: ${stderr}\nstdout: ${stdout}`);
  }

  const parsed = JSON.parse(stdout) as { registerResult: boolean };
  const logText = existsSync(callsLog) ? await readFile(callsLog, "utf8") : "";
  const calls = logText
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/).filter(Boolean));

  return { registerResult: parsed.registerResult, calls, stdout, stderr };
}

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "yka-registry-mcp-"));
  await writeFile(join(sandbox, ".gitkeep"), "");
  const fakeBin = join(sandbox, "bin");
  await Bun.$`mkdir -p ${fakeBin}`.quiet();
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

function addCall(calls: string[][]): string[] | undefined {
  return calls.find((c) => c[0] === "mcp" && c[1] === "add");
}

function removeCall(calls: string[][]): string[] | undefined {
  return calls.find((c) => c[0] === "mcp" && c[1] === "remove");
}

function listCall(calls: string[][]): string[] | undefined {
  return calls.find((c) => c[0] === "mcp" && c[1] === "list");
}

describe("registry/mcp registerMcp — claude binary absent", () => {
  test("requireClaude false short-circuits; no shell call", async () => {
    const result = await runRegisterMcp(
      "any",
      JSON.stringify({ transport: "stdio", command: "echo" }),
      undefined,
      { missingBinary: true },
      sandbox,
    );
    expect(result.registerResult).toBe(false);
    expect(result.calls.length).toBe(0);
  });
});

describe("registry/mcp registerMcp — stdio transport", () => {
  test("remove → add → list triplet with user scope by default", async () => {
    const result = await runRegisterMcp(
      "my-mcp",
      JSON.stringify({ transport: "stdio", command: "echo", args: ["hello"] }),
      undefined,
      { listOutput: "foo:\nmy-mcp: stdio echo\nbar:\n" },
      sandbox,
    );
    expect(result.registerResult).toBe(true);
    expect(result.calls.length).toBe(3);

    const rem = removeCall(result.calls);
    const add = addCall(result.calls);
    const list = listCall(result.calls);
    expect(rem).toBeDefined();
    expect(add).toBeDefined();
    expect(list).toBeDefined();

    expect(rem!.slice(0, 3)).toEqual(["mcp", "remove", "my-mcp"]);
    expect(rem).toContain("-s");
    expect(rem).toContain("user");

    expect(add!.slice(0, 3)).toEqual(["mcp", "add", "my-mcp"]);
    expect(add).toContain("-s");
    expect(add).toContain("user");
    expect(add).toContain("--");
    expect(add).toContain("echo");
    expect(add).toContain("hello");

    expect(list).toEqual(["mcp", "list"]);
  });

  test("project scope forwarded via -s project", async () => {
    const result = await runRegisterMcp(
      "proj-mcp",
      JSON.stringify({ transport: "stdio", command: "runner" }),
      { scope: "project" },
      { listOutput: "proj-mcp: stdio runner\n" },
      sandbox,
    );
    expect(result.registerResult).toBe(true);
    const add = addCall(result.calls)!;
    const scopeIdx = add.indexOf("-s");
    expect(add[scopeIdx + 1]).toBe("project");
  });

  test("env map emitted as -e KEY=VALUE flags", async () => {
    const result = await runRegisterMcp(
      "env-mcp",
      JSON.stringify({
        transport: "stdio",
        command: "server",
        env: { API_KEY: "secret", OTHER: "value" },
      }),
      undefined,
      { listOutput: "env-mcp: stdio server\n" },
      sandbox,
    );
    expect(result.registerResult).toBe(true);
    const add = addCall(result.calls)!;
    const envPairs: string[] = [];
    for (let i = 0; i < add.length - 1; i++) {
      if (add[i] === "-e") envPairs.push(add[i + 1]);
    }
    expect(envPairs).toContain("API_KEY=secret");
    expect(envPairs).toContain("OTHER=value");
  });
});

describe("registry/mcp registerMcp — http transport", () => {
  test("emits --transport http and headers via -H", async () => {
    const result = await runRegisterMcp(
      "http-mcp",
      JSON.stringify({
        transport: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer tok", "X-Extra": "one" },
      }),
      undefined,
      { listOutput: "http-mcp: https://example.com/mcp (HTTP)\n" },
      sandbox,
    );
    expect(result.registerResult).toBe(true);
    const add = addCall(result.calls)!;
    const transportIdx = add.indexOf("--transport");
    expect(add[transportIdx + 1]).toBe("http");
    expect(add).toContain("https://example.com/mcp");
  });
});

describe("registry/mcp registerMcp — failure modes", () => {
  test("add exits non-zero → returns false, skips list", async () => {
    const result = await runRegisterMcp(
      "broken",
      JSON.stringify({ transport: "stdio", command: "x" }),
      undefined,
      { addExitCode: 1 },
      sandbox,
    );
    expect(result.registerResult).toBe(false);
    expect(listCall(result.calls)).toBeUndefined();
  });

  test("list exits non-zero → returns false", async () => {
    const result = await runRegisterMcp(
      "listfail",
      JSON.stringify({ transport: "stdio", command: "x" }),
      undefined,
      { listExitCode: 2 },
      sandbox,
    );
    expect(result.registerResult).toBe(false);
  });

  test("list output missing registered name → returns false", async () => {
    const result = await runRegisterMcp(
      "missing-mcp",
      JSON.stringify({ transport: "stdio", command: "x" }),
      undefined,
      { listOutput: "other-mcp: stdio foo\n" },
      sandbox,
    );
    expect(result.registerResult).toBe(false);
  });
});
