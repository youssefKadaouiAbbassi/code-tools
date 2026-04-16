---
name: doc-hygiene
description: Documentation discipline for README, CLAUDE.md, docs/, changelogs, design docs. Use when editing or generating any markdown/rst/asciidoc intended for humans or future AI sessions. Enforces brevity (<50 lines unless structurally required), no filler phrases, dated verification, and deletes rules that the code already demonstrates. Complements karpathy-guidelines (general principles) and claude-md-management:claude-md-improver (CLAUDE.md-specific audits).
---

# Doc Hygiene — docs that earn their place

Every documentation line is a line a future human or agent has to read. Docs that don't pay rent should be deleted, not preserved. Inherits `karpathy-guidelines`: Simplicity First, Surgical Changes.

## When to activate

- Editing README.md, CONTRIBUTING.md, CHANGELOG.md, CLAUDE.md, AGENTS.md, GEMINI.md
- Editing anything under `docs/`, `wiki/`, `.github/`, `adr/`, or similar
- Generating new documentation from scratch
- User asks to "document X", "write a README", "update CHANGELOG"
- Part of `ship-feature` when the feature produces user-facing docs
- Part of `onboard-codebase` Phase 6 (writing the final brief)

## Tool dispatch

| Need | Tool |
|---|---|
| Audit existing CLAUDE.md files | `claude-md-management:claude-md-improver` skill (auto-activates on "audit CLAUDE.md") |
| Surface filler/redundant patterns | `ast-grep` for common filler phrases; `Grep` for banned list below |
| Read existing docs structure | `Glob **/*.md` then selectively `Read` |
| Prior doc decisions | `/claude-mem:mem-search "docs\|README"` |
| Verify library claims before documenting them | `docfork` MCP — latest lib docs, catches stale API refs in examples |
| Verify open-source behavior before citing in docs | `deepwiki` MCP — public repo Q&A, confirms current semantics |
| Preview Markdown output | Obsidian (`obsidian` command) for structured reading |
| Generate changelog entries from git | `gh api repos/.../commits` or `git log --oneline` piped through `/commit-commands:commit-push-pr`'s generator |

## The rules

### 1. ≤50 lines per document, unless structural complexity genuinely requires more

50 is a budget, not a limit. If you're over 50, justify it out loud:
- "API reference with 40 methods → one line each = 40 lines" ✅ structural
- "Narrative walkthrough of how to use the feature with 80 lines" ❌ over budget; compress or split

### 2. No filler phrases

Banned (delete on sight):
- "As mentioned above" / "as discussed earlier"
- "It's worth noting that" / "It is important to understand"
- "In conclusion" / "To summarize" / "In summary"
- "At the end of the day" / "At this point"
- "Needless to say" / "Obviously" / "Clearly"
- "Please note that" / "Please be aware"
- "As a matter of fact" / "Of course"
- "In order to" → just "to"
- "Due to the fact that" → "because"
- "Utilize" → "use"

### 3. Write for the reader at speed

- No narrative throat-clearing
- Lead with the conclusion, evidence follows
- Tables/lists > paragraphs when the info is enumerable
- Code examples > prose explanations when both would convey the same thing

### 4. Delete rules that the code already demonstrates

This is the subtle rule. If a rule is followed by the codebase without being documented, the documentation is redundant — delete it. Rules exist to correct drift, not to flatter the reader.

Test: *"If I delete this rule, will any future change violate it?"* If no → delete.

### 5. Date every doc with last-verified accuracy

At the bottom or in frontmatter:
```
<!-- last verified: 2026-04-15 against <tool@version, commit abc1234> -->
```

Lets future readers (human or AI) decide whether to trust it.

### 6. Flag contradictions, don't silently update

If the existing docs say "we use Redis" but the code now uses Postgres, don't just update the doc. Flag the contradiction to the user:
- The drift might be intentional (new decision) → update
- The drift might be unintentional (code changed; doc stayed) → investigate

Silently updating loses the "why" signal.

### 7. Version tool/library references

If docs mention a library: "We use zod ^3.22.0" (not just "zod"). Pinned references reveal staleness quickly on the next read.

### 8. One topic per file

If a single doc covers authentication AND database AND logging, it's three docs fighting for the same filename. Split.

### 9. Links over prose

If another doc (or the code) already explains something, link to it. Don't re-explain in prose.

### 10. Don't document behavior enforced by hooks

Our `pre-secrets-guard` hook blocks secrets. Do not add a doc rule "don't commit secrets" — the hook is self-documenting by running. Adding a prose rule for a hook-enforced behavior is pure duplication.

## Workflow

### Phase 1 — Understand the doc's job

What question does this doc answer? One sentence. If you can't, the doc probably shouldn't exist.

### Phase 2 — Edit or create

- Follow all 10 rules
- Prefer editing > creating. Most doc sprawl comes from new files when an existing file would have fit.

### Phase 3 — Self-audit against the rules

Grep your output for filler phrases. Count lines. Verify frontmatter date.

### Phase 4 — Flag what's dead

If while editing you notice OTHER docs that are now stale or contradicted, surface them to the user in a short list. Don't silently fix them in the same PR (scope creep).

## Hard rules (summary)

- **<50 lines unless justified out loud.**
- **Zero filler phrases.** (See banned list above.)
- **Delete rules the code already demonstrates.**
- **Date and version every doc.**
- **Flag contradictions, don't silently update.**
- **One topic per file.**
- **Links > prose for already-documented behavior.**
- **Don't document hook-enforced behavior.**

## Interaction with other skills

- **karpathy-guidelines** covers the general spirit (Simplicity First, Surgical Changes) — doc-hygiene specializes on markdown artifacts
- **claude-md-management:claude-md-improver** audits CLAUDE.md specifically — doc-hygiene covers all other doc types
- **ship-feature** calls this when producing docs as part of a feature
- **onboard-codebase** Phase 6 calls this when writing the onboarding brief
- **knowledge-base** Phase 3 uses these rules when compiling `wiki/` articles

## What this skill avoids

- Rewriting a 500-line README because it's "too long" without checking the structural complexity justification
- Enforcing arbitrary style beyond the 10 rules (tabs vs spaces, Oxford comma, title case)
- Silently fixing unrelated docs while editing one
- Rebuilding docs that the code self-documents through clarity
