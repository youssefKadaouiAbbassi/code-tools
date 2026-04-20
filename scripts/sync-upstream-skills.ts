#!/usr/bin/env bun
import { $ } from "bun";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = join(import.meta.dir, "..", "skills");
const DRIFT_DIR = join(import.meta.dir, "..", ".dev", "upstream-skill-drift");

type UpstreamManifest = {
  source_repo: string;
  source_path: string;
  source_branch: string;
  last_checked_sha: string;
  last_checked_at: string;
  raw_url: string;
  notes?: string;
};

type DriftResult = {
  skill: string;
  currentSha: string;
  upstreamSha: string;
  drifted: boolean;
  diffPath?: string;
  error?: string;
};

async function fetchUpstreamSha(manifest: UpstreamManifest): Promise<string> {
  const ref = manifest.source_branch;
  const res = await $`gh api repos/${manifest.source_repo}/commits/${ref} --jq .sha`.quiet().nothrow();
  if (res.exitCode !== 0) throw new Error(`gh api failed: exit ${res.exitCode}`);
  return res.text().trim();
}

async function fetchUpstreamContent(manifest: UpstreamManifest): Promise<string> {
  const res = await fetch(manifest.raw_url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`fetch ${manifest.raw_url} → HTTP ${res.status}`);
  return await res.text();
}

async function diffSkillAgainstUpstream(skillName: string): Promise<DriftResult> {
  const manifestPath = join(SKILLS_DIR, skillName, ".upstream.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as UpstreamManifest;

  let upstreamSha: string;
  try {
    upstreamSha = await fetchUpstreamSha(manifest);
  } catch (err) {
    return {
      skill: skillName,
      currentSha: manifest.last_checked_sha,
      upstreamSha: "?",
      drifted: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (upstreamSha === manifest.last_checked_sha) {
    return { skill: skillName, currentSha: manifest.last_checked_sha, upstreamSha, drifted: false };
  }

  let upstreamContent: string;
  try {
    upstreamContent = await fetchUpstreamContent(manifest);
  } catch (err) {
    return {
      skill: skillName,
      currentSha: manifest.last_checked_sha,
      upstreamSha,
      drifted: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  await mkdir(DRIFT_DIR, { recursive: true });
  const driftPath = join(DRIFT_DIR, `${skillName}.upstream.md`);
  await writeFile(driftPath, upstreamContent);

  return { skill: skillName, currentSha: manifest.last_checked_sha, upstreamSha, drifted: true, diffPath: driftPath };
}

async function findPortedSkills(): Promise<string[]> {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (existsSync(join(SKILLS_DIR, e.name, ".upstream.json"))) out.push(e.name);
  }
  return out.sort();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const quiet = args.includes("--quiet");
  const skills = await findPortedSkills();

  if (skills.length === 0) {
    if (!quiet) console.log("No ported skills found (no skill has a .upstream.json manifest).");
    return;
  }

  const results: DriftResult[] = [];
  for (const skill of skills) {
    const r = await diffSkillAgainstUpstream(skill);
    results.push(r);
  }

  const drifted = results.filter((r) => r.drifted);
  const errored = results.filter((r) => r.error);

  if (!quiet) {
    console.log(`Checked ${results.length} ported skill(s):`);
    for (const r of results) {
      const flag = r.error ? "⚠ " : r.drifted ? "↻ " : "✓ ";
      console.log(`  ${flag}${r.skill} @ ${r.currentSha.slice(0, 7)} → upstream ${r.upstreamSha.slice(0, 7)}${r.error ? ` (error: ${r.error})` : r.drifted ? ` (drift → ${r.diffPath})` : ""}`);
    }
    if (drifted.length > 0) {
      console.log(`\n${drifted.length} skill(s) drifted from upstream. Review fetched files under .dev/upstream-skill-drift/ and decide whether to port.`);
      console.log(`To accept upstream as the new baseline, bump last_checked_sha in the skill's .upstream.json.`);
    }
    if (errored.length > 0) {
      console.log(`\n${errored.length} skill(s) could not be checked (network / gh auth / missing file).`);
    }
  }

  process.exit(drifted.length > 0 ? 2 : errored.length > 0 ? 3 : 0);
}

main().catch((err) => {
  console.error(`sync-upstream-skills failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
