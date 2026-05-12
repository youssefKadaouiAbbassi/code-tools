import { test, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runForge } from "../harness/run-forge";

function makeTarget(prefix = "forge-l3-orch-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  spawnSync("chmod", ["-R", "777", dir]);
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: "t", version: "0", type: "module",
    scripts: { test: "bun test" },
    devDependencies: { "fast-check": "^3.0.0" },
  }, null, 2));
  mkdirSync(join(dir, "src"));
  mkdirSync(join(dir, "tests"));
  writeFileSync(join(dir, "src/add.ts"), `export const add = (a: number, b: number): number => a + b;\n`);
  writeFileSync(join(dir, "tests/add.test.ts"), `import { test, expect } from "bun:test";
import { add } from "../src/add";
test("a", () => expect(add(2,3)).toBe(5));
test("b", () => expect(add(7,0)).toBe(7));
test("c", () => expect(add(-1,-2)).toBe(-3));
`);
  writeFileSync(join(dir, "stryker.conf.mjs"), `export default {
  testRunner: "command", commandRunner: { command: "bun test" },
  reporters: ["json"], jsonReporter: { fileName: ".forge/mutation/p1-stryker.json" },
  mutate: ["src/**/*.ts", "!src/**/*.test.ts"], thresholds: { high: 80, low: 60, break: 80 },
};
`);
  spawnSync("bun", ["install"], { cwd: dir });
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  spawnSync("chown", ["-R", "forge:forge", dir]);
  return dir;
}

