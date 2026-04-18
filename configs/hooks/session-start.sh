#!/usr/bin/env bash
# SessionStart hook: yka-code banner + autoskills auto-seed.
# CC renders hook output as a visible panel only when emitted as JSON with
# `systemMessage`. We build the banner in a buffer, JSON-escape it via python,
# and emit {"systemMessage": "<banner>"}.
set -u
trap 'exit 0' ERR

input="$(cat 2>/dev/null || true)"
: "${input:=}"

BOLD=$'\e[1m'; DIM=$'\e[2m'; RESET=$'\e[0m'
CYAN=$'\e[36m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'

link() { printf '\e]8;;%s\e\\%s\e]8;;\e\\' "$1" "$2"; }

autoskills_seed_if_missing() {
  # Only in a git project that has no project-scope .claude/skills yet.
  git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -z "$git_root" ]] && return 0
  [[ -d "$git_root/.claude/skills" ]] && return 0
  command -v npx >/dev/null 2>&1 || return 0
  # Fire & forget; don't block the session on npx resolution.
  (cd "$git_root" && nohup npx --yes autoskills -y >/tmp/autoskills-$$.log 2>&1 &) >/dev/null 2>&1
}

sessions_today() {
  log_dir="$HOME/.claude/session-logs"
  today="$(date '+%Y-%m-%d')"
  log_file="$log_dir/$today.log"
  [[ -f "$log_file" ]] || { printf '0'; return; }
  # Each session logs two "---" separators; count timestamps instead.
  grep -c '^timestamp:' "$log_file" 2>/dev/null || printf '0'
}

banner_body() {
  printf '%s=== yka-code Session Start: %s ===%s\n' "$BOLD$CYAN" "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$RESET"

  if git rev-parse --is-inside-work-tree &>/dev/null; then
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')"
    repo="$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || printf 'unknown')"
    printf '%sRepo:%s %s  %sBranch:%s %s\n' "$DIM" "$RESET" "$repo" "$DIM" "$RESET" "$branch"
  fi

  count="$(sessions_today)"
  printf '%sSessions today:%s %s\n' "$DIM" "$RESET" "$count"

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

  if [[ -d "$(git rev-parse --show-toplevel 2>/dev/null || printf '/nonexistent')/.claude/skills" ]]; then
    printf '%sProject skills:%s %s.claude/skills/%s (loaded)\n' "$DIM" "$RESET" "$GREEN" "$RESET"
  elif command -v npx >/dev/null 2>&1 && git rev-parse --show-toplevel &>/dev/null; then
    printf '%sProject skills:%s %sseeding via autoskills…%s\n' "$DIM" "$RESET" "$YELLOW" "$RESET"
  fi

  mem_url="http://localhost:37777"

  printf '\n%sLocal tools%s %s(click to open)%s\n' "$BOLD" "$RESET" "$DIM" "$RESET"
  render() {
    printf '  %s•%s %-22s %s→%s  %s' "$GREEN" "$RESET" "$1" "$DIM" "$RESET" "$CYAN"
    link "$2" "$2"
    printf '%s\n' "$RESET"
  }
  render "claude-mem (observer)" "$mem_url"
}

autoskills_seed_if_missing

banner="$(banner_body)"
python3 - "$banner" <<'PY'
import json, sys
print(json.dumps({"systemMessage": sys.argv[1]}))
PY

exit 0
