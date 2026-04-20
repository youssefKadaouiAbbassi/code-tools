---
name: brainstorming
description: "[yka-code] You MUST use this skill BEFORE classifying in /do when requirements are fuzzy — the user said 'rough idea', 'I'm thinking about', 'maybe we should', 'not sure yet', 'figure out', 'something like', or otherwise signaled they haven't nailed scope. Socratic one-question-at-a-time refinement that produces an approved short spec before any plan exists. Do NOT fire on concrete, well-scoped requests — that's over-active and burns tokens."
---

# Brainstorming — turn fuzzy intent into a short approved spec

Loaded by `/do` Phase 1 BEFORE classification, only when requirements are fuzzy. Produces a short spec file that the downstream sub-skill (`ship-feature` / `fix-bug` / `team-do`) consumes — not a full plan, not a task breakdown. Just enough clarity that a plan becomes obvious.

## When to fire

Activate on fuzzy-requirement signals in the user's message:
- "I'm thinking about …"
- "Maybe we should …"
- "Something like …"
- "Not sure yet, but …"
- "Figure out …"
- "Help me decide …"
- Multi-subsystem requests where scope isn't named explicitly

**Do NOT fire on:**
- Concrete requests with clear scope: "add a rate limiter to `/api/login`"
- Bug reports with a repro: "when X happens, Y crashes"
- Refactors with a target: "simplify `deployHooks` in `src/core.ts`"
- Config tweaks, typo fixes, or any single-file change

If unsure, ask yourself: *Can I write a one-sentence success criterion from what the user said?* If yes → skip brainstorming, classify. If no → brainstorm.

## The loop

### 1. Check project state first

Before any question, skim:
- `git status` / recent commits (what's already in flight)
- Relevant directory (`src/`, `configs/`, etc. — match the topic)
- Any `tasks/specs/*.md` with overlapping topic (don't re-brainstorm what's already been scoped)

### 2. Scope check up front

If the request spans multiple independent subsystems, flag that immediately and ask the user which subsystem to brainstorm first. Do NOT brainstorm across subsystems in one pass — the spec rots.

### 3. One question per message

- **Prefer 2-4 option multiple-choice.** Lead with your recommended option marked `(recommended)` and a one-line reason for it.
- **Open-ended allowed** when multiple-choice would force false precision.
- **One topic per question.** Break compound questions into multiple turns.
- **Cover, in roughly this order:** purpose → constraints → success criteria → architecture/approach → data flow → error handling → testing.
- **Scale depth to complexity.** A one-sentence spec doesn't need 10 questions. A multi-subsystem feature might.

### 4. Propose 2-3 approaches with trade-offs

After enough context, propose 2-3 approaches. Each:
- One-line description
- Main trade-off (cost / complexity / risk / time)
- Recommendation with one-sentence reason

### 5. Write the spec

When the user approves an approach, write it to:

```
tasks/specs/YYYY-MM-DD-<short-kebab-topic>.md
```

Template:

```markdown
# <Feature/bug/change name>

**Date:** 2026-04-19
**Status:** brainstormed (awaiting plan)

## Purpose
<1-2 sentences — what outcome this produces for the user>

## Success criteria
- <measurable check 1>
- <measurable check 2>

## Chosen approach
<1 paragraph — what we're building, WHY this over the alternatives>

## Rejected approaches
- <option A> — rejected because <reason>
- <option B> — rejected because <reason>

## Scope boundaries
- IN scope: <what's included>
- OUT of scope: <explicitly excluded>

## Open questions (if any)
- <unresolved item that needs clarify-spec or a plan-time decision>
```

### 6. Terminal state — hand off, do NOT continue

Once the spec file is written and the user approved it, **stop brainstorming**. Emit one line:

> `Spec saved to tasks/specs/<path>. Routing to /do for classification.`

Then let `/do` classify based on the spec. Do NOT:
- Start writing a plan (that's `ship-feature` / `team-do` / `claude-mem:make-plan`)
- Invoke any other skill
- Ask more questions

## Guards against over-firing

Known anti-pattern (Superpowers issue #1222 — brainstorming fires on trivial questions):

- If the user's message is a direct question ("what does X do?", "why does Y fail?"), it's research or fix-bug, not brainstorming.
- If the user provides a single file + single change, skip.
- If the user is reacting to a prior turn (e.g., "yes do that"), they've already approved — skip.
- If `/do` Phase 1 can classify cleanly from the literal words, skip.

Brainstorming is for UPSTREAM ambiguity, not DOWNSTREAM detail.

## If still fuzzy after 5 questions

If the user remains unsure after ~5 Socratic turns, escalate to the `clarify-spec` skill (11-category ambiguity taxonomy, max-5-question bounded loop, Impact × Uncertainty priority). `clarify-spec` is more structured when Socratic refinement plateaus.

## Chains to

- **`clarify-spec`** — when Socratic plateau hits (>5 questions, still fuzzy)
- **`ship-feature` / `fix-bug` / `team-do`** — the spec file is input to whichever `/do` classifies next
- **`karpathy-guidelines`** — Rule 1 "Think Before Coding" already pairs with this; brainstorming makes the think step explicit when the user hasn't done it themselves

## What this skill avoids

- Writing a plan — that's downstream (`claude-mem:make-plan`, `feature-dev`, `team-do` Stage 1)
- Writing task breakdowns — downstream
- Implementing anything — never
- Running more than once per request (one spec per request, overwrite on re-brainstorm)
- Firing on clear, well-scoped requests (see "Do NOT fire" list above)

## Canonical source

Inspired by `obra/superpowers` `brainstorming` skill (2026-04-16, 159k⭐). Adapted to route via our `/do` classifier instead of auto-chaining a Superpowers-style 7-phase pipeline — deliberately narrower to avoid the over-active-gate issue (Superpowers issue #1222, open 2026-04-19).
