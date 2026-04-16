#!/usr/bin/env bash
set -euo pipefail

# Stop hook: scans recently modified files for debug patterns.
# Advisory only — reports findings but does not block completion.

input="$(cat)"

# Find files modified in the last 5 minutes, excluding common non-source dirs.
# -mmin -5 handles the time filter portably; no reference-file dance needed.
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
  printf '{"decision":"allow"}\n'
  exit 0
fi

# Debug patterns to check
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
      matches="$(grep -nE "$pattern" "$file" 2>/dev/null | head -3)"
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

printf '{"decision":"allow"}\n'
