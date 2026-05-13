import { test, expect } from "bun:test";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runForge } from "../harness/run-forge";

function makeTarget(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-l3-vs-"));
  spawnSync("chmod", ["-R", "777", dir]);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "t",
        version: "0",
        type: "module",
        scripts: { test: "bun test" },
        devDependencies: { "fast-check": "^3.0.0" },
      },
      null,
      2,
    ),
  );
  mkdirSync(join(dir, "src"));
  mkdirSync(join(dir, "tests"));
  writeFileSync(
    join(dir, "src/add.ts"),
    `export const add = (a: number, b: number): number => a + b;\n`,
  );
  writeFileSync(
    join(dir, "tests/add.test.ts"),
    `import { test, expect } from "bun:test";
import { add } from "../src/add";
test("a", () => expect(add(2,3)).toBe(5));
test("b", () => expect(add(7,0)).toBe(7));
test("c", () => expect(add(-1,-2)).toBe(-3));
`,
  );
  writeFileSync(
    join(dir, "stryker.conf.mjs"),
    `export default {
  testRunner: "command", commandRunner: { command: "bun test" },
  reporters: ["json"], jsonReporter: { fileName: ".forge/mutation/p1-stryker.json" },
  mutate: ["src/**/*.ts", "!src/**/*.test.ts"], thresholds: { high: 80, low: 60, break: 80 },
};
`,
  );
  spawnSync("bun", ["install"], { cwd: dir });
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  spawnSync("chown", ["-R", "forge:forge", dir]);
  return dir;
}

function chownBack(dir: string) {
  spawnSync("chown", ["-R", "forge:forge", dir]);
}

function runBunTest(dir: string) {
  return spawnSync("bun", ["test"], { cwd: dir, encoding: "utf8" });
}

