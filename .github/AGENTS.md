<!-- Generated: 2026-04-17 | Parent: ../AGENTS.md -->

# .github/

## Purpose

Two GitHub Actions workflows for the `@youssefKadaouiAbbassi/yka-code-setup` npm package: a verification pipeline on every push/PR and a tag-triggered npm publish via OIDC trusted publishing. Pattern sourced from the same conventions used by Biome, Vite, Prettier, zx, ni, and Commander (April 2026 survey).

## Key Files

| File | Trigger | What it does |
|------|---------|-------------|
| `workflows/test.yml` | `push` to `master`, every `pull_request` | Matrix test (ubuntu + macos × bun 1.2.x + latest), shellcheck, actionlint, real-install bats on Ubuntu + macOS runners |
| `workflows/publish.yml` | `push` tag `v*`, `workflow_dispatch` | Verify tag ↔ package.json, test, pack dry-run, npm publish with `--provenance` (OIDC), GitHub release |

## `test.yml` jobs

| Job | Runner | Needs | Notes |
|-----|--------|-------|-------|
| `test` (matrix) | ubuntu-latest + macos-latest × bun 1.2.x + latest | — | `fail-fast: false`; runs typecheck + unit + integration + scenarios |
| `lint-hooks` | ubuntu-latest | — | shellcheck on `configs/hooks/*.sh`, `configs/project-claude/hooks/*.sh`, `bootstrap.sh` |
| `actionlint` | ubuntu-latest | — | Lints workflow YAML itself — catches shell errors inside `run:` blocks |
| `bats-ubuntu` | ubuntu-latest | `test` | Runs the real installer with `--tier primordial`, then `bats tests/ci/verify.bats` |
| `bats-macos` | macos-latest | `test` | Same, on Apple Silicon |

## `publish.yml` jobs

| Job | Runner | Needs | Permissions | Notes |
|-----|--------|-------|-------------|-------|
| `verify` | ubuntu-latest | — | `contents: read` | Resolves tag ref (push OR `workflow_dispatch` input), hard-fails if `package.json.version` ≠ tag, runs typecheck + tests + `bun pm pack --dry-run` |
| `publish-npm` | ubuntu-latest | `verify` | `contents: read`, `id-token: write` | `environment: release` (manual-approval gate). `npm publish --access public --provenance` via OIDC trusted publishing — no `NPM_TOKEN` secret |
| `github-release` | ubuntu-latest | `verify`, `publish-npm` | `contents: write` | `softprops/action-gh-release@v2` with auto-generated notes; `prerelease: true` when tag contains `-` (e.g. `v0.2.0-rc.1`) |

## One-time setup (manual, by the maintainer)

1. **Register the npm trusted publisher** on npmjs.com → package Settings → Trusted Publishers → Add:
   - Organization/user: `youssefKadaouiAbbassi`
   - Repository: `yka-code`
   - Workflow filename: `publish.yml`
   - Environment name: `release`
2. **Create the `release` environment** on GitHub → repo Settings → Environments → New environment → `release`. Optionally add required reviewers (self-approval still works with a single reviewer).
3. **Ensure `npm >= 11.5.1`** on the runner — the `npm install -g npm@latest` step in `publish-npm` handles this.

No `NPM_TOKEN` secret. No classic automation tokens.

## Release cadence

```bash
# 1. Bump version in package.json (manual)
# 2. Commit + tag + push
git commit -am "chore: release v0.2.0"
git tag v0.2.0
git push origin master --tags
# 3. CI runs publish.yml → verify → publish-npm (awaits approval if reviewer gate on) → github-release
```

Rescue a botched publish without re-tagging:

```bash
# Delete the failed npm publication if needed: npm unpublish @youssefKadaouiAbbassi/yka-code-setup@0.2.0
# Then re-trigger the workflow against the same tag:
gh workflow run publish.yml -f tag=v0.2.0
```

## Conventions

### Action pinning

All actions pinned to major version tags (`@v5`, `@v2`, `@v4`). Dependabot auto-updates these. SHA-pinning is explicitly out of scope for a pre-1.0 CLI — readability matters more than the marginal supply-chain benefit at this size.

### Runner images

`ubuntu-latest` and `macos-latest` (not pinned to `-24.04` / `-14`). Industry standard per the repo survey. Accept the small drift risk; failing jobs tell us immediately.

### Checkout hardening

Every `actions/checkout@v5` in this dir uses `persist-credentials: false` — stops the `GITHUB_TOKEN` from landing in `.git/config` where `npm publish` error output could leak it. Universal pattern across the sampled publish workflows (zx, prettier, ni, vite).

### Cache discipline in publish

The `publish-npm` job does **not** use `oven-sh/setup-bun`'s cache mechanism. Cache poisoning would allow an attacker with write access to a PR to seed the dep cache with a compromised lockfile resolution, which would then be restored by the publish job. Vite does the same (`publish.yml:27 package-manager-cache: false` with a zizmor cite). The test lanes cache freely — different risk profile.

### `id-token: write` placement

Job-level, not workflow-level. Workflow-level `id-token` is silently ignored by npm's OIDC verifier.

### Platform support

`package.json.os: ["darwin", "linux"]` — npm refuses install on Windows. The installer uses unix-shell heavily; pretending Windows works would be worse than explicitly blocking it. Revisit when we have a pure-Bun install path (no `sh -c`).

## Hard rules

1. **Never add an `NPM_TOKEN` secret.** OIDC trusted publishing is the only supported publish path here. If you see yourself writing `${{ secrets.NPM_TOKEN }}`, stop and go fix the trusted-publisher config on npmjs.com instead.
2. **Never remove `persist-credentials: false` in publish.yml** — it's the leak prevention for `GITHUB_TOKEN`.
3. **Never widen `publish-npm` permissions beyond `id-token: write` + `contents: read`** — it's the least-privilege ceiling for trusted publishing.
4. **Never skip the tag ↔ `package.json` gate** — forgetting it lets you tag `v1.2.3` while publishing `1.2.2`.
5. **Never publish from any runner except `ubuntu-latest`.** Matrix is for test only; publish is single-OS.
6. **Never skip hooks** (`--no-verify`) in any `git` step inside a workflow.

## Dependencies

| Action | Version | Role |
|--------|---------|------|
| `actions/checkout` | `@v5` | Clone the repo into the runner (`persist-credentials: false`) |
| `actions/setup-node` | `@v4` | Node runtime for `npm publish` in the publish job |
| `oven-sh/setup-bun` | `@v2` | Bun runtime for install + test + pack |
| `softprops/action-gh-release` | `@v2` | GitHub release creation with auto-generated notes |

| Tool | Installed via | Used by |
|------|---------------|---------|
| `shellcheck` | `apt-get` | `lint-hooks` |
| `bats-core` | `apt-get` (Ubuntu) / `brew` (macOS) | `bats-ubuntu`, `bats-macos` |
| `jq` | `apt-get` / `brew` | `bats-ubuntu`, `bats-macos`, `verify` (version gate) |
| `actionlint` | `curl | bash` | `actionlint` job |

<!-- MANUAL: -->
