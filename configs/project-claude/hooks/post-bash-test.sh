#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook: after build/compile commands, auto-run the project test suite.
# Advisory only — reports test results but does not block.

# Fail-open: advisory hook, allow tool through if jq is missing.
if ! command -v jq >/dev/null 2>&1; then
  printf '{"decision":"allow"}\n'
  exit 0
fi

input="$(cat)"

tool_name="$(printf '%s' "$input" | jq -r '.tool_name // empty')"

if [[ "$tool_name" != "Bash" ]]; then
  printf '{"decision":"allow"}\n'
  exit 0
fi

command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"

if [[ -z "$command" ]]; then
  printf '{"decision":"allow"}\n'
  exit 0
fi

# Check if the command looks like a build/compile operation
is_build_command=0
build_patterns=(
  'npm run build'
  'npm run compile'
  'yarn build'
  'bun run build'
  'cargo build'
  'cargo compile'
  'go build'
  'make build'
  'make all'
  'make compile'
  'tsc'
  'just build'
  'just compile'
  'mvn compile'
  'mvn package'
  'gradle build'
  'gradle assemble'
)

for pattern in "${build_patterns[@]}"; do
  if printf '%s' "$command" | grep -qF "$pattern"; then
    is_build_command=1
    break
  fi
done

if [[ $is_build_command -eq 0 ]]; then
  printf '{"decision":"allow"}\n'
  exit 0
fi

# Find the project root
project_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Detect and run the appropriate test suite
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
    printf '{"decision":"allow"}\n'
    exit 0
  fi
fi

if [[ -f "package.json" ]]; then
  if jq -e '.scripts.test' package.json &>/dev/null; then
    runner="npm"
    command -v bun &>/dev/null && runner="bun"
    command -v yarn &>/dev/null && [[ -f "yarn.lock" ]] && runner="yarn"
    run_tests "$runner test --passWithNoTests 2>/dev/null || $runner test" "$runner"
    printf '{"decision":"allow"}\n'
    exit 0
  fi
fi

if [[ -f "Cargo.toml" ]]; then
  run_tests "cargo test" "cargo"
  printf '{"decision":"allow"}\n'
  exit 0
fi

if [[ -f "go.mod" ]]; then
  run_tests "go test ./..." "go"
  printf '{"decision":"allow"}\n'
  exit 0
fi

if [[ -f "Makefile" ]] && grep -q '^test:' Makefile; then
  run_tests "make test" "make"
  printf '{"decision":"allow"}\n'
  exit 0
fi

# No test suite detected
printf '{"decision":"allow"}\n'
