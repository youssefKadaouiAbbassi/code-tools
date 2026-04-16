#!/usr/bin/env bash
# SessionStart hook — UCCS banner with CLICKABLE local-tool URLs (OSC 8).
#
# CC 2.1.110 renders hook output as a visible "SessionStart:source says: …"
# panel ONLY when the hook emits JSON with a `systemMessage` field. Plain
# stdout/stderr is captured but not surfaced (claude-mem wins the single
# display slot otherwise).
#
# So: build the banner + URL list in a buffer, JSON-escape it via python,
# and emit {"systemMessage": "<banner>"} — CC renders that as our own panel
# alongside claude-mem's memory banner.
#
# No `set -e`/`pipefail` — stray SIGPIPE must not silently kill the hook.
set -u
trap 'exit 0' ERR

input="$(cat 2>/dev/null || true)"
: "${input:=}"

BOLD=$'\e[1m'; DIM=$'\e[2m'; RESET=$'\e[0m'
CYAN=$'\e[36m'; GREEN=$'\e[32m'

# OSC 8 clickable hyperlink — Ghostty, iTerm2, Wezterm, kitty, GNOME Terminal.
link() { printf '\e]8;;%s\e\\%s\e]8;;\e\\' "$1" "$2"; }

banner_body() {
  printf '%s=== UCCS Session Start: %s ===%s\n' "$BOLD$CYAN" "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$RESET"

  if git rev-parse --is-inside-work-tree &>/dev/null; then
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')"
    repo="$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || printf 'unknown')"
    printf '%sRepo:%s %s  %sBranch:%s %s\n' "$DIM" "$RESET" "$repo" "$DIM" "$RESET" "$branch"
  fi

  lessons_file="tasks/lessons.md"
  if [[ ! -f "$lessons_file" ]]; then
    git_root="$(git rev-parse --show-toplevel 2>/dev/null || printf '')"
    [[ -n "$git_root" && -f "$git_root/tasks/lessons.md" ]] && lessons_file="$git_root/tasks/lessons.md"
  fi

  if [[ -f "$lessons_file" ]]; then
    line_count="$(wc -l < "$lessons_file" 2>/dev/null || echo 0)"
    printf '%sLessons:%s %s (%d lines)\n' "$DIM" "$RESET" "$lessons_file" "$line_count"
    head -10 "$lessons_file" 2>/dev/null | sed "s/^/  ${DIM}│${RESET} /" 2>/dev/null || true
  fi

  mul_front="http://localhost:${MULTICA_FRONTEND_PORT:-3333}"
  mul_back="http://localhost:${MULTICA_BACKEND_PORT:-8080}"
  mem_url="http://localhost:37777"
  cc_url="http://localhost:${CCFLARE_PORT:-8787}/dashboard"

  printf '\n%sLocal tools%s %s(click to open)%s\n' "$BOLD" "$RESET" "$DIM" "$RESET"
  render() {
    printf '  %s•%s %-22s %s→%s  %s' "$GREEN" "$RESET" "$1" "$DIM" "$RESET" "$CYAN"
    link "$2" "$2"
    printf '%s\n' "$RESET"
  }
  render "multica (frontend)"    "$mul_front"
  render "multica (backend API)" "$mul_back"
  render "claude-mem (observer)" "$mem_url"
  render "ccflare (dashboard)"   "$cc_url"
}

# Produce the banner, JSON-escape it with python (handles ANSI + OSC 8 bytes
# safely), wrap as {"systemMessage": …} so CC renders it as a visible panel.
banner="$(banner_body)"
python3 - "$banner" <<'PY'
import json, sys
print(json.dumps({"systemMessage": sys.argv[1]}))
PY

exit 0