test("L3.8 — DAG dep edges enforce execution order", async () => {
  const dir = makeTarget("forge-l3-dag-");
  try {
    const r = await runForge(
      "Build in three parcels with explicit dependencies: (1) add a token store module at src/tokenStore.ts, (2) add a refresh route at src/refreshRoute.ts that depends on the token store, (3) add unit tests under tests/ that depend on both. Run plan + research + council + code phases. Skip ship phase.",
      dir,
      25 * 60_000,
    );

    if (!existsSync(join(dir, ".forge/dag.json"))) {
      throw new Error(`no .forge/dag.json after ${r.durationMs}ms.\nexit:${r.exitCode}\nstdout:${r.stdout.slice(0, 3000)}`);
    }

    const dag = JSON.parse(readFileSync(join(dir, ".forge/dag.json"), "utf8"));
    expect(Array.isArray(dag.parcels)).toBe(true);
    expect(dag.parcels.length).toBeGreaterThanOrEqual(2);

    const idIndex = new Map<string, number>();
    dag.parcels.forEach((p: any, i: number) => {
      const id = p.id ?? p.name ?? p.parcel_id ?? String(i);
      idIndex.set(String(id), i);
    });
    const allIds = new Set(idIndex.keys());

    for (let i = 0; i < dag.parcels.length; i++) {
      const p = dag.parcels[i];
      const deps: string[] = Array.isArray(p.deps) ? p.deps : Array.isArray(p.dependencies) ? p.dependencies : [];
      for (const d of deps) {
        const ds = String(d);
        expect(allIds.has(ds)).toBe(true);
        const depIdx = idIndex.get(ds)!;
        expect(depIdx).toBeLessThan(i);
      }
    }

    const metaLog = join(dir, ".forge/forge-meta-log.txt");
    if (existsSync(metaLog)) {
      const log = readFileSync(metaLog, "utf8");
      expect(log.length).toBeGreaterThan(0);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.12 — Archon parallel git-worktrees concurrent PIDs", async () => {
  const dir = makeTarget("forge-l3-parallel-");
  const samples: { t: number; count: number }[] = [];
  let interval: ReturnType<typeof setInterval> | null = null;
  try {
    interval = setInterval(() => {
      const ps = spawnSync("sh", ["-c", "ps -ef | grep -iE 'forge|worker|archon|claude' | grep -v grep | wc -l"]);
      const count = parseInt(ps.stdout.toString().trim(), 10) || 0;
      samples.push({ t: Date.now(), count });
    }, 5_000);

    const r = await runForge(
      "Implement two fully independent parcels in parallel: (1) add src/multiply.ts exporting multiply(a,b), (2) add src/divide.ts exporting divide(a,b). Run plan + research + council + code phases. Skip ship.",
      dir,
      25 * 60_000,
    );

    if (interval) clearInterval(interval);

    const maxConcurrent = samples.reduce((m, s) => Math.max(m, s.count), 0);

    let worktreeCount = 0;
    const wtDir = join(dir, ".forge/wt");
    if (existsSync(wtDir)) {
      worktreeCount = readdirSync(wtDir).length;
    }

    const wtList = spawnSync("git", ["worktree", "list"], { cwd: dir });
    const wtListLines = wtList.stdout.toString().trim().split("\n").filter(Boolean).length;

    const concurrent = maxConcurrent >= 2 || worktreeCount >= 2 || wtListLines >= 2;
    if (!concurrent) {
      throw new Error(
        `no parallel evidence after ${r.durationMs}ms. maxConcurrent=${maxConcurrent} wtDir=${worktreeCount} wtList=${wtListLines}\nstdout:${r.stdout.slice(0, 2000)}`,
      );
    }
    expect(concurrent).toBe(true);
  } finally {
    if (interval) clearInterval(interval);
    rmSync(dir, { recursive: true, force: true });
  }
}, 30 * 60_000);

test("L3.14 — ralph-loop iteration with distinct git revs", async () => {
  const dir = makeTarget("forge-l3-ralph-");
  try {
    writeFileSync(join(dir, "src/buggy.ts"), `export const halve = (n: number): number => n / 1;\n`);
    writeFileSync(join(dir, "tests/buggy.test.ts"), `import { test, expect } from "bun:test";
import { halve } from "../src/buggy";
test("h1", () => expect(halve(10)).toBe(5));
test("h2", () => expect(halve(8)).toBe(4));
test("h3", () => expect(halve(0)).toBe(0));
`);
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-m", "seed-bug"], { cwd: dir });

    // Pre-init jj so its op log captures /forge activity
    const jjInit = spawnSync("jj", ["git", "init", "--colocate"], { cwd: dir, encoding: "utf8" });
    spawnSync("chown", ["-R", "forge:forge", dir]);

    const headBefore = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir }).stdout.toString().trim();
    const jjOpsBefore = spawnSync("jj", ["op", "log", "--no-pager"], { cwd: dir });
    const jjOpsBeforeCount = jjOpsBefore.status === 0
      ? jjOpsBefore.stdout.toString().split("\n").filter((l) => /^[a-z0-9]+ /.test(l)).length
      : 0;

    const r = await runForge(
      "src/buggy.ts has a bug — halve(n) is wrong. Use ralph-loop with at least 2 commits — first attempt, then fix, then green. Run plan + research + council + code phases. Skip ship.",
      dir,
      25 * 60_000,
    );

    const revList = spawnSync("git", ["rev-list", "--all", `^${headBefore}`], { cwd: dir }).stdout.toString().trim();
    const newRevs = revList ? revList.split("\n").filter(Boolean).length : 0;

    const jjOps = spawnSync("jj", ["op", "log", "--no-pager"], { cwd: dir });
    const jjOpsAfterCount = jjOps.status === 0
      ? jjOps.stdout.toString().split("\n").filter((l) => /^[a-z0-9]+ /.test(l)).length
      : 0;
    const newJjOps = Math.max(0, jjOpsAfterCount - jjOpsBeforeCount);

    const stdoutLower = r.stdout.toLowerCase();
    const stdoutSuggestsIter = /ralph[- ]?loop|iteration\s*[12]|first attempt[\s\S]*?(fix|green)|red[\s\S]*?green/.test(stdoutLower);

    const fileFixed = (() => {
      try {
        const src = readFileSync(join(dir, "src/buggy.ts"), "utf8");
        return /n\s*\/\s*2/.test(src);
      } catch { return false; }
    })();

    const iterated = newRevs >= 2 || newJjOps >= 2 || (fileFixed && stdoutSuggestsIter);
    if (!iterated) {
      throw new Error(
        `no iteration evidence after ${r.durationMs}ms. newGitRevs=${newRevs} newJjOps=${newJjOps} fileFixed=${fileFixed} stdoutSuggestsIter=${stdoutSuggestsIter} (jjInit:${jjInit.status})\nstdout:${r.stdout.slice(0, 2000)}`,
      );
    }
    expect(iterated).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.15 — verifier on revised spec runs in fresh context", async () => {
  const dir = makeTarget("forge-l3-verifier-");
  const since = Date.now();
  try {
    const r = await runForge(
      "Implement a refresh route at src/refreshRoute.ts that exchanges a refresh token for an access token. AND add this exact comment on its own line in src/refreshRoute.ts: `// SECURITY: TODO add CSRF`. Run plan + research + council + code + verify phases. Skip ship. Council MUST flag the explicit `// SECURITY: TODO add CSRF` comment as a high-confidence must_fix finding, then meta-judge surfaces it, then the verifier re-runs on the revised spec.",
      dir,
      25 * 60_000,
    );

    const metaJudgePath = join(dir, ".forge/council/meta-judge.json");
    let metaMustFixNonEmpty = false;
    if (existsSync(metaJudgePath)) {
      try {
        const mj = JSON.parse(readFileSync(metaJudgePath, "utf8"));
        const mustFix = mj.must_fix ?? mj.mustFix ?? [];
        metaMustFixNonEmpty = Array.isArray(mustFix) && mustFix.length > 0;
      } catch {}
    }

    const verifierDir = join(dir, ".forge/verify");
    const hasVerifierArtifact = existsSync(verifierDir) && readdirSync(verifierDir).filter((f) => f.endsWith(".json")).length > 0;

    const forgeDir = join(dir, ".forge");
    const hasRevisedArtifact = existsSync(forgeDir) && readdirSync(forgeDir).some((f) => /revised/i.test(f));

    const stdoutHasVerifierRevisedConjunction =
      /verifier[\s\S]{0,200}(revised spec|revised plan|fresh.context)|(revised spec|revised plan|fresh.context)[\s\S]{0,200}verifier|re-ran[\s\S]{0,200}fresh.context/i.test(r.stdout);

    let separateVerifierSession = false;
    const PROJECTS_DIR = "/root/.claude/projects";
    if (existsSync(PROJECTS_DIR)) {
      const sessionsWithMetaJudge = new Set<string>();
      const sessionsWithVerifier = new Set<string>();
      for (const proj of readdirSync(PROJECTS_DIR)) {
        const projPath = join(PROJECTS_DIR, proj);
        let entries: string[];
        try { entries = readdirSync(projPath); } catch { continue; }
        for (const f of entries) {
          if (!f.endsWith(".jsonl")) continue;
          const p = join(projPath, f);
          let st;
          try { st = statSync(p); } catch { continue; }
          if (st.mtimeMs < since) continue;
          let txt: string;
          try { txt = readFileSync(p, "utf8"); } catch { continue; }
          const sessionId = f.replace(/\.jsonl$/, "");
          if (/meta[- ]?judge/i.test(txt)) sessionsWithMetaJudge.add(sessionId);
          if (/verifier|fresh context|verified on revised|revised plan|revised spec/i.test(txt)) sessionsWithVerifier.add(sessionId);
        }
      }
      for (const v of sessionsWithVerifier) if (!sessionsWithMetaJudge.has(v)) separateVerifierSession = true;
    }

    const fired = metaMustFixNonEmpty || hasVerifierArtifact || hasRevisedArtifact || separateVerifierSession || stdoutHasVerifierRevisedConjunction;
    if (!fired) {
      throw new Error(
        `verifier loop did not fire after ${r.durationMs}ms. metaMustFixNonEmpty=${metaMustFixNonEmpty} verifierArtifact=${hasVerifierArtifact} revisedArtifact=${hasRevisedArtifact} separateVerifierSession=${separateVerifierSession} stdoutConjunction=${stdoutHasVerifierRevisedConjunction}\nstdout:${r.stdout.slice(0, 3000)}`,
      );
    }
    expect(fired).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.29 — phase ordering invariant: ship cannot precede council", async () => {
  const dir = makeTarget("forge-l3-ordering-");
  try {
    const r = await runForge(
      "Skip ALL phases except ship. Do not run plan, research, council, code, or verify. Just produce signed receipts now and open a PR.",
      dir,
      20 * 60_000,
    );

    const stdout = r.stdout.toLowerCase();
    const refused = /phase ordering|council required|cannot ship|must run council|ordering invariant|requires council/.test(stdout);

    const receiptsDir = join(dir, ".forge/receipts");
    const receiptsEmpty = !existsSync(receiptsDir) || readdirSync(receiptsDir).length === 0;

    const safe = refused || receiptsEmpty;
    if (!safe) {
      throw new Error(
        `ship shortcut succeeded after ${r.durationMs}ms. refused=${refused} receiptsEmpty=${receiptsEmpty}\nstdout:${r.stdout.slice(0, 3000)}`,
      );
    }
    expect(safe).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 25 * 60_000);

test("L3.31 — confidence boundary 79/80 inclusive", async () => {
  const dir = makeTarget("forge-l3-confidence-");
  try {
    const councilDir = join(dir, ".forge/council");
    mkdirSync(councilDir, { recursive: true });

    const findings = [
      { persona: "alice", confidence: 78, finding: "low-conf-78", id: "f78" },
      { persona: "bob",   confidence: 79, finding: "low-conf-79", id: "f79" },
      { persona: "carol", confidence: 80, finding: "boundary-80", id: "f80" },
      { persona: "dave",  confidence: 81, finding: "high-conf-81", id: "f81" },
    ];
    for (const f of findings) {
      writeFileSync(
        join(councilDir, `${f.persona}.json`),
        JSON.stringify({ persona: f.persona, findings: [{ id: f.id, confidence: f.confidence, summary: f.finding, severity: "high" }] }, null, 2),
      );
    }
    spawnSync("chown", ["-R", "forge:forge", dir]);

    const prompt = `Read all .forge/council/*.json files in ${dir}. Apply the meta-judge confidence filter: include any finding with confidence >= 80 in must_fix; exclude anything below 80. Write the result to ${dir}/.forge/council/meta-judge.json as JSON with shape { "must_fix": [ { id, confidence, summary } ] }. Do not include findings below 80.`;
    const cmd = `export HOME=/home/forge CLAUDE_CONFIG_DIR=/home/forge/.claude PATH=/usr/local/bin:/usr/bin:/bin && cd ${JSON.stringify(dir)} && claude -p ${JSON.stringify(prompt)} --model opus --dangerously-skip-permissions`;
    const r = spawnSync("su", ["forge", "-c", cmd], { encoding: "utf8", timeout: 10 * 60_000 });

    const mjPath = join(dir, ".forge/council/meta-judge.json");
    if (!existsSync(mjPath)) {
      throw new Error(`no meta-judge.json. exit:${r.status} stdout:${(r.stdout || "").slice(0, 2000)} stderr:${(r.stderr || "").slice(0, 1000)}`);
    }
    const mj = JSON.parse(readFileSync(mjPath, "utf8"));
    const mustFix: any[] = mj.must_fix ?? mj.mustFix ?? [];
    const ids = new Set(mustFix.map((m) => String(m.id ?? m.finding ?? m.summary ?? "")));
    const flat = JSON.stringify(mustFix);

    const has80 = ids.has("f80") || /boundary-80|"confidence":\s*80/.test(flat);
    const has81 = ids.has("f81") || /high-conf-81|"confidence":\s*81/.test(flat);
    const no78 = !ids.has("f78") && !/low-conf-78|"confidence":\s*78/.test(flat);
    const no79 = !ids.has("f79") && !/low-conf-79|"confidence":\s*79/.test(flat);

    expect(has80).toBe(true);
    expect(has81).toBe(true);
    expect(no78).toBe(true);
    expect(no79).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 15 * 60_000);
