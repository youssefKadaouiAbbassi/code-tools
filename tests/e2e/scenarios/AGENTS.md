<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# tests/e2e/scenarios/

## Purpose

Declarative YAML specs that describe **what a successful end-to-end install looks like** for each supported OS / tier combination. Each file pairs a container image with an installer invocation and the post-install assertions the installer must satisfy: exit code, required files under `/root/.claude/`, required binaries on `PATH`, and the minimum number of `permissions.deny` rules in `settings.json`.

These YAMLs are the single source of truth for "what does 'installed' mean on distro X at tier Y" — the imperative assertions in `../containers.test.ts` are expected to match them and must be updated together.

## Parent

See `../AGENTS.md` for the full `tests/e2e/` contract (Docker gating, `RUN_E2E_TESTS=true`, 300s timeout, idempotency rule, mirror-across-OSes rule).

## Key Files

| File | Tier | Container | Purpose |
|------|------|-----------|---------|
| `ubuntu-primordial.yaml` | primordial | `ubuntu.Dockerfile` | Baseline Debian/apt install — 6 hooks, `.tmux.conf`, `starship.toml`, deny floor 40 |
| `ubuntu-full.yaml` | full (default) | `ubuntu.Dockerfile` | Full-tier install on Ubuntu — only asserts the core subset (`settings.json`, `CLAUDE.md`, `pre-destructive-blocker.sh`) plus binaries + deny floor |
| `arch-primordial.yaml` | primordial | `arch.Dockerfile` | Arch/pacman parity check — same file list and deny floor as `ubuntu-primordial.yaml` |
| `fedora-primordial.yaml` | primordial | `fedora.Dockerfile` | Fedora/dnf parity check — same file list and deny floor as `ubuntu-primordial.yaml` |

## Scenario Schema

Each YAML file follows this shape:

```yaml
name: <human-readable scenario label>
container: <dockerfile basename in ../containers/>
command: [<argv array executed inside the container>]
preconditions:
  no_claude_config: <bool>      # assert /root/.claude absent before install
expected:
  exit_code: <int>              # required installer exit code
  files_exist:                  # absolute paths that must exist post-install
    - /root/.claude/settings.json
    - /root/.claude/CLAUDE.md
    - ...
  binaries_available:           # names resolvable via `which` / PATH
    - jq
    - tmux
  settings_deny_rules_min: <int>   # jq '.permissions.deny | length' floor
```

The three primordial scenarios expect the same 10 files, the same 2 binaries, and the same deny-rule floor of 40. `ubuntu-full.yaml` is a thinner spec that only asserts the core subset because the "full" tier currently shares the primordial guarantees plus tier-specific additions that are not yet captured as scenario keys.

## For AI Agents

### When to Edit These Files

