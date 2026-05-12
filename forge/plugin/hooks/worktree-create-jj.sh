#!/usr/bin/env bash
set -euo pipefail
LOG=.forge/worktree-snapshots.log
[ -d .forge ] || mkdir -p .forge

event="$(cat || true)"
worktree_path="$(jq -r '.worktree_path // .cwd // empty' <<<"$event" 2>/dev/null || echo)"
session_id="$(jq -r '.session_id // "unknown"' <<<"$event" 2>/dev/null || echo unknown)"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ -z "${worktree_path}" || ! -d "${worktree_path}" ]]; then
  echo "${ts} session=${session_id} status=skip reason=no-worktree-path" >> "$LOG"
  exit 0
fi

if ! command -v jj >/dev/null 2>&1; then
  echo "${ts} session=${session_id} path=${worktree_path} status=skip reason=jj-missing" >> "$LOG"
  exit 0
fi

if (cd "${worktree_path}" && jj util snapshot >/dev/null 2>&1); then
  echo "${ts} session=${session_id} path=${worktree_path} status=ok" >> "$LOG"
else
  echo "${ts} session=${session_id} path=${worktree_path} status=fail" >> "$LOG"
fi
