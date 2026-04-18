---
name: audit-rigor
description: [yka-code] Discipline for audit, review, and technology-comparison tasks. Use when the request is "audit X", "review our stack", "is this the best option", "compare alternatives", "what should we swap / add / drop", or any task that produces prioritized recommendations rather than new code. Enforces a ≥70% confidence threshold, delegate-retrieval-to-subagent pattern, inline citations with ISO dates, MCP-first sourcing, and a fixed output format (SWAP / ADD / DROP / KEEP-BUT-UPGRADE / SURPRISE). Pair with research-first (retrieval discipline) and karpathy-guidelines (surgical scope). Chained from security-audit, onboard-codebase, and any /do route that smells like "is this the best we have".
---

# Audit rigor

Audits are different from coding work. The output is a set of **recommendations**, not artifacts. The failure mode is different too — a sloppy audit ships with hedged claims, unverified version assertions, and bloated main context. This skill prevents that.

## When to load this skill

Load `Skill(audit-rigor)` at Phase 0 of any task that matches:

- "audit our …" / "review …" / "is this the best …" / "compare X vs Y"
- "what should we swap / add / drop" / "evaluate our stack"
- Stack reviews ("is our tooling still current"), architecture reviews, vendor comparisons
- Also auto-chained by `security-audit` and `onboard-codebase` via their Phase 0

Do NOT load for:
- Plain bug fixes, feature work, refactors (use the matching /do route)
- Single library lookups ("how does X work") — that's `research-first` territory alone

## The seven rules

### 1. Confidence threshold ≥70%

Drop any finding you wouldn't stake credibility on. No hedged "might be worth considering". If you're less than 70% sure, either verify further or leave it out. Low-confidence findings pollute the report and waste the reader's attention.

### 2. Delegate retrieval to subagents

When the audit requires pulling changelogs, multi-repo surveys, doc fetches — **delegate to `Agent()` with a word budget**. Main context stays for classification, synthesis, and final structure. The retrieval (which eats tokens) burns in the subagent.

Rule of thumb from `research-first`: raw content >2000 tokens → subagent.

### 3. Subagent prompts open with a skill-load preamble

Every `Agent(prompt: ...)` call you spawn must start with:

```
At your own Phase 0, invoke these in parallel via the Skill tool:
  Skill(skill: "karpathy-guidelines")
  Skill(skill: "research-first")
Then proceed with the task below.
```

Main's loaded skills do NOT transfer to subagents — each context is fresh. The discipline has to self-load on the other side.

### 4. Cite every version-specific claim inline

Format:
```
<claim> — <source + ISO date>
```

Examples:
- "Biome v2.3 ships WebAssembly-speed TypeScript parsing — biome/biome v2.3.0 release notes, 2026-03-15"
- "setup-bun@v2 added package-manager-cache: false in PR #140, 2025-10-09 — oven-sh/setup-bun"

Not at the end of a paragraph. Next to the claim. One claim per citation.

### 5. Pin the date up front

Run `date -I` once at the start. Stamp the whole audit with that date ("audit as of 2026-04-18"). Individual claims inherit that date unless the user pinned a different reference. Never let a version claim float without a date.

### 6. MCPs before web search

For any library / framework / repo / API claim:
1. `mcp__docfork__search_docs` → `fetch_doc` on top result
2. `mcp__deepwiki__ask_question` for "does X exist / did they ship Y"
3. `mcp__github__*` for release state (`list_releases`, `get_release_by_tag`)
4. Only fall back to `WebFetch` / `WebSearch` when MCPs don't cover the source

Escalate on miss, don't guess. If MCPs can't reach the answer, say so explicitly and mark the finding unverified.

### 7. Fixed output format

Every audit returns in this shape, no narrative prose:

```markdown
## SWAP — replace with better alternative
- <component> → <alternative>. Why: <one sentence>. Evidence: <citation + date>. Confidence: X%

## ADD — missing from our stack
- <new tool / skill / pattern>. Why: <one sentence>. Evidence: <citation + date>. Confidence: X%

## DROP — no longer earning its keep
- <component>. Why: <deprecated / superseded / abandoned>. Evidence. Confidence: X%

## KEEP-BUT-UPGRADE — still right, but behind current version
- <component> @ vX → vY. What changed. Evidence. Confidence: X%

## SURPRISE — things that updated your mental model
- <finding>. Evidence.
```

One bullet per finding. No hedged language. No marketing copy. No "could be nicer" bikeshedding.

## Hard rules

1. **Never self-approve an audit.** The writer and the reviewer must be different contexts. If you produced the audit, hand the verification to a fresh subagent or a different session.
2. **Never recommend adopting something you haven't cited upstream for.** Training-data vibes are not evidence.
3. **Never widen scope.** If the user asked about CI, the audit is about CI. Don't list unrelated findings "while you're here."
4. **Never hide an "unverified" finding** — if the MCPs couldn't resolve a claim, surface it explicitly in its own "UNVERIFIED" section rather than slipping it into SWAP / ADD.
5. **Never exceed the user's budget.** If they said "under 500 words", obey. Confidence % + one-line bullets force economy.

## Chains with

- `research-first` — owns the retrieval discipline; audit-rigor owns the *recommendation* discipline on top of it
- `karpathy-guidelines` — surgical scope, think-before-coding (apply to recommendations too)
- `security-audit` — chains to audit-rigor for discipline; supplies the domain (vulns)
- `onboard-codebase` — chains to audit-rigor when the orientation produces "what's worth changing" recommendations
- `team-do` — when an audit is verification-heavy (reviewer + challenger debate), upgrade to team mode

## What this skill avoids

- Owning the WHAT of any specific audit (that's `security-audit`, `code-review`, etc.)
- Replacing `research-first` — both load together; research-first handles claims, audit-rigor handles the recommendation report wrapping them
- Prescribing which tools to use for retrieval (that's `research-first`'s MCP table)
