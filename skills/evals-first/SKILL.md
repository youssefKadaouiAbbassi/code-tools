---
name: evals-first
description: [yka-code] Enforce eval-first discipline for LLM-touching code. Use when the task ships prompt text, skill logic, hook behavior, agent instructions, or any string a Claude Code session will read and act on. Writes a failing eval BEFORE the implementation. Red → Green loop using `claude -p` subprocess harness (Claude Max subscription, no Anthropic API key). Complements `test-driven-development` (which covers unit logic) with LLM-behavioral regression coverage.
---

# Evals-first

Prompt / skill / hook / agent-instruction code has no compiler and no type system. The only regression signal is a run: feed a fixture in, observe what Claude does, compare against expected behavior.

This skill makes writing the eval the first step — before you touch the prompt.

## When to activate

Load this skill when the work touches ANY of:

- A SKILL.md body (new skill, modified routing, changed Phase-0 preamble)
- A prompt template or system message
- A hook script whose failure mode changes Claude's behavior
- An agent-instruction markdown (subagent prompts, plugin-level agents)
- A CLAUDE.md rule that Claude must follow in sessions

Skip this skill for pure TypeScript / shell / non-prompt code — that's `test-driven-development` territory.

## The loop

1. **Observe the failure.** Describe in one sentence the current behavior the change will fix. If you can't observe it, you can't test it — the task isn't ready.
2. **Write the eval first.** It must FAIL before any implementation change. One eval per behavior, not per prompt line.
3. **Run the eval.** Confirm it fails for the right reason (not "harness broken").
4. **Make the minimal change.** Edit the prompt / skill / hook. No more than needed to pass.
5. **Re-run.** Green → commit. Red → fix the change, not the eval.
6. **Keep the eval.** It's the regression signal for the next change.

## The harness — `claude -p` subprocess

This project uses Claude Max subscription. Evals MUST shell out to `claude -p` via `Bun.spawnSync`. Do NOT use the Anthropic SDK — that requires a separate `ANTHROPIC_API_KEY` with its own billing.

Minimal harness shape (TypeScript, `tests/evals/<name>.ts`):

```typescript
import { spawnSync } from "bun";

type EvalResult = { transcript: string; finalMessage: string; toolUses: string[]; durationMs: number };

function runClaude(prompt: string, opts: { cwd?: string; timeoutMs?: number } = {}): EvalResult {
  const start = Date.now();
  const proc = spawnSync([
    "claude", "-p", prompt,
    "--output-format", "json",
  ], {
    cwd: opts.cwd ?? process.cwd(),
    timeout: opts.timeoutMs ?? 120_000,
    stdout: "pipe",
    stderr: "pipe",
  });

  const raw = new TextDecoder().decode(proc.stdout);
  const lines = raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

  const finalMessage = lines.filter((e) => e.type === "assistant").pop()?.message?.content
    ?.filter((c: { type: string }) => c.type === "text")
    ?.map((c: { text: string }) => c.text)
    ?.join("\n") ?? "";
  const toolUses = lines
    .flatMap((e) => e.message?.content ?? [])
    .filter((c: { type: string }) => c.type === "tool_use")
    .map((c: { name: string }) => c.name);

  return { transcript: raw, finalMessage, toolUses, durationMs: Date.now() - start };
}
```

Key flags:
- `-p <prompt>`: one-shot mode, no REPL
- `--output-format json`: structured output (each event on its own line; final assistant message + tool uses parseable)
- NO `--bare`: we WANT hooks to load (that's part of what we test)
- Use `cwd` to pin the session to a fixture directory when hooks depend on CWD

## Eval shapes by target

**Skill routing (do.md)**: prompt = "I want to build a rate limiter" → assert `toolUses` includes `Skill("ship-feature", ...)`.

**Hook behavior (pre-destructive-blocker)**: prompt = "run `rm -rf /`" → assert `finalMessage` contains the block message; assert NO Bash tool_use fires.

**SKILL.md body**: prompt = "How do I use X library?" with `research-first` skill in scope → assert `toolUses` includes `mcp__docfork__search_docs` before any `Write`/`Edit`.

**Prompt template**: run the template with 3-5 canonical inputs, assert the output shape (regex for headings, JSON structure, tone check).

Don't write 50 evals. Write 3-5 that cover the surprise failures.

## Red → Green discipline

| Step | Check |
|---|---|
| Red | eval fails for the right reason (not harness bug, not timeout) |
| Green | smallest change that passes; don't refactor the prompt to "look cleaner" while in green |
| Keep | eval stays in `tests/evals/` — name it after the behavior, not the fix (`routes-ship-feature.ts`, not `fix-do-router.ts`) |

## Storage + wiring

- Evals live in `tests/evals/<name>.ts`
- Run with `bun test tests/evals/` (picks up `.test.ts` / explicit imports)
- For slow evals, gate with `EVAL_SLOW=1` env — otherwise they run on every `bun test`
- Record fixtures in `tests/evals/fixtures/` — don't inline long prompts

## Chains with

- **`test-driven-development`** — covers unit/integration code; `evals-first` covers LLM behavior. Both can fire for the same feature.
- **`writing-skills`** — when adding or modifying a skill, `writing-skills` delegates the eval to this skill.
- **`ship-feature`** Phase 1 — if the feature touches prompt surface, insert this skill before the implementation step.

## Hard rules

1. **Eval before implementation.** If there's no eval, the change is a vibe, not an improvement.
2. **Never mock Claude.** The eval must run the real `claude -p` subprocess. Mocked "Claude would output X" proves nothing.
3. **Never delete an eval to make a change pass.** If the eval becomes wrong, first document WHY (comment or commit body), then change it.
4. **Never silence a failing eval.** Skip is not a valid state. Fix or delete.

## What this skill avoids

- Token-cost optimization — Claude Max is flat-rate; run the evals you need.
- Fancy eval frameworks (deepeval / promptfoo) — subprocess + `bun test` is enough; add frameworks only when the pattern outgrows 20 evals.
- Perfect evals — a slightly loose assertion that catches 90% of regressions beats a perfect one that takes 4 hours to write.
