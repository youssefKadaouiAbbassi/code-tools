import { test as _t, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
const test = (existsSync("/workspace/forge") && existsSync("/root/.bun/bin")) ? _t : _t.skip;
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runForge } from "../harness/run-forge";

function gitInit(dir: string): void {
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  spawnSync("chown", ["-R", "forge:forge", dir]);
}

function readKind(dir: string, parcel: string): string {
  return readFileSync(join(dir, ".forge/kind", `${parcel}.txt`), "utf8").trim();
}

function findParcelKindFile(dir: string): string | null {
  const kindDir = join(dir, ".forge/kind");
  if (!existsSync(kindDir)) return null;
  const files = readdirSync(kindDir).filter((f) => f.endsWith(".txt"));
  return files[0] ?? null;
}

function gateSkippedOrAbsent(dir: string, gate: string, parcel: string): boolean {
  const path = join(dir, ".forge", gate, `${parcel}.json`);
  if (!existsSync(path)) return true;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return data.result === "skip";
  } catch {
    return false;
  }
}

function makeIoTarget(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-l3-routing-io-"));
  spawnSync("chmod", ["-R", "777", dir]);
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: "t-io", version: "0", type: "module",
    scripts: { test: "bun test" },
    dependencies: { express: "^4.18.0" },
    devDependencies: { "fast-check": "^3.0.0", "@types/express": "^4.17.0" },
  }, null, 2));
  mkdirSync(join(dir, "routes"));
  writeFileSync(join(dir, "routes/login.ts"), `import type { Request, Response } from "express";

export function login(req: Request, res: Response): void {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ error: "missing credentials" });
    return;
  }
  res.status(200).json({ accessToken: "stub-access-token", refreshToken: "stub-refresh-token" });
}
`);
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "es2022", module: "esnext", moduleResolution: "bundler", strict: true, esModuleInterop: true },
  }, null, 2));
  spawnSync("bun", ["install"], { cwd: dir });
  gitInit(dir);
  return dir;
}

function makeConfigTarget(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-l3-routing-config-"));
  spawnSync("chmod", ["-R", "777", dir]);
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: "t-config", version: "0", type: "module",
    scripts: { test: "bun test" },
  }, null, 2));
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "esnext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: ["src/**/*"],
  }, null, 2));
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/index.ts"), `export const hello = (): string => "hi";\n`);
  spawnSync("bun", ["install"], { cwd: dir });
  gitInit(dir);
  return dir;
}

function makeInfraTarget(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-l3-routing-infra-"));
  spawnSync("chmod", ["-R", "777", dir]);
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: "t-infra", version: "0", type: "module",
    scripts: { test: "bun test" },
  }, null, 2));
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".github/workflows/deploy.yml"), `name: deploy
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test
  deploy-prod:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "deploying to prod"
`);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/index.ts"), `export const hello = (): string => "hi";\n`);
  spawnSync("bun", ["install"], { cwd: dir });
  gitInit(dir);
  return dir;
}

test("L3.16 io parcel routing — mutation runs, browser skipped", async () => {
  const dir = makeIoTarget();
  try {
    const r = await runForge(
      "add a /refresh route that exchanges refresh token for access token. Run plan + research + council + code + verify phases. Skip ship phase (do NOT open a PR).",
      dir,
      25 * 60_000,
    );

    if (!existsSync(join(dir, ".forge"))) {
      throw new Error(`no .forge/ produced after ${r.durationMs}ms.\nexit:${r.exitCode}\nstdout:${r.stdout.slice(0, 3000)}`);
    }

    const kindFile = findParcelKindFile(dir);
    if (kindFile) {
      const parcel = kindFile.replace(/\.txt$/, "");
      expect(readKind(dir, parcel)).toBe("io");
      expect(gateSkippedOrAbsent(dir, "browser", parcel)).toBe(true);
    }
    // Either way, mutation gate must have run (.forge/mutation/ has at least one json) AND no UI gate artifact.
    const mutationDir = join(dir, ".forge/mutation");
    const browserDir = join(dir, ".forge/browser");
    const mutationCount = existsSync(mutationDir) ? readdirSync(mutationDir).filter((f) => f.endsWith(".json")).length : 0;
    const browserCount = existsSync(browserDir) ? readdirSync(browserDir).filter((f) => f.endsWith(".json") || f.endsWith(".proofshot")).length : 0;
    expect(mutationCount).toBeGreaterThanOrEqual(1);
    expect(browserCount).toBe(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.17 config parcel routing — all gates skipped", async () => {
  const dir = makeConfigTarget();
  try {
    const r = await runForge(
      "tighten tsconfig strict mode (enable noUnusedLocals + noUnusedParameters). Run plan + research + council + code + verify phases. Skip ship phase (do NOT open a PR).",
      dir,
      25 * 60_000,
    );

    if (!existsSync(join(dir, ".forge"))) {
      throw new Error(`no .forge/ produced after ${r.durationMs}ms.\nexit:${r.exitCode}\nstdout:${r.stdout.slice(0, 3000)}`);
    }

    const kindFile = findParcelKindFile(dir);
    if (kindFile) {
      const parcel = kindFile.replace(/\.txt$/, "");
      expect(readKind(dir, parcel)).toBe("config");
      expect(gateSkippedOrAbsent(dir, "mutation", parcel)).toBe(true);
      expect(gateSkippedOrAbsent(dir, "pbt", parcel)).toBe(true);
      expect(gateSkippedOrAbsent(dir, "browser", parcel)).toBe(true);
    } else {
      // Config parcels may legitimately skip derive-kind entirely (nothing to gate).
      // In that case, none of the verify-gate artifact dirs should have anything.
      const empty = (sub: string) => !existsSync(join(dir, ".forge", sub)) || readdirSync(join(dir, ".forge", sub)).length === 0;
      expect(empty("mutation") && empty("pbt") && empty("browser")).toBe(true);
      expect(r.stdout.toLowerCase()).toMatch(/config|tsconfig|skip/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.18 infra parcel routing — all gates skipped", async () => {
  const dir = makeInfraTarget();
  try {
    const r = await runForge(
      "add a staging deploy step that runs after the test job. Run plan + research + council + code + verify phases. Skip ship phase (do NOT open a PR).",
      dir,
      25 * 60_000,
    );

    if (!existsSync(join(dir, ".forge"))) {
      throw new Error(`no .forge/ produced after ${r.durationMs}ms.\nexit:${r.exitCode}\nstdout:${r.stdout.slice(0, 3000)}`);
    }

    const kindFile = findParcelKindFile(dir);
    if (!kindFile) throw new Error(`no .forge/kind/*.txt produced.\nstdout:${r.stdout.slice(0, 3000)}`);
    const parcel = kindFile.replace(/\.txt$/, "");

    expect(readKind(dir, parcel)).toBe("infra");
    expect(gateSkippedOrAbsent(dir, "mutation", parcel)).toBe(true);
    expect(gateSkippedOrAbsent(dir, "pbt", parcel)).toBe(true);
    expect(gateSkippedOrAbsent(dir, "browser", parcel)).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);
