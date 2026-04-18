#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "stop-summary"
source "$(dirname "${BASH_SOURCE[0]}")/_hook-stdin.sh"
# Stop hook: scans recently modified files for debug patterns.
# Advisory only — reports findings but never blocks completion.
# NOTE: no `set -e`, no `pipefail` — grep|head SIGPIPE would otherwise
# kill the script silently and CC reports it as "Failed with non-blocking
# status code: No stderr output". Keep it fault-tolerant end-to-end.
set -u
trap 'exit 0' ERR

read_hook_stdin

# Skip when launched outside a project (e.g., $HOME) — scanning home dir
# floods output with Chrome caches, JSONL transcripts, etc.
if [[ "$PWD" == "$HOME" ]] || [[ ! -d .git && ! -f package.json && ! -f Cargo.toml && ! -f go.mod && ! -f pyproject.toml ]]; then
  exit 0
fi

mapfile -t recent_files < <(
  find . \
    -not -path './.git/*' \
    -not -path './node_modules/*' \
    -not -path './target/*' \
    -not -path './.venv/*' \
    -not -path './dist/*' \
    -not -path './build/*' \
    -not -path './.omc/*' \
    -type f \
    -mmin -5 \
    2>/dev/null
) || true

if [[ ${#recent_files[@]} -eq 0 ]]; then
  exit 0
fi

declare -A patterns
patterns["console.log"]="console\.log\s*\("
patterns["debugger statement"]="^\s*debugger\s*;"
patterns["TODO comment"]="(//|#)\s*TODO"
patterns["FIXME comment"]="(//|#)\s*FIXME"
patterns["Python pdb"]="pdb\.set_trace\s*\("
patterns["Ruby binding.pry"]="binding\.pry"
patterns["print() debug"]="^\s*print\s*\("

found_any=0
report=""

for file in "${recent_files[@]}"; do
  [[ -f "$file" ]] || continue
  file_findings=""

  for label in "${!patterns[@]}"; do
    pattern="${patterns[$label]}"
    if grep -qE "$pattern" "$file" 2>/dev/null; then
      matches="$(grep -nE "$pattern" "$file" 2>/dev/null | head -3 || true)"
      file_findings="${file_findings}  [${label}]:\n${matches}\n"
      found_any=1
    fi
  done

  if [[ -n "$file_findings" ]]; then
    report="${report}${file}:\n${file_findings}\n"
  fi
done

if [[ $found_any -eq 1 ]]; then
  printf '\n=== Stop Hook Advisory: Debug patterns found ===\n' >&2
  printf '%b' "$report" >&2
  printf 'Review these before considering work complete.\n\n' >&2
fi

# Retrospective: did this turn do multi-file work without ever firing team-do?
# If Write/Edit/MultiEdit hit ≥4 distinct files AND no TeamCreate/SendMessage
# call happened, the work may have been parallelizable. Advisory only.
if command -v jq >/dev/null 2>&1; then
  transcript="$(printf '%s' "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || true)"
  if [[ -n "$transcript" && -f "$transcript" ]]; then
    turn_start="$(awk '/"role": *"user"/ { start = NR } END { print (start ? start : 1) }' "$transcript" 2>/dev/null || echo 1)"
    turn_json="$(sed -n "${turn_start},\$p" "$transcript" 2>/dev/null || true)"

    edit_files="$(printf '%s' "$turn_json" | jq -r '
      select(.type == "assistant")
      | .message.content[]?
      | select(.type == "tool_use" and (.name == "Write" or .name == "Edit" or .name == "MultiEdit"))
      | .input.file_path // empty
    ' 2>/dev/null | sort -u | grep -cv '^$' || echo 0)"

    team_used="$(printf '%s' "$turn_json" | jq -r '
      select(.type == "assistant")
      | .message.content[]?
      | select(.type == "tool_use" and (.name == "TeamCreate" or .name == "SendMessage"))
      | .name
    ' 2>/dev/null | head -1 || true)"

    if [[ "${edit_files:-0}" -ge 4 && -z "$team_used" ]]; then
      {
        printf '\n=== Team-do Advisory ===\n'
        printf 'This turn edited %s distinct files with no TeamCreate/SendMessage calls.\n' "$edit_files"
        printf 'Consider: was this parallelizable? Next turn with ≥3 independent parcels,\n'
        printf 're-run /do Phase 1b BEFORE executing — team-do can run phases in parallel\n'
        printf 'and produces ~3–5x faster wallclock with built-in parallel review.\n\n'
      } >&2
    fi
  fi
fi

exit 0
