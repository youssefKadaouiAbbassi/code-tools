import { existsSync, readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

interface StatusInput {
  workspace?: { current_dir?: string };
  cwd?: string;
  model?: { display_name?: string; id?: string };
}

export async function run(_args: string[]): Promise<void> {
  let input: StatusInput = {};
  try {
    const stdin = await Bun.stdin.text();
    if (stdin) input = JSON.parse(stdin);
  } catch {}

  const cwd = input.workspace?.current_dir ?? input.cwd ?? process.cwd();
  const model = input.model?.display_name ?? input.model?.id ?? "claude";

  const forgeDir = join(cwd, ".forge");
  let phase = "—";
  const phaseFile = join(forgeDir, "phase");
  if (existsSync(phaseFile)) phase = readFileSync(phaseFile, "utf8").trim() || "—";

  let parcel = "";
  const dagPath = join(forgeDir, "dag.json");
  if (existsSync(dagPath)) {
    try {
      const dag = JSON.parse(readFileSync(dagPath, "utf8"));
      parcel = dag.current_parcel ?? "";
    } catch {}
  }

  let mut = "";
  const mutDir = join(forgeDir, "mutation");
  if (existsSync(mutDir)) {
    try {
      const files = readdirSync(mutDir).filter((f) => f.endsWith(".json"));
      if (files.length) {
        const latest = files.map((f) => ({ f, t: statSync(join(mutDir, f)).mtimeMs }))
          .sort((a, b) => b.t - a.t)[0];
        const data = JSON.parse(readFileSync(join(mutDir, latest.f), "utf8"));
        if (typeof data.score === "number") mut = data.score.toFixed(2);
      }
    } catch {}
  }

  let branch = "";
  const r = spawnSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", timeout: 1_000 });
  if (r.status === 0) branch = r.stdout.trim();

  const parts = [`🔨 forge:${phase}`];
  if (parcel) parts.push(parcel);
  if (mut) parts.push(`mut=${mut}`);
  parts.push(model);
  if (branch) parts.push(branch);
  process.stdout.write(parts.join(" | "));
}
