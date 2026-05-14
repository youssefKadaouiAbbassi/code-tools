---
name: derive-kind
description: Classify a parcel as pure-fn / io / ui / config / infra to route the right verify gates. Uses ast-grep + path heuristics + claim regex.
when_to_use: Phase 5a entry of every parcel.
allowed-tools: Bash, Read, Grep, Glob
model: opus
---

# derive-kind runbook

## Input

Parcel id passed via $ARGUMENTS. Read `.forge/dag.json`, locate parcel by id, inspect `paths[]` + `claim`.

## Decision (first match wins)

```bash
PARCEL_ID="$1"
PATHS="$(jq -r '.parcels[] | select(.id=="'"$PARCEL_ID"'") | .paths[]' .forge/dag.json)"
CLAIM="$(jq -r '.parcels[] | select(.id=="'"$PARCEL_ID"'") | .claim' .forge/dag.json)"

ui_path='\.(tsx|jsx|vue|svelte)$|^pages/|^components/|^app/.*page\.'
ui_claim='button|form|render|onClick|screen|page|component'
infra_path='^Dockerfile|^docker-compose|\.tf$|\.github/.*\.ya?ml$|^kustomize/|^helm/|^terraform/'
infra_claim='deploy|CI|pipeline|infra|helm|terraform|k8s'
config_path='\.(json|toml|ini)$|^tsconfig|^bunfig|^package\.json$|^\.env|^settings'
config_claim='schema|config|env|manifest'
io_path='^routes/|^api/|^controllers/|\.sql$|^migrations/|^db/|^network/|^fs/'
io_claim='route|endpoint|fetch|query|S3|request|response|network'

# ast-grep refines UI detection: any tsx/jsx file with a default export returning JSX is ui
ast_ui() {
  for f in $(echo "$PATHS" | grep -E '\.(tsx|jsx)$'); do
    [ -f "$f" ] && ast-grep --pattern 'export default function $_($$$) { return <$_/> }' "$f" 2>/dev/null | grep -q . && return 0
  done
  return 1
}

# Strong-IO claim terms that should beat config matching (e.g. an auth /refresh
# route is io even if the architect happens to write the handler under a config/
# directory). Otherwise config still wins for tsconfig/package.json/.env edits.
io_strong_claim='\b(route|endpoint|api|handler|controller|http|request handler|response)\b'

if echo "$PATHS" | grep -qE "$ui_path" || echo "$CLAIM" | grep -qiE "$ui_claim" || ast_ui; then echo ui
elif echo "$PATHS" | grep -qE "$infra_path" || echo "$CLAIM" | grep -qiE "$infra_claim"; then echo infra
elif echo "$PATHS" | grep -qE "$io_path" || echo "$CLAIM" | grep -qiE "$io_strong_claim"; then echo io
elif echo "$PATHS" | grep -qE "$config_path" || echo "$CLAIM" | grep -qiE "$config_claim"; then echo config
elif echo "$CLAIM" | grep -qiE "$io_claim"; then echo io
else echo pure-fn
fi
```

## Output

Single token to stdout: `pure-fn` | `io` | `ui` | `config` | `infra`.

## Routing table consumed by forge-lead

| Kind | pbt-verify | mutation-gate | browser-verify |
|---|---|---|---|
| pure-fn | required | required | skipped |
| io | required if pure-fn boundary derivable | required | skipped |
| ui | optional | required | required |
| config | skipped | skipped | skipped |
| infra | skipped | skipped | skipped |
