# Phase 2 routing plan

Brief triggers (matched against runbook classifier):
- "as of May 11, 2026" → year-bounded → **WebSearch** mandatory
- "market standards" → abstract/subjective → **WebSearch** mandatory
- "compares to" + named CLIs (Claude Code, Cursor, aider, OpenCode, Codex) → **deepwiki** for each named GitHub repo
- "stack choice" + libraries (Bun, commander, cac, etc.) → **docfork** for each lib
- "CLI" + library names → **docfork**
- Prior work in this repo → **claude-mem** (always first)

## Per-parcel routes

- p01-cli-stack
  - mcp__plugin_claude-mem_mcp-search__smart_search  (prior CLI design decisions)
  - mcp__plugin_forge_docfork__search_docs  (bun, commander, cac, citty, @clack/prompts, ink, clipanion)
  - WebSearch  ('best TypeScript CLI framework 2026', 'Bun CLI distribution 2026')

- p02-cli-ux
  - WebSearch  (aider UX, OpenCode TUI, Codex CLI UX, Cursor CLI, Gemini CLI)
  - mcp__plugin_forge_deepwiki__deepwiki_fetch  (Aider-AI/aider, sst/opencode, anthropics/claude-code if indexed)

- p03-code-quality
  - mcp__plugin_forge_docfork__search_docs  (bun spawn / Bun.file / Bun.$)
  - WebSearch  ('typescript CLI architecture patterns 2026')

- p04-market-compare
  - WebSearch  (heavy: agentic CLI comparison May 2026, Claude Code features, OpenCode features)
  - mcp__plugin_forge_deepwiki__deepwiki_fetch  (sst/opencode, Aider-AI/aider, openai/codex if indexed)

- p05-pipeline-design
  - mcp__plugin_forge_docfork__search_docs  (stryker-mutator, fast-check, @veritasacta/verify if indexed)
  - mcp__plugin_forge_deepwiki__deepwiki_fetch  (nizos/tdd-guard)
  - WebSearch  ('protect-mcp ed25519 audit chain 2026')

- p06-distribution-install
  - mcp__plugin_forge_docfork__search_docs  (bun installer)
  - mcp__plugin_forge_deepwiki__deepwiki_fetch  (thedotmack/claude-mem)
  - WebSearch  ('CLI Windows installer best practices 2026')

## Snyk

Brief does NOT mention CVE/vulnerability/audit-deps/security-scan in a dep-scanning sense — but Phase 2 still has a soft requirement to attempt Snyk because forge integrates Snyk MCP. We'll fire one `snyk_package_health_check` on `hyparquet` (forge's sole runtime dep) as audit signal.
