#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input="$(cat)"
tool_name="$(printf '%s' "$input" | jq -r '.tool_name // empty')"

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

advisory_lint() {
  local tool="$1"
  shift
  if command -v "$tool" &>/dev/null; then
    output="$("$tool" "$@" 2>&1)" && status=0 || status=$?
    if [[ $status -ne 0 ]]; then
      printf 'Lint advisory [%s] %s:\n%s\n' "$tool" "$file_path" "$output" >&2
    fi
  fi
}

case "$ext" in
  ts|tsx)
    advisory_lint npx tsc --noEmit --skipLibCheck 2>/dev/null || true
    advisory_lint npx eslint "$file_path" 2>/dev/null || true
    ;;
  js|jsx|mjs|cjs)
    advisory_lint npx eslint "$file_path" 2>/dev/null || true
    ;;
  py)
    advisory_lint ruff check "$file_path"
    advisory_lint mypy "$file_path" --ignore-missing-imports 2>/dev/null || true
    ;;
  rs)
    crate_root="$project_root"
    while [[ "$crate_root" != "/" ]] && [[ ! -f "$crate_root/Cargo.toml" ]]; do
      crate_root="$(dirname "$crate_root")"
    done
    if [[ -f "$crate_root/Cargo.toml" ]]; then
      (cd "$crate_root" && advisory_lint cargo clippy -- -D warnings 2>/dev/null) || true
    fi
    ;;
  go)
    if command -v golangci-lint &>/dev/null; then
      advisory_lint golangci-lint run "$file_path"
    else
      pkg_dir="$(dirname "$file_path")"
      (cd "$project_root" && advisory_lint go vet "./${pkg_dir#$project_root/}/...")
    fi
    ;;
  sh|bash)
    advisory_lint shellcheck "$file_path"
    ;;
esac

exit 0
