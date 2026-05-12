# Deferred work — track 1 code path (b)

## L0.audit-1 — regenerateProtectMcpHooks merge-not-overwrite

**Status: RESOLVED in follow-up PR.** All 4 follow-up steps landed:
1. Custom Bun JUnit-XML → tdd-guard-JSON bridge at `forge/scripts/tdd-guard-bun-reporter.ts`
   (upstream `tdd-guard-bun` package does not exist on npm; Bun has no programmatic
   reporter API so the bridge post-processes Bun's built-in `--reporter junit` output).
2. `bunfig.toml` `[test.reporter] junit = ".forge/last-junit.xml"` wires it automatically.
3. L0.audit-1 un-skipped; passes.
4. `regenerateProtectMcpHooks` now reads each candidate, regex-matches `/protect-mcp
   (evaluate|sign)/` before clobbering. Files without obsolete keywords are preserved.

**Resolves:** sfh-04 (critical) and ca-04 (high) **fully** — doc half (prior PR #2) +
code half (this PR).

---

## L0.types-9 — doctor.ts duplicate HealthResult interface

**Status: FULLY RESOLVED in follow-up PR.** With the bun reporter bridge wired, all 3
follow-up steps landed:
1. Local `interface HealthResult` deleted from `forge/src/doctor.ts`.
2. Canonical strict discriminated union imported from `./types`.
3. `printResult` narrows via `"lines" in r` so the `lines: string[]` access compiles
   against the strict union without `??` fallback. All `warn|fail` callsites updated
   to carry the required `lines: string[]` field. New L0.types-10 + existing L0.types-9
   green.

**Resolves:** tda-04 fully.

---

## sfh-05 — logLine read+rewrite (O(n²), race-prone, no error handling)

**Status: FULLY RESOLVED in follow-up PR.** `logLine` body is now a single
`await appendFile(LOG_PATH, line, "utf8")` — O(1) per call, race-safe under concurrent
writes. New L0.types-11 statically asserts the impl shape (appendFile present;
readFile/writeFile absent inside the function body). `readFile`/`writeFile`/`existsSync`
imports retained — still used by `readJson` (existsSync + readFile) and `backup`
(existsSync + readFile + writeFile) elsewhere in state.ts.

**Resolves:** sfh-05 fully.

