import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, chmod, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROJECT_DIR = join(import.meta.dir, "..", "..");
const REGISTRY_PLUGINS_PATH = join(PROJECT_DIR, "src", "registry", "plugins.ts");
const JSON_MARKER = "<<JSON>>";

type FakeClaudeBehavior = {
  installExitCode?: number;
  marketplaceAddExitCode?: number;
  missingBinary?: boolean;
};

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function writeFakeClaude(
  fakeBin: string,
  callsLog: string,
  behavior: FakeClaudeBehavior,
): Promise<void> {
  const installExit = behavior.installExitCode ?? 0;
  const marketplaceExit = behavior.marketplaceAddExitCode ?? 0;
  const script = [
    "#!/usr/bin/env bash",
    `printf '%s\\n' "$*" >> ${shellEscape(callsLog)}`,
    `if [[ "$1" == "plugin" && "$2" == "install" ]]; then exit ${installExit}; fi`,
    `if [[ "$1" == "plugin" && "$2" == "marketplace" && "$3" == "add" ]]; then exit ${marketplaceExit}; fi`,
    "exit 0",
    "",
  ].join("\n");
  await writeFile(join(fakeBin, "claude"), script);
  await chmod(join(fakeBin, "claude"), 0o755);
}

async function runHarness(
  sandbox: string,
  body: string,
  behavior: FakeClaudeBehavior,
): Promise<{ json: string; calls: string[][] }> {
  const fakeBin = join(sandbox, "bin");
  const callsLog = join(sandbox, "calls.log");
  const harness = join(sandbox, "harness.ts");

  await mkdir(fakeBin, { recursive: true });
  if (!behavior.missingBinary) {
    await writeFakeClaude(fakeBin, callsLog, behavior);
  }
  await writeFile(callsLog, "");

  const harnessScript = `
    ${body}
    process.stdout.write(${JSON.stringify(JSON_MARKER)} + JSON.stringify(__result));
  `;
  await writeFile(harness, harnessScript);

  const subPath = behavior.missingBinary ? `/usr/bin:/bin` : `${fakeBin}:/usr/bin:/bin`;

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
  const markerIdx = stdout.indexOf(JSON_MARKER);
  const json = markerIdx === -1 ? "" : stdout.slice(markerIdx + JSON_MARKER.length);

  const logText = existsSync(callsLog) ? await readFile(callsLog, "utf8") : "";
  const calls = logText
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/).filter(Boolean));

  return { json, calls };
}

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "yka-registry-plugins-"));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe("registry/plugins installPlugin", () => {
  test("dry-run emits skipped status without calling claude", async () => {
    const body = `
      import { installPlugin } from ${JSON.stringify(REGISTRY_PLUGINS_PATH)};
      const __result = await installPlugin("foo", "my-mkt", true);
    `;
    const { json, calls } = await runHarness(sandbox, body, {});
    const result = JSON.parse(json);
    expect(result.status).toBe("skipped");
    expect(result.message).toContain("[dry-run]");
    expect(result.message).toContain("foo@my-mkt");
    expect(calls.length).toBe(0);
  });

  test("missing claude binary returns skipped", async () => {
    const body = `
      import { installPlugin } from ${JSON.stringify(REGISTRY_PLUGINS_PATH)};
      const __result = await installPlugin("foo", "mkt", false);
    `;
    const { json } = await runHarness(sandbox, body, { missingBinary: true });
    const result = JSON.parse(json);
    expect(result.status).toBe("skipped");
    expect(result.message).toContain("Claude Code CLI not found");
    expect(result.verifyPassed).toBe(false);
  });

  test("success path installs plugin and returns installed status", async () => {
    const body = `
      import { installPlugin } from ${JSON.stringify(REGISTRY_PLUGINS_PATH)};
      const __result = await installPlugin("feature-dev", "official", false);
    `;
    const { json, calls } = await runHarness(sandbox, body, { installExitCode: 0 });
    const result = JSON.parse(json);
    expect(result.status).toBe("installed");
    expect(result.verifyPassed).toBe(true);
    const installCall = calls.find((c) => c[0] === "plugin" && c[1] === "install");
    expect(installCall).toBeDefined();
    expect(installCall).toContain("feature-dev@official");
  });

  test("non-zero exit returns failed with exit code in message", async () => {
    const body = `
      import { installPlugin } from ${JSON.stringify(REGISTRY_PLUGINS_PATH)};
      const __result = await installPlugin("broken", "mkt", false);
    `;
    const { json } = await runHarness(sandbox, body, { installExitCode: 3 });
    const result = JSON.parse(json);
    expect(result.status).toBe("failed");
    expect(result.message).toContain("exited 3");
    expect(result.verifyPassed).toBe(false);
  });
});

