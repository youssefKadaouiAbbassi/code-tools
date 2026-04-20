#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "session-start-update-check"
set -u
trap 'exit 0' ERR

command -v claude >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

local_version="$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
[[ -z "$local_version" ]] && exit 0

cache_dir="$HOME/.claude/cache"
mkdir -p "$cache_dir" 2>/dev/null || true
cache_file="$cache_dir/claude-version-check.json"

now="$(date +%s)"
ttl=86400

latest=""
if [[ -f "$cache_file" ]]; then
  cached_at="$(jq -r '.checked_at // 0' "$cache_file" 2>/dev/null || echo 0)"
  if (( now - cached_at < ttl )); then
    latest="$(jq -r '.latest // empty' "$cache_file" 2>/dev/null || echo "")"
  fi
fi

if [[ -z "$latest" ]]; then
  if command -v gh >/dev/null 2>&1; then
    latest="$(gh release view --repo anthropics/claude-code --json tagName -q '.tagName' 2>/dev/null | sed 's/^v//')"
  fi
  if [[ -z "$latest" ]] && command -v curl >/dev/null 2>&1; then
    latest="$(curl -sf --max-time 3 https://api.github.com/repos/anthropics/claude-code/releases/latest 2>/dev/null | jq -r '.tag_name // empty' 2>/dev/null | sed 's/^v//')"
  fi
  if [[ -n "$latest" ]]; then
    printf '{"checked_at":%s,"latest":"%s"}' "$now" "$latest" > "$cache_file" 2>/dev/null || true
  fi
fi

[[ -z "$latest" ]] && exit 0

newer="$(printf '%s\n%s\n' "$local_version" "$latest" | sort -V | tail -1)"
[[ "$newer" == "$local_version" ]] && exit 0

banner="[yka-code] Claude Code update available: v${local_version} → v${latest}. Run \`claude update\` to upgrade (or autoupdate will apply it on next launch)."

python3 - "$banner" <<'PY' 2>/dev/null || true
import json, sys
print(json.dumps({"systemMessage": sys.argv[1]}))
PY

exit 0
