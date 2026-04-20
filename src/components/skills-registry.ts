import { $ } from "bun";
import type { ComponentCategory, DetectedEnvironment, InstallResult } from "../types.js";
import { commandExists, log } from "../utils.js";
import type { ComponentSpec } from "./framework.js";
import { runComponent } from "./framework.js";

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
  {
    source: "obra/superpowers",
    skill: "using-superpowers",
    why: "Always-on 1%-rule enforcement — `if there is even a 1% chance a skill might apply, you MUST invoke it`. Load at session start to make skill invocation non-optional",
  },
  {
    source: "obra/superpowers",
    skill: "brainstorming",
    why: "Socratic one-question-at-a-time spec refinement (113K installs) — upstream canonical from the Superpowers maintainer",
  },
  {
    source: "obra/superpowers",
    skill: "verification-before-completion",
    why: "Iron Law self-challenge before claiming done — upstream canonical Superpowers skill. Refetched every setup run",
  },
  {
    source: "dceoy/speckit-agent-skills",
    skill: "speckit-clarify",
    why: "Bounded max-5-Q ambiguity-clarification loop faithful to spec-kit's /speckit.clarify — identifies underspecified areas, encodes answers back into the spec",
  },
  {
    source: "obra/superpowers",
    skill: "test-driven-development",
    why: "Red-Green-Refactor Iron Law with RED-failure-verification — upstream canonical. Replaces our tdd-first local port (which was a 60-line paraphrase)",
  },
  {
    source: "obra/superpowers",
    skill: "writing-skills",
    why: "655-line skill-authoring guide with anthropic-best-practices.md, persuasion-principles.md, testing-skills-with-subagents.md, worked examples — upstream canonical. Replaces our skill-authoring 116-line paraphrase",
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

function skillPackageSpec(id: number, pkg: { source: string; skill?: string; why: string }): ComponentSpec {
  const name = pkg.skill ?? pkg.source.split("/").pop() ?? pkg.source;
  const displayName = `skills.sh: ${name}`;
  return {
    id,
    name: displayName,
    displayName,
    description: pkg.why,
    tier: "recommended",
    category: "skills-registry",
    probe: async () => ({ present: false }),
    plan: () => ({ kind: "install", steps: [] }),
    install: async (_env, _plan, dryRun) => {
      const cmd = pkg.skill
        ? `npx --yes skills add ${pkg.source} -g -y --skill ${pkg.skill}`
        : `npx --yes skills add ${pkg.source} -g -y`;
      if (dryRun) {
        log.info(`[dry-run] Would run: ${cmd}  (${pkg.why})`);
        return {
          component: displayName,
          status: "skipped",
          message: `[dry-run] Would install ${pkg.source}${pkg.skill ? `@${pkg.skill}` : ""}`,
          verifyPassed: false,
        };
      }
      try {
        const r = await $`sh -c ${cmd}`.quiet().nothrow();
        const installed = r.exitCode === 0;
        return {
          component: displayName,
          status: installed ? "installed" : "failed",
          message: installed
            ? `installed ${pkg.source}${pkg.skill ? `@${pkg.skill}` : ""} — ${pkg.why}`
            : `npx skills add exited ${r.exitCode}`,
          verifyPassed: installed,
        };
      } catch (err) {
        return {
          component: displayName,
          status: "failed",
          message: `install failed: ${err instanceof Error ? err.message : String(err)}`,
          verifyPassed: false,
        };
      }
    },
    verify: async () => true,
  };
}

export const skillsRegistrySpecs: ComponentSpec[] = SKILLS_SH_PACKAGES.map((p, i) => skillPackageSpec(50 + i, p));

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

  for (const spec of skillsRegistrySpecs) {
    results.push(await runComponent(spec, _env, dryRun));
  }

  return results;
}
