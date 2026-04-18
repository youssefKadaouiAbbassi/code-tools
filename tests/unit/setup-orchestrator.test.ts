import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const FIXTURE = join(REPO_ROOT, "tests", "fixtures", "setup-dry-run-core.txt");

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(stdout: string, homeDir: string, repoRoot: string): string {
  return stdout
    .replace(new RegExp(escapeRegex(repoRoot), "g"), "$REPO")
    .replace(new RegExp(escapeRegex(homeDir), "g"), "$HOME")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z/g, "<TS>")
    .replace(/\.(zshrc|bashrc|config\/fish\/config\.fish)/g, ".$SHELLRC")
    .replace(/shell: \w+/g, "shell: $SHELL")
    .replace(/OS: \w+ \(\w+\)/, "OS: $OS ($ARCH)")
    .replace(/pkg: \w+/, "pkg: $PKGMGR")
    .replace(/Verification: \d+ passed, \d+ failed, \d+ skipped/, "Verification: <N> passed, <N> failed, <N> skipped")
    .replace(/\[\d+\.\d+ms\]/g, "[<MS>]")
    .split("\n")
    .filter((line) => !/^Warning: existing install detected/.test(line))
    .join("\n")
    .trim();
}

async function runDryRun(): Promise<string> {
  const proc = Bun.spawn(["bun", "run", "bin/setup.ts", "--dry-run", "--non-interactive", "--tier=core"], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return out + err;
}

describe("setup --dry-run --non-interactive --tier=core", () => {
  test("emits the expected normalized operations (golden snapshot)", async () => {
    const raw = await runDryRun();
    const normalized = normalize(raw, process.env.HOME ?? "", REPO_ROOT);

    expect(existsSync(FIXTURE)).toBe(true);
    const expected = readFileSync(FIXTURE, "utf-8").trim();
    expect(normalized).toBe(expected);
  }, 30_000);
});
