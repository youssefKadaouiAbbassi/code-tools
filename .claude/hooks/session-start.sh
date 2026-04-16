#!/usr/bin/env bash
set -euo pipefail

# Notification hook: prints context at session start.
# Shows date/time, git branch, and lessons.md summary.

input="$(cat)"

# Print current date and time
printf '\n=== Session Start: %s ===\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"

# Print git branch if inside a repo
if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')"
  repo="$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || printf 'unknown')"
  printf 'Repo: %s | Branch: %s\n' "$repo" "$branch"
fi

# Print summary of tasks/lessons.md if it exists
lessons_file="tasks/lessons.md"
if [[ ! -f "$lessons_file" ]]; then
  # Try from git root
  git_root="$(git rev-parse --show-toplevel 2>/dev/null || printf '')"
  if [[ -n "$git_root" ]] && [[ -f "$git_root/tasks/lessons.md" ]]; then
    lessons_file="$git_root/tasks/lessons.md"
  fi
fi

if [[ -f "$lessons_file" ]]; then
  line_count="$(wc -l < "$lessons_file")"
  printf 'Lessons: %s (%d lines) — review before starting\n' "$lessons_file" "$line_count"
  # Print first 10 lines as a quick summary
  printf '--- lessons.md (first 10 lines) ---\n'
  head -10 "$lessons_file"
  printf '---\n'
fi

printf '\n'

# Notification hooks output to notification channel, not blocking
printf '{"decision":"allow"}\n'
