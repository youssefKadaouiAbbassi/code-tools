#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input="$(cat)"
tool_name="$(printf '%s' "$input" | jq -r '.tool_name // empty')"

if [[ "$tool_name" != "Bash" ]]; then
  exit 0
fi

command_str="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
if [[ -z "$command_str" ]]; then
  exit 0
fi

build_patterns=(
  'npm run build' 'npm run compile'
  'yarn build' 'bun run build'
  'cargo build' 'cargo compile'
  'go build'
  'make build' 'make all' 'make compile'
  'tsc'
  'just build' 'just compile'
  'mvn compile' 'mvn package'
  'gradle build' 'gradle assemble'
)

is_build=0
for pattern in "${build_patterns[@]}"; do
  if printf '%s' "$command_str" | grep -qF "$pattern"; then
    is_build=1
    break
  fi
done

[[ $is_build -eq 0 ]] && exit 0

project_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

run_tests() {
  local test_cmd="$1"
  local label="$2"
  printf '\n=== Auto-test after build (%s) ===\n' "$label" >&2
  output="$(eval "$test_cmd" 2>&1)" && status=0 || status=$?
  printf '%s\n' "$output" >&2
  if [[ $status -eq 0 ]]; then
    printf 'Tests passed.\n\n' >&2
  else
    printf 'Tests FAILED (exit %d). Review output above.\n\n' "$status" >&2
  fi
}

cd "$project_root"

if [[ -f "justfile" ]] || [[ -f "Justfile" ]]; then
  if just --list 2>/dev/null | grep -q '^test'; then
    run_tests "just test" "just"
    exit 0
  fi
fi

if [[ -f "package.json" ]] && jq -e '.scripts.test' package.json &>/dev/null; then
  runner="npm"
  command -v bun &>/dev/null && runner="bun"
  command -v yarn &>/dev/null && [[ -f "yarn.lock" ]] && runner="yarn"
  run_tests "$runner test --passWithNoTests 2>/dev/null || $runner test" "$runner"
  exit 0
fi

if [[ -f "Cargo.toml" ]]; then
  run_tests "cargo test" "cargo"
  exit 0
fi

if [[ -f "go.mod" ]]; then
  run_tests "go test ./..." "go"
  exit 0
fi

if [[ -f "Makefile" ]] && grep -q '^test:' Makefile; then
  run_tests "make test" "make"
  exit 0
fi

exit 0
