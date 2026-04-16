import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";

// Third-party skills installed from skills.sh (https://skills.sh) — the open
// agent-skills registry (~90k skills, 1.1M installs on `find-skills` alone).
// Format: `<owner>/<repo>@<skill>`. `npx skills add` copies into
// `~/.agents/skills/<skill>/` and symlinks into `~/.claude/skills/` so Claude
// Code auto-discovers them. `npx skills update` refreshes in place — no
// marketplace / plugin reinstall churn.
//
// Why not claude-plugins: for third-party skills that only ship a SKILL.md
// (no hooks, no MCPs, no commands), the plugin system adds unnecessary cycles.
// skills.sh is the lightest channel.
const SKILLS_SH_PACKAGES: Array<{ source: string; skill?: string; why: string }> = [
  {
    source: "vercel-labs/skills",
    skill: "find-skills",
    why: "Discovery skill (1.1M installs) — Claude uses this to search skills.sh for ready-made solutions before writing custom logic",
  },
  {
    source: "juliusbrussee/caveman",
    why: "Terse output mode + compress tool. 5 skills (caveman, caveman-commit, caveman-review, caveman-help, caveman-compress). Cuts 65-75% of output tokens",
  },
  {
    source: "forrestchang/andrej-karpathy-skills",
    skill: "karpathy-guidelines",
    why: "Karpathy's LLM coding pitfall rules — Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution",
  },
  {
    source: "microsoft/playwright-cli",
    skill: "playwright-cli",
    why: "Pure CLI browser automation — 40+ commands, no MCP. Snapshots after each command; stays cheap token-wise",
  },
];

export const skillsRegistryCategory: ComponentCategory = {
  id: "skills-registry",
  name: "Skills Registry (skills.sh)",
  tier: "recommended",
  description: "Third-party agent skills installed from skills.sh with `npx skills`",
  defaultEnabled: true,
  components: [
    {
      id: 50,
      name: "skills.sh-bundle",
      displayName: "skills.sh seed bundle",
      description: "find-skills + caveman + karpathy-guidelines + playwright-cli",
      tier: "recommended",
      category: "skills-registry",
      packages: [],
      verifyCommand: "bash -c 'ls ~/.claude/skills/find-skills >/dev/null'",
    },
  ],
};

export async function install(_env: DetectedEnvironment, dryRun: boolean): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  if (!commandExists("npx")) {
    results.push({
      component: "skills.sh bundle",
      status: "skipped",
      message: "npx not found — install Node.js / npm first, then re-run",
      verifyPassed: false,
    });
    return results;
  }

  for (const pkg of SKILLS_SH_PACKAGES) {
    const name = pkg.skill ?? pkg.source.split("/").pop() ?? pkg.source;

    if (dryRun) {
      const cmd = pkg.skill
        ? `npx --yes skills add ${pkg.source} -g -y --skill ${pkg.skill}`
        : `npx --yes skills add ${pkg.source} -g -y`;
      log.info(`[dry-run] Would run: ${cmd}  (${pkg.why})`);
      results.push({
        component: `skills.sh: ${name}`,
        status: "skipped",
        message: `[dry-run] Would install ${pkg.source}${pkg.skill ? `@${pkg.skill}` : ""}`,
        verifyPassed: false,
      });
      continue;
    }

    try {
      // `-y` skips scope prompt (defaults to global), `-g` forces global scope
      // (~/.agents/skills → symlinked into ~/.claude/skills).
      const cmd = pkg.skill
        ? `npx --yes skills add ${pkg.source} -g -y --skill ${pkg.skill}`
        : `npx --yes skills add ${pkg.source} -g -y`;
      const r = await $`sh -c ${cmd}`.quiet().nothrow();
      const installed = r.exitCode === 0;
      results.push({
        component: `skills.sh: ${name}`,
        status: installed ? "installed" : "failed",
        message: installed
          ? `installed ${pkg.source}${pkg.skill ? `@${pkg.skill}` : ""} — ${pkg.why}`
          : `npx skills add exited ${r.exitCode}`,
        verifyPassed: installed,
      });
    } catch (err) {
      results.push({
        component: `skills.sh: ${name}`,
        status: "failed",
        message: `install failed: ${err instanceof Error ? err.message : String(err)}`,
        verifyPassed: false,
      });
    }
  }

  return results;
}
