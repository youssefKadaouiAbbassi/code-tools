#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "post-lint-gate"
set -euo pipefail

# PostToolUse hook: auto-detects stack and runs appropriate linter after file edits.
# Advisory only — reports findings but does not block.

# Fail-open: advisory hook, allow tool through if jq is missing.
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input="$(cat)"

tool_name="$(printf '%s' "$input" | jq -r '.tool_name // empty')"

# Only run after file edit tools
case "$tool_name" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac

file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty')"

if [[ -z "$file_path" ]] || [[ ! -f "$file_path" ]]; then
  exit 0
fi

file_path="$(realpath "$file_path" 2>/dev/null || printf '%s' "$file_path")"
project_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
case "$file_path" in
  "$project_root"/*) ;;
  *) exit 0 ;;
esac

ext="${file_path##*.}"

run_lint() {
  local tool="$1"
  shift
  if command -v "$tool" &>/dev/null; then
    output="$("$tool" "$@" 2>&1)" && status=0 || status=$?
    if [[ $status -ne 0 ]]; then
      # Advisory: print to stderr so it appears as a notification, not a block
      printf 'Lint advisory (%s):\n%s\n' "$tool" "$output" >&2
    fi
  fi
}

case "$ext" in
  ts|tsx|js|jsx|mjs|cjs)
    if [[ -f "$project_root/biome.json" ]] || [[ -f "$project_root/biome.jsonc" ]]; then
      run_lint biome check --no-errors-on-unmatched "$file_path"
    else
      run_lint npx eslint "$file_path" 2>/dev/null || true
    fi
    ;;
  py)
    run_lint ruff check "$file_path"
    ;;
  rs)
    # cargo clippy runs on the crate, not a single file
    crate_root="$(dirname "$file_path")"
    while [[ "$crate_root" != "/" ]] && [[ ! -f "$crate_root/Cargo.toml" ]]; do
      crate_root="$(dirname "$crate_root")"
    done
    if [[ -f "$crate_root/Cargo.toml" ]]; then
      (cd "$crate_root" && run_lint cargo clippy -- -D warnings 2>/dev/null) || true
    fi
    ;;
  go)
    if command -v golangci-lint &>/dev/null; then
      run_lint golangci-lint run "$file_path"
    else
      run_lint go vet "./$(dirname "$file_path")/..."
    fi
    ;;
  sh|bash)
    run_lint shellcheck "$file_path"
    ;;
  *)
    ;;
esac

exit 0
