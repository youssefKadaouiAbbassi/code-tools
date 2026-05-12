import { test, expect } from "bun:test";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runClaude } from "../harness/run-claude";

function makeDag(parcels: Array<{ id: string; claim: string; paths: string[] }>): string {
  return JSON.stringify({ parcels: parcels.map((p) => ({ ...p, deps: [] })) });
}

const cases: Array<{ id: string; claim: string; paths: string[]; want: RegExp }> = [
  { id: "p-pure", claim: "add subtract(a,b)",     paths: ["src/math.ts"],                       want: /pure-fn/ },
  { id: "p-ui",   claim: "add LoginForm component", paths: ["components/LoginForm.tsx"],         want: /\bui\b/ },
  { id: "p-io",   claim: "add /refresh endpoint",   paths: ["routes/refresh.ts"],                want: /\bio\b/ },
  { id: "p-cfg",  claim: "tighten tsconfig",        paths: ["tsconfig.json"],                    want: /config/ },
  { id: "p-inf",  claim: "add staging deploy",      paths: [".github/workflows/deploy.yml"],     want: /infra/ },
];

for (const c of cases) {
  test(`L2.1 — derive-kind classifies ${c.id} as ${c.want.source}`, async () => {
    const dir = mkdtempSync(join(tmpdir(), `forge-dk-${c.id}-`));
    try {
      mkdirSync(join(dir, ".forge"), { recursive: true });
      writeFileSync(join(dir, ".forge/dag.json"), makeDag([c]));
      const r = await runClaude(
        `Activate forge:derive-kind to classify parcel "${c.id}". Read .forge/dag.json. Apply the rules in the skill body. Output ONLY the kind label on a single line. No explanation, no markdown, just the label.`,
        dir,
        { model: "opus", timeoutMs: 60_000 },
      );
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toMatch(c.want);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120_000);
}
