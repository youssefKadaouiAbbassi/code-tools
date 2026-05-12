import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const FORGE = resolve(import.meta.dir, "..", "..", "plugin");

function frontmatter(p: string): { fm: Record<string, string>; body: string } {
  const text = readFileSync(p, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`no frontmatter in ${p}`);
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return { fm, body: m[2] };
}

test("L2.20 — forge-lead agent declares opus model + tier table + ship-blocking gates", () => {
  const { fm, body } = frontmatter(join(FORGE, "agents", "forge-lead.md"));
  expect(fm.name).toBe("forge-lead");
  expect(fm.model).toBe("opus");
  expect(fm.description.length).toBeGreaterThan(20);

  expect(body.toLowerCase()).toMatch(/every spawn.*opus|model:\s*opus|all on opus|opus.*no exceptions/);

  for (const gate of ["mutation-gate", "pbt-verify", "browser-verify", "tdd-guard", "protect-mcp", "stub-warn"]) {
    expect(body.toLowerCase()).toContain(gate);
  }
  expect(body.toLowerCase()).toMatch(/jj op restore|jj.*restore/);
  expect(body.toLowerCase()).toMatch(/dag cycle|unsatisfiable/);
});

test("L2.21 — pbt-verifier agent body declares per-stack runners + anti-property guard", () => {
  const { fm, body } = frontmatter(join(FORGE, "agents", "pbt-verifier.md"));
  expect(fm.name).toBe("pbt-verifier");
  expect(fm.model).toBe("opus");
  expect(body.toLowerCase()).toMatch(/anti-property|REJECTED/i);
  expect(body.toLowerCase()).toMatch(/shrink/);
});

test("L2.22a — mutation-orchestrator agent body declares 0.80 threshold floor", () => {
  const { fm, body } = frontmatter(join(FORGE, "agents", "mutation-orchestrator.md"));
  expect(fm.name).toBe("mutation-orchestrator");
  expect(fm.model).toBe("opus");
  expect(body).toMatch(/0\.80/);
  expect(body.toLowerCase()).toMatch(/never.*adjust|floor/);
});

test("L2.22b — browser-driver agent body locks bundled-Chromium-headless (not host browser)", () => {
  const { fm, body } = frontmatter(join(FORGE, "agents", "browser-driver.md"));
  expect(fm.name).toBe("browser-driver");
  expect(fm.model).toBe("opus");
  expect(body.toLowerCase()).toMatch(/bundled chromium|headless/);
  expect(body.toLowerCase()).toMatch(/never\s+`channel:\s*"chrome"`|never `connectovercdp`|never\s+connectovercdp/);
});

test("L2.5 — stub-warn hookify rule fires on idioms but not real impls", () => {
  const rule = readFileSync(join(FORGE, "hookify-rules", "forge-stub-warn.md"), "utf8");
  const m = rule.split("\n").find((l) => l.includes("pattern:"));
  expect(m).toBeTruthy();
  const pat = new RegExp(m!.match(/pattern:\s*(.+)/)![1].trim());

  for (const stub of [
    'throw new Error("TODO: implement")',
    'throw new Error("not implemented")',
    "todo!()",
    "unimplemented!()",
    "raise NotImplementedError",
  ]) expect(pat.test(stub)).toBe(true);

  for (const real of [
    "return a + b;",
    "const x = await fetch(url);",
    "if (a < 0) return -1;",
  ]) expect(pat.test(real)).toBe(false);
});

test("L2.6 — Cedar policy contains required forge-specific forbid rules", () => {
  const cedar = readFileSync(join(FORGE, "policy.cedar"), "utf8");
  expect(cedar).toMatch(/forbid[\s\S]*?\.forge\/receipts/);
  expect(cedar).toMatch(/forbid[\s\S]*?forge-meta/);
});
