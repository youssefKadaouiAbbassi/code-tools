#!/usr/bin/env bun
// JUnit XML (Bun's built-in test reporter output) -> tdd-guard JSON bridge.
// Bun has no programmatic reporter API as of v1.3, only --reporter junit + dots,
// so we post-process the JUnit XML into the tdd-guard schema at
// tdd-guard/dist/contracts/schemas/reporterSchemas.js.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type TestState = "passed" | "failed" | "skipped";

interface TestEntry {
  name: string;
  fullName: string;
  state: TestState;
  errors?: { message: string }[];
}

interface TestModule {
  moduleId: string;
  tests: TestEntry[];
}

const [, , junitPath, projectRootArg] = process.argv;
if (!junitPath || !existsSync(junitPath)) {
  console.error("usage: tdd-guard-bun-reporter <junit.xml> [projectRoot]");
  process.exit(2);
}

const xml = readFileSync(junitPath, "utf8");
const modules = parseJunit(xml);
const reason: "passed" | "failed" = modules.some((m) => m.tests.some((t) => t.state === "failed"))
  ? "failed"
  : "passed";

const projectRoot = projectRootArg ?? process.env.TDD_GUARD_PROJECT_ROOT ?? process.cwd();
const outPath = join(projectRoot, ".claude", "tdd-guard", "data", "test.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify({ testModules: modules, unhandledErrors: [], reason }, null, 2),
  "utf8",
);
console.log(`tdd-guard-bun: wrote ${outPath} (${modules.length} module(s), reason=${reason})`);

function parseJunit(xml: string): TestModule[] {
  const modules: TestModule[] = [];
  const suiteRe = /<testsuite\s[^>]*?\bname="([^"]+)"[^>]*>([\s\S]*?)<\/testsuite>/g;
  const caseRe = /<testcase\s([^>]+?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  const attrRe = /(\w+)="([^"]*)"/g;
  let suiteMatch: RegExpExecArray | null;
  while ((suiteMatch = suiteRe.exec(xml)) !== null) {
    const [, suiteName, suiteBody] = suiteMatch;
    const moduleId = resolve(suiteName);
    const tests: TestEntry[] = [];
    let caseMatch: RegExpExecArray | null;
    while ((caseMatch = caseRe.exec(suiteBody)) !== null) {
      const [, attrs, body = ""] = caseMatch;
      const a: Record<string, string> = {};
      let am: RegExpExecArray | null;
      attrRe.lastIndex = 0;
      while ((am = attrRe.exec(attrs)) !== null) a[am[1]] = am[2];
      const name = a.name ?? "";
      let state: TestState = "passed";
      const errors: { message: string }[] = [];
      if (/<skipped\b/.test(body)) state = "skipped";
      else if (/<failure\b/.test(body) || /<error\b/.test(body)) {
        state = "failed";
        const failType = /<(?:failure|error)[^>]*type="([^"]*)"/.exec(body)?.[1] ?? "AssertionError";
        errors.push({ message: failType });
      }
      tests.push({
        name,
        fullName: name,
        state,
        ...(errors.length ? { errors } : {}),
      });
    }
    modules.push({ moduleId, tests });
  }
  return modules;
}