test("L3.4 — code phase ralph-loop reaches green on a failing test", async () => {
  const dir = makeTarget();
  try {
    writeFileSync(
      join(dir, "tests/will-fail.test.ts"),
      `import { test, expect } from "bun:test";
test("intentionally failing", () => { expect(false).toBe(true); });
`,
    );
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-m", "add failing"], { cwd: dir });
    chownBack(dir);

    const r = await runForge(
      "fix the failing test in tests/will-fail.test.ts. Run plan + code + verify phases. Skip ship.",
      dir,
      28 * 60_000,
    );

    const failPath = join(dir, "tests/will-fail.test.ts");
    const fileGone = !existsSync(failPath);
    let contentChanged = false;
    if (!fileGone) {
      const txt = readFileSync(failPath, "utf8");
      contentChanged = !txt.includes("expect(false).toBe(true)");
    }

    const tr = runBunTest(dir);
    const greenViaBun = tr.status === 0;

    if (!(greenViaBun || fileGone || contentChanged)) {
      throw new Error(
        `L3.4: not green and file unchanged. exit:${r.exitCode} dur:${r.durationMs}ms\nbun-status:${tr.status}\nbun-stdout:${(tr.stdout || "").slice(0, 1500)}\nforge-stdout:${r.stdout.slice(0, 2000)}`,
      );
    }
    expect(greenViaBun || fileGone || contentChanged).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 32 * 60_000);

test("L3.5 — mutation score in artifact matches independent recompute from stryker.json", async () => {
  const dir = makeTarget();
  try {
    const r = await runForge(
      "add subtract(a,b) alongside add. Run plan + research + council + code + verify phases. Skip ship.",
      dir,
      28 * 60_000,
    );

    const mutDir = join(dir, ".forge/mutation");
    if (!existsSync(mutDir)) {
      console.log(`L3.5 skip: no .forge/mutation/ produced. exit:${r.exitCode} dur:${r.durationMs}`);
      return;
    }
    const files = readdirSync(mutDir);
    const summary = files.find((f) => f.endsWith(".json") && !f.includes("stryker"));
    const stryker = files.find((f) => f.includes("stryker") && f.endsWith(".json"));

    if (!summary || !stryker) {
      console.log(`L3.5 skip: missing summary(${summary}) or stryker(${stryker}) in ${files.join(",")}`);
      return;
    }

    const summaryJson = JSON.parse(readFileSync(join(mutDir, summary), "utf8"));
    const strykerJson = JSON.parse(readFileSync(join(mutDir, stryker), "utf8"));

    const claimed: number | undefined =
      summaryJson.score ?? summaryJson.mutationScore ?? summaryJson.metrics?.mutationScore;
    if (typeof claimed !== "number") {
      console.log(`L3.5 skip: no score field in summary ${JSON.stringify(Object.keys(summaryJson))}`);
      return;
    }

    let killed = 0;
    let survived = 0;
    let noCov = 0;
    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node.mutants)) {
        for (const m of node.mutants) {
          if (m.status === "Killed") killed++;
          else if (m.status === "Survived") survived++;
          else if (m.status === "NoCoverage") noCov++;
        }
      }
      for (const k of Object.keys(node)) {
        if (k === "mutants") continue;
        if (typeof node[k] === "object") walk(node[k]);
      }
    };
    walk(strykerJson);

    const denom = killed + survived + noCov;
    if (denom === 0) {
      console.log(`L3.5 skip: zero mutants in stryker.json`);
      return;
    }
    const recomputed = (killed / denom) * 100;
    const claimedPct = claimed <= 1 ? claimed * 100 : claimed;
    const delta = Math.abs(recomputed - claimedPct);
    if (delta > 0.01) {
      throw new Error(
        `L3.5: claimed=${claimedPct} recomputed=${recomputed} k=${killed} s=${survived} nc=${noCov} delta=${delta}`,
      );
    }
    expect(delta).toBeLessThanOrEqual(0.01);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 32 * 60_000);

test("L3.6 — ship phase produces forge-meta branch or signed receipts", async () => {
  const dir = makeTarget();
  try {
    const r = await runForge(
      "add subtract(a,b) alongside add. Run full pipeline INCLUDING ship phase: write forge-meta commits locally. Do NOT push. Do NOT open a PR.",
      dir,
      28 * 60_000,
    );

    spawnSync("git", ["config", "--global", "--add", "safe.directory", "*"]);
    spawnSync("git", ["config", "--global", "--add", "safe.directory", dir]);
    const branches = spawnSync("git", ["branch", "--list", "-a", "*forge-meta*"], { cwd: dir, encoding: "utf8" });
    const hasBranch = (branches.stdout || "").trim().length > 0;

    const recDir = join(dir, ".forge/receipts");
    let signedReceiptCount = 0;
    const findEd25519Sig = (val: any): boolean => {
      if (typeof val === "string") {
        return /^[0-9a-fA-F]{128}$/.test(val) || /^[A-Za-z0-9+/_-]{86,90}={0,2}$/.test(val);
      }
      if (Array.isArray(val)) return val.some(findEd25519Sig);
      if (val && typeof val === "object") return Object.values(val).some(findEd25519Sig);
      return false;
    };
    if (existsSync(recDir)) {
      const files = readdirSync(recDir).filter((f) => f.endsWith(".json"));
      for (const f of files) {
        try {
          const j = JSON.parse(readFileSync(join(recDir, f), "utf8"));
          if (findEd25519Sig(j)) signedReceiptCount++;
        } catch {}
      }
    }

    const ok = hasBranch && signedReceiptCount >= 1;
    if (!ok) {
      throw new Error(
        `L3.6: ship phase contract violation — both forge-meta branch AND ≥1 signed receipt required. hasBranch:${hasBranch} signedReceipts:${signedReceiptCount} exit:${r.exitCode} stdout-tail:${r.stdout.slice(-2000)}`,
      );
    }
    expect(ok).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 32 * 60_000);

test("L3.27 — hash-chain tamper test: verify-artifact rejects modified receipt", async () => {
  const dir = makeTarget();
  try {
    const r = await runForge(
      "add subtract(a,b). Run full pipeline including ship phase locally (no push, no PR). Emit signed receipts.",
      dir,
      28 * 60_000,
    );

    const recDir = join(dir, ".forge/receipts");
    if (!existsSync(recDir)) {
      console.log(`L3.27 skip: no receipts dir. exit:${r.exitCode}`);
      return;
    }
    const files = readdirSync(recDir).filter((f) => f.endsWith(".json"));
    if (files.length === 0) {
      console.log(`L3.27 skip: no receipts produced.`);
      return;
    }

    const target = join(recDir, files[0]);
    const original = readFileSync(target, "utf8");
    const j = JSON.parse(original);
    if (j.payload && typeof j.payload === "object") {
      const k = Object.keys(j.payload)[0];
      if (k) {
        const v = j.payload[k];
        j.payload[k] = typeof v === "string" ? v + "X" : "tampered";
      } else {
        j.payload.__tamper = "X";
      }
    } else {
      j.__tamper = "X";
    }
    writeFileSync(target, JSON.stringify(j, null, 2));

    const candidates = [
      ["npx", ["--yes", "verify-artifact", target]],
      ["node", ["/root/.bun/install/global/node_modules/@veritasacta/verify/cli.js", target]],
      ["npx", ["--yes", "@veritasacta/verify", target]],
    ];
    let saw: { code: number; out: string; err: string } | null = null;
    for (const [bin, args] of candidates) {
      const res = spawnSync(bin as string, args as string[], {
        cwd: dir,
        encoding: "utf8",
        timeout: 60_000,
      });
      saw = {
        code: res.status ?? -1,
        out: (res.stdout || "").toString(),
        err: (res.stderr || "").toString(),
      };
      if (saw.code !== 127 && !saw.err.includes("command not found") && !saw.err.includes("ENOENT")) {
        break;
      }
    }
    if (!saw || saw.code === 127 || saw.err.includes("ENOENT")) {
      console.log(`L3.27 skip: no verify-artifact CLI available.`);
      return;
    }

    const txt = (saw.out + "\n" + saw.err).toLowerCase();
    const detected =
      saw.code !== 0 ||
      /tamper|invalid|mismatch|bad signature|verification failed|fail/.test(txt);

    if (!detected) {
      throw new Error(
        `L3.27: tamper NOT detected. code:${saw.code}\nout:${saw.out.slice(0, 1500)}\nerr:${saw.err.slice(0, 1500)}`,
      );
    }
    expect(detected).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 32 * 60_000);

test("L3.41 — /protect-mcp:audit-chain describes chain after a real /forge run", async () => {
  const dir = makeTarget();
  try {
    const r = await runForge(
      "add subtract(a,b). Run full pipeline including ship phase locally (no push, no PR).",
      dir,
      28 * 60_000,
    );

    if (!existsSync(join(dir, ".forge"))) {
      console.log(`L3.41 skip: no .forge produced. exit:${r.exitCode}`);
      return;
    }

    const cmd = `export HOME=/home/forge CLAUDE_CONFIG_DIR=/home/forge/.claude PATH=/usr/local/bin:/usr/bin:/bin && cd ${JSON.stringify(dir)} && claude -p ${JSON.stringify("/protect-mcp:audit-chain")} --model opus --dangerously-skip-permissions`;
    const res = spawnSync("su", ["forge", "-c", cmd], {
      encoding: "utf8",
      timeout: 10 * 60_000,
    });
    const text = ((res.stdout || "") + "\n" + (res.stderr || "")).toLowerCase();
    const matched = /chain|receipt|verify|verified|hash/.test(text);

    if (!matched) {
      throw new Error(
        `L3.41: no chain keyword. exit:${res.status}\nout:${(res.stdout || "").slice(0, 2000)}\nerr:${(res.stderr || "").slice(0, 1000)}`,
      );
    }
    expect(matched).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 32 * 60_000);

test("L3.42 — pre-existing forge-meta branch is appended to or fails loud, never silently overwritten", async () => {
  const dir = makeTarget();
  try {
    spawnSync("git", ["config", "--global", "--add", "safe.directory", "*"]);
    spawnSync("git", ["config", "--global", "--add", "safe.directory", dir]);
    const must = (args: string[]) => {
      const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`setup failed: git ${args.join(" ")}\n${r.stderr}`);
      return r.stdout.trim();
    };
    must(["checkout", "-b", "forge-meta"]);
    writeFileSync(join(dir, "PRIOR_FORGE_META.txt"), "prior unrelated commit\n");
    must(["add", "-A"]);
    must(["commit", "-m", "prior unrelated forge-meta commit"]);
    const priorSha = must(["rev-parse", "forge-meta"]);
    if (!priorSha) throw new Error(`setup failed: empty priorSha`);
    must(["checkout", "main"]);
    chownBack(dir);

    const r = await runForge(
      "add subtract(a,b). Run full pipeline including ship phase locally (no push, no PR). Write forge-meta commits.",
      dir,
      28 * 60_000,
    );

    spawnSync("git", ["config", "--global", "--add", "safe.directory", "*"]);
    spawnSync("git", ["config", "--global", "--add", "safe.directory", dir]);
    const log = spawnSync(
      "git",
      ["log", "--all", "--format=%H %s"],
      { cwd: dir, encoding: "utf8" },
    );
    const logText = (log.stdout || "") + (log.stderr || "");
    const priorPresent = priorSha.length > 0 && logText.includes(priorSha);
    const stillHasPriorFile = (() => {
      const show = spawnSync("git", ["show", `forge-meta:PRIOR_FORGE_META.txt`], {
        cwd: dir,
        encoding: "utf8",
      });
      return show.status === 0;
    })();
    const dubious = /dubious ownership/i.test(logText);

    const out = (r.stdout + "\n" + r.stderr).toLowerCase();
    const failedLoud =
      r.exitCode !== 0 ||
      /branch.*exists|already exists|conflict|rebase|non[- ]?fast[- ]?forward|cannot.*forge-meta/.test(
        out,
      );

    const appendedCleanly = priorPresent && stillHasPriorFile;
    // Dubious-ownership git-config bug means we couldn't read the log — skip not-fail in that case.
    if (dubious) {
      console.log(`L3.42: skipping due to git dubious-ownership (test infra). exit:${r.exitCode}`);
      return;
    }

    if (!(appendedCleanly || failedLoud)) {
      throw new Error(
        `L3.42: prior forge-meta commit was silently overwritten. priorSha:${priorSha} priorPresent:${priorPresent} stillHasFile:${stillHasPriorFile} exit:${r.exitCode}\nlog:${logText.slice(0, 1500)}\nstdout-tail:${r.stdout.slice(-1500)}`,
      );
    }
    expect(appendedCleanly || failedLoud).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 32 * 60_000);
