#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_hook-guard.sh" "session-start-team-reaper"
set -u
trap 'exit 0' ERR

teams_dir="$HOME/.claude/teams"
tasks_dir="$HOME/.claude/tasks"
[[ -d "$teams_dir" ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

live_panes="$(tmux list-panes -a -F '#{pane_id}' 2>/dev/null || true)"

now="$(date +%s)"
age_cutoff=$((24 * 3600))

reap_team() {
  local team_path="$1"
  local team_name="$2"
  rm -rf -- "$team_path" 2>/dev/null || true
  [[ -n "$team_name" ]] && rm -rf -- "$tasks_dir/$team_name" 2>/dev/null || true
}

for team_path in "$teams_dir"/*/; do
  [[ -d "$team_path" ]] || continue
  team_name="$(basename "$team_path")"
  config="$team_path/config.json"

  mtime="$(stat -c %Y "$team_path" 2>/dev/null || echo 0)"
  (( now - mtime < age_cutoff )) && continue

  if [[ ! -r "$config" ]]; then
    reap_team "$team_path" "$team_name"
    continue
  fi

  pane_ids="$(jq -r '.members[]? | select(.tmuxPaneId != "" and .tmuxPaneId != null) | .tmuxPaneId' "$config" 2>/dev/null || true)"

  if [[ -z "$pane_ids" ]]; then
    reap_team "$team_path" "$team_name"
    continue
  fi

  any_alive=0
  while IFS= read -r pane_id; do
    [[ -z "$pane_id" ]] && continue
    if printf '%s\n' "$live_panes" | grep -Fxq -- "$pane_id"; then
      any_alive=1
      break
    fi
  done <<< "$pane_ids"

  (( any_alive == 0 )) && reap_team "$team_path" "$team_name"
done

exit 0
