#!/usr/bin/env bash
# Shell function for tmux status bar: git branch + node/bun version
# Source this file or add to ~/.bashrc / ~/.zshrc:
#   source ~/.config/code-tools/statusline.sh
#
# Then reference in tmux.conf:
#   set -g status-right "#(bash -c 'source ~/.config/code-tools/statusline.sh && code_tools_statusline')"

code_tools_statusline() {
  local parts=()

  # Git branch
  if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
    local branch
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
    if [[ -n "$branch" ]]; then
      # Show dirty indicator
      local dirty=""
      if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
        dirty="*"
      fi
      parts+=(" ${branch}${dirty}")
    fi
  fi

  # Bun version (prefer over node if present)
  if command -v bun &>/dev/null; then
    local bun_ver
    bun_ver="$(bun --version 2>/dev/null | head -1)"
    if [[ -n "$bun_ver" ]]; then
      parts+=("🥟 ${bun_ver}")
    fi
  elif command -v node &>/dev/null; then
    local node_ver
    node_ver="$(node --version 2>/dev/null | sed 's/^v//')"
    if [[ -n "$node_ver" ]]; then
      parts+=(" ${node_ver}")
    fi
  fi

  # Join parts with separator
  local IFS=" | "
  printf '%s' "${parts[*]}"
}

export -f code_tools_statusline