1. **New hook script added to primordial tier** -> add its `/root/.claude/hooks/<name>.sh` path to `files_exist` in `ubuntu-primordial.yaml`, `arch-primordial.yaml`, AND `fedora-primordial.yaml` (all three must stay in sync per `../AGENTS.md` rule #4).
2. **New required binary** (installed by `bootstrap.sh` or a component) -> append to `binaries_available` in every applicable scenario.
3. **Deny-rule floor raised in `src/primordial.ts` / `configs/home-claude/settings.json`** -> raise `settings_deny_rules_min` in every scenario to match. The floor must never drop below 40 (parent rule #5).
4. **New OS target** -> follow `../AGENTS.md` "Adding A New Container Target": add `../containers/<os>.Dockerfile`, then add `<os>-primordial.yaml` here mirroring the existing primordial specs byte-for-byte except for `name` and `container`.
5. **New tier** (e.g. `full`, `pro`) -> add `<os>-<tier>.yaml` covering the tier-specific file/binary additions. Use `ubuntu-full.yaml` as the template for non-primordial tiers.

### Hard Rules

1. **Keep primordial scenarios in lockstep.** `ubuntu-primordial.yaml`, `arch-primordial.yaml`, and `fedora-primordial.yaml` must declare identical `files_exist`, `binaries_available`, and `settings_deny_rules_min`. A diff across these three outside of `name` / `container` is a bug.
2. **Use absolute paths in `files_exist`.** All paths are rooted at `/root/` (the container runs as root). Never use `~` or relative paths — they will not expand inside the test assertion.
3. **`settings_deny_rules_min: 40` is a floor, not a target.** It mirrors the hard-coded `toBeGreaterThanOrEqual(40)` in `../containers.test.ts`. If you lower it here, the runtime check will still fail; keep them aligned.
4. **`command` is an argv array, not a shell string.** Wrap each token individually (e.g. `["bun", "run", "/app/bin/setup.ts", "--non-interactive", "--tier", "primordial"]`). No shell metacharacters, no `&&`, no pipes — the runner passes this straight to `container.exec(...)`.
5. **`container` value must match a file in `../containers/`.** Valid values today: `ubuntu.Dockerfile`, `arch.Dockerfile`, `fedora.Dockerfile`. A typo silently falls through to "scenario ignored" depending on the loader.
6. **Do not add secrets or host paths.** These files are committed and run inside throwaway containers; anything host-specific breaks CI.

### Validating A Scenario

There is no bundled schema validator yet. To sanity-check a scenario:

```bash
# YAML parse check (uses Bun's built-in yaml support)
bun -e "import {parse} from 'yaml'; console.log(parse(await Bun.file('tests/e2e/scenarios/ubuntu-primordial.yaml').text()))"

# Diff primordial scenarios — non-trivial output means drift
diff <(grep -vE '^(name|container):' tests/e2e/scenarios/ubuntu-primordial.yaml) \
     <(grep -vE '^(name|container):' tests/e2e/scenarios/arch-primordial.yaml)

# Run the e2e suite that reads these expectations
RUN_E2E_TESTS=true bun test tests/e2e/
```

### Relationship To `../containers.test.ts`

As of 2026-04-14, `containers.test.ts` does **not** dynamically load these YAMLs — it hardcodes the Ubuntu primordial + idempotent cases and asserts a subset of each scenario's `expected` block directly in TypeScript. The YAMLs currently serve as:

- The canonical spec that reviewers diff against when the imperative test changes
- The scaffold for a future YAML-driven runner that iterates `scenarios/*.yaml` and drives each through `testcontainers`
- The Arch/Fedora parity contract (which has no matching TypeScript test yet)

When editing a scenario, also update the corresponding assertions in `../containers.test.ts` so the two stay consistent.

### Writer vs Reviewer

Consistent with the root `AGENTS.md`: author new scenario YAMLs here, then hand the approval pass to `code-reviewer` or `verifier` in a separate lane. Do not self-approve scenario coverage in the same context that wrote it.

## Dependencies

### Consumed By

| File | Role |
|------|------|
| `../containers.test.ts` | Current imperative runner — mirrors a subset of these specs manually |
| `../containers/<os>.Dockerfile` | Referenced by `container:` key; must exist for the scenario to be runnable |
| `../../../bin/setup.ts` | Target of `command:`; the installer under test |
| `../../../src/primordial.ts` | Source of truth for the `files_exist` hook list and `settings_deny_rules_min` floor |
| `../../../configs/home-claude/settings.json` | Source of truth for the deny-rule count that drives `settings_deny_rules_min` |

### Runtime Tooling

| Tool | Used For |
|------|----------|
| `yaml` (Bun built-in) | Parsing scenario files if/when the YAML-driven runner lands |
| `jq` | Counting `.permissions.deny` inside the container to validate `settings_deny_rules_min` |
| `docker` + `testcontainers` | Spawning the `container:` image and executing `command:` |

### Env Vars

| Variable | Effect |
|----------|--------|
| `RUN_E2E_TESTS=true` | Required for any scenario to execute (enforced by `../containers.test.ts` `describe.skipIf`) |

<!-- MANUAL: -->
