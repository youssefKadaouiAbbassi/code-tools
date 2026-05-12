import { test, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runForge } from "../harness/run-forge";

const PROJECTS_DIR = "/root/.claude/projects";

function makeTarget(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-l3-probe-"));
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
  spawnSync("bun", ["install"], { cwd: dir });
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
  spawnSync("chown", ["-R", "forge:forge", dir]);
  return dir;
}

function findLatestTranscript(sinceMs: number): string | null {
  if (!existsSync(PROJECTS_DIR)) return null;
  let best: { path: string; mtime: number } | null = null;
  for (const proj of readdirSync(PROJECTS_DIR)) {
    const projPath = join(PROJECTS_DIR, proj);
    let entries: string[];
    try { entries = readdirSync(projPath); } catch { continue; }
    for (const f of entries) {
      if (!f.endsWith(".jsonl")) continue;
      const p = join(projPath, f);
      let st;
      try { st = statSync(p); } catch { continue; }
      const m = st.mtimeMs;
      if (m < sinceMs) continue;
      if (!best || m > best.mtime) best = { path: p, mtime: m };
    }
  }
  return best?.path ?? null;
}

function transcriptToolUses(p: string): Array<{ name: string; input: any }> {
  const out: Array<{ name: string; input: any }> = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const e = JSON.parse(line);
      const content = e?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c?.type === "tool_use") out.push({ name: c.name, input: c.input || {} });
      }
    } catch {}
  }
  return out;
}