describe("registry/plugins ensureMarketplace", () => {
  test("already-registered marketplace short-circuits with ok:true", async () => {
    const fakeClaudeDir = join(sandbox, ".claude");
    const pluginsDir = join(fakeClaudeDir, "plugins");
    await mkdir(pluginsDir, { recursive: true });
    await writeFile(
      join(pluginsDir, "known_marketplaces.json"),
      JSON.stringify({ marketplaces: { "already-there": {} } }),
    );

    const body = `
      import { ensureMarketplace } from ${JSON.stringify(REGISTRY_PLUGINS_PATH)};
      const env = { claudeDir: ${JSON.stringify(fakeClaudeDir)} };
      const __result = await ensureMarketplace(env, "owner/slug", "already-there");
    `;
    const { json, calls } = await runHarness(sandbox, body, {});
    const result = JSON.parse(json);
    expect(result.ok).toBe(true);
    expect(calls.filter((c) => c[0] === "plugin" && c[1] === "marketplace").length).toBe(0);
  });

  test("missing marketplace triggers claude plugin marketplace add", async () => {
    const fakeClaudeDir = join(sandbox, ".claude");
    const pluginsDir = join(fakeClaudeDir, "plugins");
    await mkdir(pluginsDir, { recursive: true });

    const body = `
      import { ensureMarketplace } from ${JSON.stringify(REGISTRY_PLUGINS_PATH)};
      const env = { claudeDir: ${JSON.stringify(fakeClaudeDir)} };
      const __result = await ensureMarketplace(env, "owner/new-slug", "new-mkt");
    `;
    const { json, calls } = await runHarness(sandbox, body, {});
    const result = JSON.parse(json);
    expect(result.ok).toBe(true);
    const mktCall = calls.find((c) => c[0] === "plugin" && c[1] === "marketplace" && c[2] === "add");
    expect(mktCall).toBeDefined();
    expect(mktCall).toContain("owner/new-slug");
  });

  test("marketplace add failure surfaces exit code", async () => {
    const fakeClaudeDir = join(sandbox, ".claude");

    const body = `
      import { ensureMarketplace } from ${JSON.stringify(REGISTRY_PLUGINS_PATH)};
      const env = { claudeDir: ${JSON.stringify(fakeClaudeDir)} };
      const __result = await ensureMarketplace(env, "owner/slug", "mkt");
    `;
    const { json } = await runHarness(sandbox, body, { marketplaceAddExitCode: 4 });
    const result = JSON.parse(json);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(4);
  });
});

describe("registry/plugins listInstalledPlugins", () => {
  test("returns keys from installed_plugins.json", async () => {
    const fakeClaudeDir = join(sandbox, ".claude");
    const pluginsDir = join(fakeClaudeDir, "plugins");
    await mkdir(pluginsDir, { recursive: true });
    await writeFile(
      join(pluginsDir, "installed_plugins.json"),
      JSON.stringify({ plugins: { "a@mkt1": {}, "b@mkt2": {} } }),
    );

    const body = `
      import { listInstalledPlugins, clearInstalledPluginsCache } from ${JSON.stringify(REGISTRY_PLUGINS_PATH)};
      clearInstalledPluginsCache();
      const env = { claudeDir: ${JSON.stringify(fakeClaudeDir)} };
      const set = await listInstalledPlugins(env);
      const __result = [...set].sort();
    `;
    const { json } = await runHarness(sandbox, body, {});
    expect(JSON.parse(json)).toEqual(["a@mkt1", "b@mkt2"]);
  });

  test("missing file yields empty set", async () => {
    const fakeClaudeDir = join(sandbox, ".claude");

    const body = `
      import { listInstalledPlugins, clearInstalledPluginsCache } from ${JSON.stringify(REGISTRY_PLUGINS_PATH)};
      clearInstalledPluginsCache();
      const env = { claudeDir: ${JSON.stringify(fakeClaudeDir)} };
      const set = await listInstalledPlugins(env);
      const __result = [...set];
    `;
    const { json } = await runHarness(sandbox, body, {});
    expect(JSON.parse(json)).toEqual([]);
  });

  test("memoizes within TTL window (file rewrite not reflected in second call)", async () => {
    const fakeClaudeDir = join(sandbox, ".claude");
    const pluginsDir = join(fakeClaudeDir, "plugins");
    await mkdir(pluginsDir, { recursive: true });
    const manifestPath = join(pluginsDir, "installed_plugins.json");
    await writeFile(manifestPath, JSON.stringify({ plugins: { "a@mkt": {} } }));

    const body = `
      import { listInstalledPlugins, clearInstalledPluginsCache } from ${JSON.stringify(REGISTRY_PLUGINS_PATH)};
      import { writeFile } from "node:fs/promises";
      clearInstalledPluginsCache();
      const env = { claudeDir: ${JSON.stringify(fakeClaudeDir)} };
      const first = await listInstalledPlugins(env);
      await writeFile(${JSON.stringify(manifestPath)}, JSON.stringify({ plugins: { "x@y": {}, "a@mkt": {} } }));
      const second = await listInstalledPlugins(env);
      const __result = { first: [...first].sort(), second: [...second].sort() };
    `;
    const { json } = await runHarness(sandbox, body, {});
    const { first, second } = JSON.parse(json);
    expect(first).toEqual(["a@mkt"]);
    expect(second).toEqual(["a@mkt"]);
  });
});
