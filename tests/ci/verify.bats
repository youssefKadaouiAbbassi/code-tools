#!/usr/bin/env bats

@test "jq is installed" {
  run jq --version
  [ "$status" -eq 0 ]
}

@test "settings.json exists" {
  [ -f ~/.claude/settings.json ]
}

@test "settings.json has 40+ deny rules" {
  count=$(jq '.permissions.deny | length' ~/.claude/settings.json)
  [ "$count" -ge 40 ]
}

@test "CLAUDE.md exists" {
  [ -f ~/.claude/CLAUDE.md ]
}

@test "all 6 hooks are executable" {
  for hook in pre-destructive-blocker pre-secrets-guard post-lint-gate session-start session-end stop-summary; do
    [ -x ~/.claude/hooks/${hook}.sh ]
  done
}

@test "tmux.conf deployed" {
  [ -f ~/.tmux.conf ]
}

@test "starship.toml deployed" {
  [ -f ~/.config/starship.toml ]
}

@test "shell rc has code-tools marker" {
  grep -q '# code-tools-managed' ~/.zshrc 2>/dev/null || grep -q '# code-tools-managed' ~/.bashrc 2>/dev/null
}

@test "backup directory exists" {
  [ -d ~/.claude-backup/ ]
}

@test "backup has manifest" {
  ls ~/.claude-backup/*/manifest.json >/dev/null 2>&1
}
