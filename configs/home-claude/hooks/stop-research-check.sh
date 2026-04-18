#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "stop-research-check"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
# Stop hook: audit the just-ended turn for unsourced library claims.
# Scans the last assistant message in transcript_path for library/framework
# name + version pattern; if found and no docfork/deepwiki/github MCP tool
# was used in the same turn, emit advisory warning to stderr. Non-blocking.
set -euo pipefail
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

read_hook_stdin

transcript="$(printf '%s' "$HOOK_INPUT" | jq -r '.transcript_path // empty')"
[[ -z "$transcript" || ! -f "$transcript" ]] && exit 0

# Research MCP tool names we count as valid research.
research_tools='mcp__docfork__search_docs|mcp__docfork__fetch_doc|mcp__deepwiki__ask_question|mcp__deepwiki__read_wiki_contents|mcp__deepwiki__read_wiki_structure|mcp__github__get_file_contents|mcp__github__list_releases|mcp__github__get_release_by_tag|mcp__github__list_commits|mcp__github__get_commit|mcp__github__list_tags|mcp__github__get_tag|mcp__github__search_issues|mcp__github__search_pull_requests|mcp__github__search_code|mcp__plugin_claude-mem_mcp-search__smart_search|mcp__plugin_claude-mem_mcp-search__search'

# Find the last user-assistant turn boundary. A turn = from last user message
# to end of file. Extract tool uses and text content from that slice.
turn_start="$(awk '/"role": *"user"/ { start = NR } END { print (start ? start : 1) }' "$transcript")"

turn_json="$(sed -n "${turn_start},\$p" "$transcript")"

# Collect assistant text + tool_use names from this turn.
turn_tools="$(printf '%s' "$turn_json" | jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use") | .name' 2>/dev/null | sort -u || true)"
turn_text="$(printf '%s' "$turn_json" | jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text' 2>/dev/null || true)"

[[ -z "$turn_text" ]] && exit 0

# If any research tool was used this turn, we're done.
if printf '%s\n' "$turn_tools" | grep -qE "^(${research_tools})$"; then
  exit 0
fi

# Scan assistant text for library-mention-plus-version patterns.
# Pattern: library keyword + version number (e.g. "React 19", "axum 0.7", "bun 1.2.0")
# or library keyword + version-flagged verb (deprecated/removed/introduced/new in/as of).
#
# Library list is user-extensible via ~/.claude/research-libs.txt (one lib per line,
# bash-regex fragments allowed like `next\.?js`). Falls back to the embedded default.
default_libs='(react|vue|svelte|solid|angular|next\.?js|nuxt|remix|astro|bun|deno|node\.?js|express|fastify|nestjs|prisma|drizzle|mongoose|typeorm|zod|valibot|trpc|tanstack|tailwindcss|sass|django|flask|fastapi|pydantic|pandas|polars|numpy|pytorch|tensorflow|transformers|langchain|langgraph|sqlalchemy|alembic|pytest|poetry|uv|tokio|axum|actix|rocket|serde|clap|diesel|sqlx|reqwest|hyper|gin|echo|chi|gorm|cobra|viper|spring|ktor|gradle|maven|junit|react\s?native|flutter|expo|electron|tauri|stripe|clerk|supabase|firebase|vercel|cloudflare)'

user_libs_file="${HOME}/.claude/research-libs.txt"
if [[ -f "$user_libs_file" ]]; then
  # Join non-empty, non-comment lines with |
  joined="$(grep -vE '^\s*(#|$)' "$user_libs_file" 2>/dev/null | tr '\n' '|' | sed 's/|$//')"
  [[ -n "$joined" ]] && libs="(${joined})" || libs="$default_libs"
else
  libs="$default_libs"
fi
version_ver='(v?[0-9]+(\.[0-9]+){0,3})'
version_verbs='(deprecated|removed|introduced|renamed|landed|shipped|added|since|as of|requires)'

found=""
if printf '%s' "$turn_text" | grep -Eoi "\b${libs}[[:space:]@]+${version_ver}\b" >/dev/null 2>&1; then
  found="$(printf '%s' "$turn_text" | grep -Eoi "\b${libs}[[:space:]@]+${version_ver}\b" | sort -u | head -5)"
fi
if [[ -z "$found" ]] && printf '%s' "$turn_text" | grep -Eoi "${version_verbs}[[:space:]]+(in[[:space:]]+)?\b${libs}\b" >/dev/null 2>&1; then
  found="$(printf '%s' "$turn_text" | grep -Eoi "${version_verbs}[[:space:]]+(in[[:space:]]+)?\b${libs}\b" | sort -u | head -5)"
fi

[[ -z "$found" ]] && exit 0

# Check if the text already includes a "current as of <ISO date>" or "unverified" disclaimer.
if printf '%s' "$turn_text" | grep -qiE "(as of [0-9]{4}-[0-9]{2}-[0-9]{2}|unverified|training.cutoff|current as of)"; then
  exit 0
fi

{
  printf '\n=== Research-First Advisory ===\n'
  printf 'Turn made library/version-specific claims without a research MCP call or date-pin disclaimer:\n'
  printf '%s\n' "$found" | sed 's/^/  - /'
  printf '\nNext turn: cite via docfork:fetch_doc, deepwiki:ask_question, or github MCP — or add "current as of %s" / "unverified, training-cutoff" stamp.\n\n' "$(date -I)"
} >&2

exit 0
