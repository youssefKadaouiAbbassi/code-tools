---
name: clarify-spec
description: "[yka-code] Structured spec-clarification loop — use AFTER brainstorming plateaus (>5 Socratic turns without convergence) OR when a handoff spec at tasks/specs/*.md has ≥3 unresolved ambiguities. Bounded: max 5 questions per session, prioritized by Impact × Uncertainty across 11 ambiguity categories. Writes each Q/A directly into the spec file. Complements brainstorming (open Socratic) with a structured fallback."
---

# Clarify-Spec — bounded-question refinement

When Socratic `brainstorming` plateaus, switch here. This skill picks the **5 highest-leverage questions** from an 11-category ambiguity taxonomy and burns through them deterministically. Output: the spec file is patched in place, no separate artifact.

## When to fire

Activate when any of these are true:

- `brainstorming` ran >5 question turns and the spec is still fuzzy
- A handoff spec at `tasks/specs/*.md` has ≥3 `[NEEDS CLARIFICATION]` markers OR vague phrasing ("appropriate error handling", "reasonable performance", "standard approach")
- User explicitly says: *"help me clarify the spec"*, *"pin down the requirements"*, *"what am I missing"*
- `ship-feature` / `team-do` flagged unresolved items during Stage-1 plan

**Do NOT fire when:**
- The spec is already concrete enough to plan
- The task is small (<30 min, <3 files) — over-refinement costs more than the ambiguity
- The user is mid-implementation (clarify-spec is pre-implementation only)

## The 11-category ambiguity taxonomy

Scan the spec (or the conversation so far) against these categories. For each, ask: *"Is there enough detail here that two engineers would build the same thing?"*

| # | Category | Example gap |
|---|---|---|
| 1 | **Functional scope** | "the feature" — which endpoints, which flows, which user types? |
| 2 | **Domain + data model** | entities, relationships, cardinalities, keys, lifecycle states |
| 3 | **UX / interaction** | error states, empty states, loading, keyboard nav, responsive |
| 4 | **Non-functional requirements (NFRs)** | latency targets, throughput, memory, concurrency, cost |
| 5 | **Integrations** | which services, which versions, failure semantics, rate limits |
| 6 | **Edge cases** | what happens when X is empty / huge / concurrent / stale / malformed |
| 7 | **Constraints** | budget, deadline, stack limits, regulatory (GDPR, HIPAA, SOX) |
| 8 | **Terminology** | the user said "session" — do they mean HTTP session, auth session, game session, tmux session? |
| 9 | **Completion signals** | how do we know it's done? what's the acceptance test? |
| 10 | **Error handling + observability** | what's logged, what's monitored, what alerts, what's retried |
| 11 | **Security + privacy** | authn / authz boundary, data sensitivity, PII handling, secrets |

## The bounded loop (max 5 questions total)

### 1. Prioritize

For each detected gap, score:

- **Impact** (1-5): if we got this wrong, how much rework? 5 = architecture redo, 1 = cosmetic.
- **Uncertainty** (1-5): how unknown is the answer? 5 = coin flip, 1 = one obvious default.

Rank by `Impact × Uncertainty`. Keep the top 5. Discard the rest for THIS session — if they matter, they'll resurface during implementation.

### 2. Ask

Each question MUST be:

- **Answerable in ≤5 words OR a 2-4 option multiple-choice.** No essay questions.
- **One topic per question.** No compounds.
- **Lead with recommended option** marked `(recommended)` with a one-line reason.

Example format:

> **Q1 [Impact 5, Uncertainty 4, cat: NFRs]** What's the p99 latency target for the login endpoint?
> - 100ms (recommended — matches current API SLO)
> - 250ms (relaxed for initial ship)
> - 500ms (noticeable to users, skip)

### 3. Write the answer into the spec IMMEDIATELY

After each user answer, edit the spec file in place:

- Remove the corresponding `[NEEDS CLARIFICATION]` marker OR replace the vague phrasing
- Append a bullet under a `## Clarifications` section with `### Session <date>` subheading, listing the Q and chosen A

Do NOT batch all 5 Qs and then write — write after each, so if the session is interrupted, partial progress persists.

### 4. Terminal state

After the 5th question (or sooner if gaps resolve early):

- Close the `## Clarifications → ### Session <date>` block
- Set spec `Status:` from `brainstormed` to `clarified`
- Emit one line: `Spec clarified at <path>. Routing to /do for classification.`

Do NOT continue into planning or implementation. Hand back to `/do`.

## Anti-patterns (known failure modes)

- **Opening more than 5 questions.** Scope creep. If more clarification is needed after 5, the spec is too large — break it into sub-specs.
- **Asking essay questions.** *"Tell me about your auth model"* burns tokens without convergent answers. Frame as MC or ≤5 words.
- **Skipping Impact × Uncertainty scoring.** Without scoring, you ask the questions that feel interesting, not the ones that unblock the plan.
- **Writing clarifications at the end of the session.** If the session dies (compact, crash), you lose everything. Write after each answer.
- **Re-asking already-answered questions.** Check the spec's existing `## Clarifications` section before picking your 5.

## Chains from / to

- **Chained from** `brainstorming` when Socratic plateaus (>5 turns, still fuzzy)
- **Chained from** `ship-feature` / `team-do` Stage 1 when the plan surfaces ≥3 unresolved items
- **Chains back to** `/do` Phase 1 (re-classify with the clarified spec)
- **Does NOT chain to** implementation — implementation is owned by the classified sub-skill

## What this skill avoids

- Open-ended Socratic questioning — that's `brainstorming`'s job; this skill is structured and bounded
- Asking >5 questions per session
- Over-scoping into an implementation plan — planning is `claude-mem:make-plan` / `team-do` Stage 1
- Running when the spec is already concrete (over-firing wastes tokens)

## Canonical source

Ported from GitHub's `spec-kit` `/speckit.clarify` command (v0.7.3, 2026-04-17). The 11-category taxonomy, max-5 cap, Impact × Uncertainty priority, and write-in-place-after-each-answer rule are all adopted from spec-kit's literal prompt. We skip the rest of spec-kit's 7-stage pipeline (Scott Logic 2025-11-26, Fowler's SDD-3-tools review: *"spec-first only, not spec-anchored over time"*) — `/speckit.clarify` is the one genuinely novel mechanism that complements skills we already have.
