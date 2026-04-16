/** Guardrail tests enforcing Principle 4: single scope owner.
 *  - Zero homedir() calls outside resolveClaudeDir/rewriteEnvForScope.
 *  - Zero join(.., ".claude") path literals outside install-mode.ts.
 */
import { describe, test, expect } from "bun:test";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const SRC_DIR = join(import.meta.dir, "..", "..", "src");

async function walkTs(dir: string, acc: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walkTs(full, acc);
    } else if (e.isFile() && e.name.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

async function readLines(file: string): Promise<string[]> {
  const raw = await fs.readFile(file, "utf-8");
  return raw.split("\n");
}

// Files that are allowed to own scope resolution primitives.
const SCOPE_OWNERS = new Set([
  "install-mode.ts",
  // restore.ts uses homedir() only for legacy-backup fallback when manifest lacks targetDir.
  // This is the documented exception per Phase 5; destructive restore still goes through
  // the user confirmation flow before touching ~/.claude.
  "restore.ts",
]);

// Files where "/.claude" literals are acceptable (user-facing messages, help text).
const MESSAGE_ALLOWED = new Set(["setup.ts", "setup.ts (bin)"]);

describe("scope isolation guardrails", () => {
  test("homedir() only called in install-mode.ts resolveClaudeDir", async () => {
    const files = await walkTs(SRC_DIR);
    const offenders: { file: string; line: number; text: string }[] = [];

    for (const file of files) {
      const base = file.split("/").pop()!;
      if (SCOPE_OWNERS.has(base)) continue;

      const lines = await readLines(file);
      lines.forEach((text, idx) => {
        // Skip comments and doc lines
        const trimmed = text.trimStart();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;

        if (/\bhomedir\(\)/.test(text)) {
          offenders.push({ file, line: idx + 1, text: text.trim() });
        }
      });
    }

    if (offenders.length > 0) {
      const msg = offenders
        .map((o) => `  ${o.file}:${o.line}: ${o.text}`)
        .join("\n");
      throw new Error(
        `homedir() found outside scope-owner files:\n${msg}\n\nAdd the file to SCOPE_OWNERS if intentional, or refactor to use resolveClaudeDir.`,
      );
    }
    expect(offenders).toEqual([]);
  });

  test("installPrimordial and category installers receive env.claudeDir (no direct .claude path joins)", async () => {
    const files = await walkTs(SRC_DIR);
    const offenders: { file: string; line: number; text: string }[] = [];

    // Pattern: join(..., ".claude", ...) or join(..., ".claude") that isn't in an allowed file
    const joinClaudeRegex = /join\s*\([^)]*["']\.claude["']/;

    for (const file of files) {
      const base = file.split("/").pop()!;
      if (base === "install-mode.ts") continue; // owner
      if (base === "backup.ts" && file.includes("/utils/")) continue; // utils/backup.ts has internal joins on claudeDir
      if (base === "restore.ts") continue; // consumes homedir() only in non-destructive resolveLegacyTargetDir
      if (base === "detect.ts") continue; // claudeDir field is initialized here

      const lines = await readLines(file);
      lines.forEach((text, idx) => {
        const trimmed = text.trimStart();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        if (joinClaudeRegex.test(text)) {
          offenders.push({ file, line: idx + 1, text: text.trim() });
        }
      });
    }

    if (offenders.length > 0) {
      const msg = offenders
        .map((o) => `  ${o.file}:${o.line}: ${o.text}`)
        .join("\n");
      throw new Error(
        `join(.., ".claude") literals found outside scope-owner files:\n${msg}`,
      );
    }
    expect(offenders).toEqual([]);
  });
});

describe("module collision guardrails", () => {
  test("exactly one export of restoreFromBackup in src/", async () => {
    const files = await walkTs(SRC_DIR);
    const hits: { file: string; line: number }[] = [];

    for (const file of files) {
      const lines = await readLines(file);
      lines.forEach((text, idx) => {
        if (/export\s+(async\s+)?function\s+restoreFromBackup\b/.test(text)) {
          hits.push({ file, line: idx + 1 });
        }
      });
    }

    expect(hits.length).toBe(1);
    expect(hits[0].file).toMatch(/utils\/backup\.ts$/);
  });

  test("exactly one export of restoreFromPartialManifest (the renamed legacy export)", async () => {
    const files = await walkTs(SRC_DIR);
    const hits: { file: string; line: number }[] = [];

    for (const file of files) {
      const lines = await readLines(file);
      lines.forEach((text, idx) => {
        if (/export\s+(async\s+)?function\s+restoreFromPartialManifest\b/.test(text)) {
          hits.push({ file, line: idx + 1 });
        }
      });
    }

    expect(hits.length).toBe(1);
    expect(hits[0].file).toMatch(/\/backup\.ts$/);
    expect(hits[0].file).not.toMatch(/utils\//);
  });
});

describe("restore command wiring", () => {
  test("src/commands/restore.ts no longer prints 'not yet implemented'", async () => {
    const content = await fs.readFile(
      join(SRC_DIR, "commands", "restore.ts"),
      "utf-8",
    );
    expect(content).not.toMatch(/not yet implemented/);
    expect(content).toMatch(/runRestore/);
  });
});