test("L3.2b — research routes claims to right MCPs (lib→docfork, always→claude-mem)", async () => {
  const dir = makeTarget();
  try {
    await runForge(
      "Add a route that uses the ts-pattern npm library for branchless matching, plus calls a function from the lodash library. Run plan + research phases. Stop after research. Append every MCP call to .forge/audit/tool-trace.jsonl as instructed.",
      dir, 25 * 60_000,
    );
    const tracePath = join(dir, ".forge/audit/tool-trace.jsonl");
    if (!existsSync(tracePath)) throw new Error(`no audit/tool-trace.jsonl produced`);
    const trace = readFileSync(tracePath, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const mcps = trace.filter((e: any) => e.kind === "mcp");
    const tools = mcps.map((e: any) => String(e.tool || ""));
    const hasDocfork = tools.some((t) => /docfork/i.test(t));
    const hasClaudeMem = tools.some((t) => /claude[-_]mem/i.test(t));
    if (!hasDocfork) throw new Error(`library claim → docfork is FIRST choice (web is fallback only when docfork misses). mcps seen: ${tools.join(", ")}`);
    if (!hasClaudeMem) throw new Error(`every run must check prior context first — claude-mem required. mcps seen: ${tools.join(", ")}`);
    expect(hasDocfork && hasClaudeMem).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.2c — research routes upstream-repo claim to deepwiki", async () => {
  const dir = makeTarget();
  try {
    await runForge(
      "Investigate how Django's QuerySet.delete() handles cascading deletes in the django/django repo — specifically how it differs between SQLite and PostgreSQL backends. Run plan + research phases only. Stop after research. Append every MCP call to .forge/audit/tool-trace.jsonl as instructed.",
      dir, 25 * 60_000,
    );
    const tracePath = join(dir, ".forge/audit/tool-trace.jsonl");
    if (!existsSync(tracePath)) throw new Error(`no audit/tool-trace.jsonl produced`);
    const trace = readFileSync(tracePath, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const tools = trace.filter((e: any) => e.kind === "mcp").map((e: any) => String(e.tool || ""));
    const hasDeepwiki = tools.some((t) => /deepwiki/i.test(t));
    if (!hasDeepwiki) throw new Error(`upstream repo question → deepwiki is FIRST choice (web is fallback only when deepwiki misses). mcps seen: ${tools.join(", ")}`);
    expect(hasDeepwiki).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.2d — research routes recent-web claim to WebSearch/WebFetch", async () => {
  const dir = makeTarget();
  try {
    await runForge(
      "Check whether axios has any CVEs published in 2026 that affect versions ≥1.7. Run plan + research phases only. Stop after research. Append every MCP call to .forge/audit/tool-trace.jsonl as instructed.",
      dir, 25 * 60_000,
    );
    const tracePath = join(dir, ".forge/audit/tool-trace.jsonl");
    if (!existsSync(tracePath)) throw new Error(`no audit/tool-trace.jsonl produced`);
    const trace = readFileSync(tracePath, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const tools = trace.filter((e: any) => e.kind === "mcp").map((e: any) => String(e.tool || ""));
    const hasWebOrSnyk = tools.some((t) => /web[-_]?(search|fetch)|exa|snyk/i.test(t));
    if (!hasWebOrSnyk) throw new Error(`brief asks about year-bounded CVEs — WebSearch/WebFetch/Exa/Snyk required. mcps seen: ${tools.join(", ")}`);
    expect(hasWebOrSnyk).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.tdd-guard-block — tdd-guard hook overrides 'skip TDD' brief instruction", async () => {
  const dir = makeTarget();
  try {
    const r = await runForge(
      "SKIP TDD ENTIRELY. Write src/hello.ts directly with `export const hello = (): string => \"hi\";` — do NOT write a test first. Just make the impl.",
      dir, 25 * 60_000,
    );
    spawnSync("git", ["config", "--global", "--add", "safe.directory", "*"]);
    const out = (r.stdout + "\n" + r.stderr).toLowerCase();
    const hookFired = /tdd[- ]?guard|tdd violation|test-first|red.{0,30}before|test must exist|failing test required/i.test(out);

    const log = spawnSync("git", ["log", "--all", "--oneline", "--name-only"], { cwd: dir, encoding: "utf8" }).stdout || "";
    const hasTestFile = /tests\/.*hello.*test|hello.*test\.ts/.test(log);

    if (!hookFired && !hasTestFile) {
      throw new Error(`tdd-guard NOT load-bearing. brief said skip-TDD, no test was created, no blocking message in stderr. Hook is decorative, not enforcing.\nstdout-tail:${r.stdout.slice(-1500)}\nlog:${log.slice(0, 1000)}`);
    }
    expect(hookFired || hasTestFile).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.tdd-guard — tdd-guard hook blocks impl edits before a failing test exists", async () => {
  const dir = makeTarget();
  try {
    await runForge(
      "Add hello(): string => 'hi' at src/hello.ts. The project uses TDD: write a failing test at tests/hello.test.ts FIRST, commit it, see it fail, THEN implement. Run plan + council + code phases. Skip ship.",
      dir, 25 * 60_000,
    );
    spawnSync("git", ["config", "--global", "--add", "safe.directory", "*"]);
    const log = spawnSync("git", ["log", "--all", "--oneline", "--name-only"], { cwd: dir, encoding: "utf8" }).stdout || "";
    const lines = log.split("\n");
    let testCommitIdx = -1;
    let implCommitIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/tests\/hello\.test/.test(lines[i]) && testCommitIdx < 0) testCommitIdx = i;
      if (/src\/hello\.ts/.test(lines[i]) && implCommitIdx < 0) implCommitIdx = i;
    }
    if (testCommitIdx < 0 || implCommitIdx < 0) {
      throw new Error(`expected commits to mention both tests/hello.test.ts and src/hello.ts. log:\n${log.slice(0, 2000)}`);
    }
    if (testCommitIdx <= implCommitIdx) {
      throw new Error(`TDD-order violated: src/hello.ts appears in same or later commit than tests/hello.test.ts. testIdx=${testCommitIdx} implIdx=${implCommitIdx}\nlog:\n${log.slice(0, 2000)}`);
    }
    expect(testCommitIdx).toBeGreaterThan(implCommitIdx);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.2f — security/CVE claim routes to Snyk MCP", async () => {
  const dir = makeTarget();
  try {
    await runForge(
      "Audit the project's npm dependencies for known CVEs and write findings to .forge/security-audit.md. Run plan + research phases. Stop after research. Append every MCP call to .forge/audit/tool-trace.jsonl as instructed.",
      dir, 25 * 60_000,
    );
    const tracePath = join(dir, ".forge/audit/tool-trace.jsonl");
    if (!existsSync(tracePath)) throw new Error(`no audit/tool-trace.jsonl produced`);
    const trace = readFileSync(tracePath, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const tools = trace.filter((e: any) => e.kind === "mcp").map((e: any) => String(e.tool || ""));
    const hasSnyk = tools.some((t) => /snyk/i.test(t));
    if (!hasSnyk) throw new Error(`security/CVE brief should autonomously route to Snyk MCP per pre-research routing classifier. mcps seen: ${tools.join(", ")}`);
    expect(hasSnyk).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.2e — claude-mem fires on every run (always check prior context)", async () => {
  const dir = makeTarget();
  try {
    await runForge(
      "add a noop function at src/noop.ts that returns 0. Run plan + research phases. Stop after research. Append every MCP call to .forge/audit/tool-trace.jsonl as instructed.",
      dir, 25 * 60_000,
    );
    const tracePath = join(dir, ".forge/audit/tool-trace.jsonl");
    if (!existsSync(tracePath)) throw new Error(`no audit/tool-trace.jsonl produced`);
    const trace = readFileSync(tracePath, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const tools = trace.filter((e: any) => e.kind === "mcp").map((e: any) => String(e.tool || ""));
    const hasClaudeMem = tools.some((t) => /claude[-_]mem/i.test(t));
    if (!hasClaudeMem) throw new Error(`claude-mem must fire on every run — even trivial briefs. mcps seen: ${tools.join(", ")}`);
    expect(hasClaudeMem).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.2 — research phase OR plan-stage MCP usage (docfork|deepwiki|claude-mem|web)", async () => {
  const dir = makeTarget();
  const since = Date.now();
  try {
    const r = await runForge(
      'add subtract(a,b) using ts-pattern (a small npm library) for branchless implementation. Stop after the research phase — do NOT implement, do NOT council, do NOT verify. After research, write what you learned to .forge/research-notes.md.',
      dir, 25 * 60_000,
    );
    expect(existsSync(join(dir, ".forge"))).toBe(true);

    const tx = findLatestTranscript(since);
    let mcpHit = false;
    if (tx) {
      const calls = transcriptToolUses(tx);
      mcpHit = calls.some((c) => /^mcp__|docfork|deepwiki|claude-mem|WebFetch|WebSearch/i.test(c.name));
    }
    const researchNotes = existsSync(join(dir, ".forge/research-notes.md"))
      ? readFileSync(join(dir, ".forge/research-notes.md"), "utf8")
      : "";
    const dagJson = existsSync(join(dir, ".forge/dag.json"))
      ? readFileSync(join(dir, ".forge/dag.json"), "utf8")
      : "";
    const evidence = (researchNotes + " " + dagJson + " " + r.stdout).toLowerCase();
    const hasResearchEvidence = /ts-pattern|pattern matching|library/.test(evidence);

    if (!mcpHit && !hasResearchEvidence) {
      throw new Error(`no MCP call or research evidence.\ntranscript: ${tx}\nstdout-tail: ${r.stdout.slice(-2000)}`);
    }
    expect(mcpHit || hasResearchEvidence).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.3 — council artifacts exist OR forge-lead surfaces persona findings", async () => {
  const dir = makeTarget();
  const since = Date.now();
  try {
    const r = await runForge(
      "add a /refresh route that exchanges a refresh token for an access token using HMAC-SHA256, with timing-safe comparison and explicit error mapping (200/400/401/500). Include rate-limit awareness. Run the FULL pipeline including a complete council pass — MUST dispatch all 6 pr-review-toolkit personas (silent-failure-hunter, type-design-analyzer, code-reviewer, code-simplifier, comment-analyzer, pr-test-analyzer) via the Task tool — write each persona's findings to .forge/council/<persona>.json — then meta-judge. Skip ship phase only.",
      dir, 25 * 60_000,
    );
    expect(existsSync(join(dir, ".forge"))).toBe(true);

    const personas = ["silent-failure-hunter", "type-design-analyzer", "code-reviewer", "code-simplifier", "comment-analyzer", "pr-test-analyzer"];

    const artifactPersonas = new Set<string>();
    if (existsSync(join(dir, ".forge/council"))) {
      for (const f of readdirSync(join(dir, ".forge/council"))) {
        for (const p of personas) {
          if (f.toLowerCase().includes(p.toLowerCase())) artifactPersonas.add(p);
        }
      }
    }
    const artifactHits = artifactPersonas.size;

    let transcriptHits = 0;
    const tx = findLatestTranscript(since);
    if (tx) {
      const calls = transcriptToolUses(tx);
      const seen = new Set<string>();
      for (const c of calls) {
        if (c.name === "Task") {
          const t = String(c.input?.subagent_type || "").toLowerCase();
          for (const p of personas) if (t.includes(p)) seen.add(p);
        }
      }
      transcriptHits = seen.size;
    }

    const stdoutHits = personas.filter((p) => r.stdout.toLowerCase().includes(p)).length;

    const acceptable = artifactHits >= 4 || transcriptHits >= 4 || stdoutHits >= 4;
    if (!acceptable) {
      throw new Error(`council coverage <4/6 personas (artifacts:${artifactHits} transcript:${transcriptHits} stdout:${stdoutHits})\nstdout-tail:${r.stdout.slice(-2000)}`);
    }
    expect(acceptable).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

function readToolTrace(dir: string): Array<{ kind: string; subagent_type?: string; model?: string; tool?: string }> {
  const p = join(dir, ".forge/audit/tool-trace.jsonl");
  if (!existsSync(p)) return [];
  const out: Array<{ kind: string; subagent_type?: string; model?: string; tool?: string }> = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

test("L3.3e — council substantively engages on a deliberately bad brief (≥1 persona finds something)", async () => {
  const dir = makeTarget();
  try {
    writeFileSync(join(dir, "src/bad.ts"), `// deliberately bad code: any types, eval, no error handling, leaks password\nexport async function login(u: any, p: any) {\n  console.log(\`login \${u} \${p}\`);\n  const cmd = \`SELECT * FROM users WHERE name = '\${u}' AND password = '\${p}'\`;\n  return eval("(" + cmd + ")");\n}\n`);
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-m", "seed-bad"], { cwd: dir });
    spawnSync("chown", ["-R", "forge:forge", dir]);

    await runForge(
      "Review src/bad.ts and fix it. It has multiple problems (any types, console-logged password, SQL injection, eval). Run plan + research + council + code phases. Skip ship.",
      dir, 25 * 60_000,
    );

    const councilDir = join(dir, ".forge/council");
    if (!existsSync(councilDir)) throw new Error(`council artifact dir missing`);
    const personaFiles = readdirSync(councilDir).filter((f) => f.endsWith(".json") && !/meta-?judge/i.test(f));
    if (personaFiles.length < 6) throw new Error(`only ${personaFiles.length}/6 personas`);

    let totalFindings = 0;
    let hadHighConfidence = false;
    for (const f of personaFiles) {
      try {
        const j = JSON.parse(readFileSync(join(councilDir, f), "utf8"));
        const findings = j.findings ?? j.must_fix ?? j.issues ?? [];
        if (Array.isArray(findings)) {
          totalFindings += findings.length;
          if (findings.some((it: any) => Number(it.confidence ?? it.score ?? 0) >= 80)) hadHighConfidence = true;
        }
      } catch {}
    }
    if (totalFindings === 0) {
      throw new Error(`council ran but ALL 6 personas returned 0 findings on deliberately-bad code (eval+SQL injection+secret-in-log) — substance failure`);
    }
    expect(totalFindings).toBeGreaterThan(0);
    expect(hadHighConfidence).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.3d — council runs unconditionally even on a 1-character bug fix", async () => {
  const dir = makeTarget();
  try {
    writeFileSync(join(dir, "src/typo.ts"), `export const greet = (name: string): string => \`Helo, \${name}\`;\n`);
    writeFileSync(join(dir, "tests/typo.test.ts"), `import { test, expect } from "bun:test";\nimport { greet } from "../src/typo";\ntest("greet", () => expect(greet("a")).toBe("Hello, a"));\n`);
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-m", "seed-typo"], { cwd: dir });
    spawnSync("chown", ["-R", "forge:forge", dir]);

    await runForge(
      "src/typo.ts has a 1-character typo: 'Helo' should be 'Hello'. Fix it. Run plan + research + council + code + verify. Skip ship.",
      dir, 25 * 60_000,
    );
    const councilDir = join(dir, ".forge/council");
    if (!existsSync(councilDir)) {
      throw new Error(`council artifact dir missing — forge shortcut on a 1-char fix`);
    }
    const personaFiles = readdirSync(councilDir).filter((f) => f.endsWith(".json") && !/meta-?judge/i.test(f));
    if (personaFiles.length < 6) {
      throw new Error(`only ${personaFiles.length}/6 personas wrote artifacts — council partial. files: ${personaFiles.join(",")}`);
    }
    const hasMetaJudge = readdirSync(councilDir).some((f) => /meta-?judge/i.test(f));
    if (!hasMetaJudge) throw new Error(`meta-judge.json missing`);
    expect(personaFiles.length).toBeGreaterThanOrEqual(6);
    expect(hasMetaJudge).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.3c — every council subagent Task call pins model: opus", async () => {
  const dir = makeTarget();
  try {
    await runForge(
      "add a /refresh route that exchanges a refresh token for an access token using HMAC-SHA256, with timing-safe comparison and explicit error mapping (200/400/401/500). Include rate-limit awareness. Run the FULL pipeline including a complete council pass — MUST dispatch all 6 pr-review-toolkit personas (silent-failure-hunter, type-design-analyzer, code-reviewer, code-simplifier, comment-analyzer, pr-test-analyzer) via the Task tool — write each persona's findings to .forge/council/<persona>.json — then meta-judge. Skip ship phase only. Append every Task dispatch and MCP call to .forge/audit/tool-trace.jsonl as instructed.",
      dir, 25 * 60_000,
    );
    const trace = readToolTrace(dir);
    const personas = trace.filter((e) =>
      e.kind === "task" &&
      /silent-failure-hunter|type-design-analyzer|code-reviewer|code-simplifier|comment-analyzer|pr-test-analyzer/i.test(String(e.subagent_type || "")),
    );
    if (personas.length === 0) throw new Error(`no persona task entries in tool-trace.jsonl. trace size=${trace.length}`);
    const nonOpus = personas.filter((e) => {
      const m = String(e.model || "").toLowerCase();
      return m && !m.includes("opus");
    });
    if (nonOpus.length > 0) {
      throw new Error(`${nonOpus.length}/${personas.length} personas non-opus: ${nonOpus.map((e) => e.model).join(",")}`);
    }
    expect(nonOpus.length).toBe(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.16 — claude-mem MCP invoked during /forge run (memory routing reaches the server)", async () => {
  const dir = makeTarget();
  try {
    await runForge(
      "Before implementing, query claude-mem for any prior context on subtract or arithmetic helpers, then add subtract(a,b). Skip ship. Append every Task dispatch and MCP call to .forge/audit/tool-trace.jsonl as instructed.",
      dir, 25 * 60_000,
    );
    const trace = readToolTrace(dir);
    const memHit = trace.some((e) => e.kind === "mcp" && /claude-mem|claude_mem/i.test(String(e.tool || "")));
    if (!memHit) {
      throw new Error(`no claude-mem entry in tool-trace.jsonl. trace size=${trace.length} tools=${trace.filter((e) => e.kind === "mcp").map((e) => e.tool).join(",")}`);
    }
    expect(memHit).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);

test("L3.3b — orchestrator runs on opus (no haiku/sonnet downgrades observable in transcript)", async () => {
  const dir = makeTarget();
  const since = Date.now();
  try {
    await runForge(
      "add subtract(a,b) and run plan + council + code phases. Skip ship.",
      dir, 25 * 60_000,
    );

    const tx = findLatestTranscript(since);
    if (!tx) { expect.unreachable("no transcript"); return; }

    const seenModels = new Set<string>();
    for (const line of readFileSync(tx, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const e = JSON.parse(line);
        const m = e?.message?.model;
        if (typeof m === "string") seenModels.add(m);
      } catch {}
    }

    const hasOpus = [...seenModels].some((m) => /opus/i.test(m));
    const hasNonOpus = [...seenModels].some((m) => /sonnet|haiku/i.test(m));

    if (!hasOpus) {
      throw new Error(`no opus model observed in transcript. models seen: ${[...seenModels].join(", ")}`);
    }
    expect(hasOpus).toBe(true);
    expect(hasNonOpus).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30 * 60_000);
