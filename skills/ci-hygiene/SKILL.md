---
name: ci-hygiene
description: CI/CD and DevOps hygiene enforcer. Activates when editing GitHub Actions workflows, Dockerfiles, docker-compose, justfile, deploy scripts, or any CI configuration. Enforces pinned versions, proper Claude Code invocation in CI (--bare, API key not Max sub), secret management, and reproducibility. Fills the DevOps gap — no plugin covers this in the wild.
---

# CI Hygiene — make CI deterministic and safe

Claude Code in CI is a different beast than interactive CC. Different auth, different performance profile, different failure modes. This skill enforces the rules that keep pipelines deterministic, secure, and reproducible.

## When to activate

- Editing `.github/workflows/*.yml`, `.gitlab-ci.yml`, `.circleci/config.yml`, other CI config
- Editing `Dockerfile`, `docker-compose.yml`, `Containerfile`
- Editing `justfile`, deploy scripts, release automation
- User asks: "set up CI", "add GitHub Action", "dockerize", "deploy script"
- Review of changes touching any of the above

## Tool dispatch

| Concern | Tool |
|---|---|
| Check current CI config for anti-patterns | `ast-grep` (structural scan), `Grep` for specific patterns (`@latest`, unpinned tags) |
| Look up current versions of CI actions | `docfork` MCP (needs `DOCFORK_API_KEY`) for tool docs |
| Reference similar OSS CI configs | `deepwiki` MCP |
| Dependency vuln scan of the CI image | `snyk_container_scan` (snyk MCP) if Dockerfile in scope |
| IaC scan for Terraform/K8s/etc. | `snyk_iac_scan` |
| Past CI decisions on this repo | `/claude-mem:mem-search "CI"` |
| Plan a large CI overhaul | `/claude-mem:make-plan` + `/claude-mem:do` |

## The rules (enforced on every edit)

### 1. Claude Code in CI uses `--bare`

Interactive CC has hooks, LSP, plugin sync, CLAUDE.md auto-discovery, auto-memory, and keychain reads. In CI, all of that is overhead or a security hazard. `--bare` disables all of it and sets `CLAUDE_CODE_SIMPLE=1`.

```yaml
# ✅ Correct
- run: claude --bare -p "Review this PR" --system-prompt-file .github/prompts/review.md

# ❌ Wrong
- run: claude -p "Review this PR"
```

### 2. API key for CC in CI, NOT a Max subscription

Since the April 4, 2026 enforcement, using a Max subscription in CI will fail. CI must use a dedicated `ANTHROPIC_API_KEY` (or Bedrock/Vertex/Foundry equivalent) stored in CI secrets.

```yaml
# ✅ Correct
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

# ❌ Wrong — relies on interactive OAuth/keychain
```

### 3. Pin every version

No `@latest`, no `@v*`, no floating tags. Every GitHub Action, every Docker base image, every tool install gets a concrete version (ideally a SHA for Actions, a digest for containers).

```yaml
# ✅ Correct
uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1

# ❌ Wrong
uses: actions/checkout@v4
```

```dockerfile
# ✅ Correct
FROM node:22.14.0-bookworm-slim@sha256:...

# ❌ Wrong
FROM node:latest
```

### 4. `justfile` over raw commands in pipeline yaml

Don't hardcode raw `bun test`, `docker build`, etc. in the workflow yaml. Put the command in `justfile` and have the pipeline call `just <target>`. Keeps the pipeline portable; the developer can run the exact same thing locally.

```yaml
# ✅ Correct
- run: just test-ci

# ❌ Wrong (duplicates intent across local + CI)
- run: bun install --frozen-lockfile && bun test
```

### 5. Secrets only in CI secrets manager

Never in env files, never committed, never echoed in logs. Mask them in `set -x` flows.

### 6. Reproducible builds

Lock files must be committed and CI must install from the lock: `bun install --frozen-lockfile`, `npm ci` (not `npm install`), `cargo build --locked`, `uv sync --frozen`, etc.

### 7. Timeouts on everything

Every CI job gets a `timeout-minutes:` (GitHub Actions) or equivalent. Unbounded jobs are a runaway cost risk and obscure infrastructure issues.

### 8. Sandbox layer for any agentic work

If a CI job lets Claude Code or another agent run commands, wrap the agent in `container-use` (per-agent Docker isolation with git-branch scoping) — do NOT give it raw runner access.

### 9. `claude-mem` in deployed envs binds to 127.0.0.1

If any deployment runs claude-mem, confirm it's bound to 127.0.0.1 — never 0.0.0.0 (port 37777 is the risk). This applies mostly to self-hosted dev-container setups.

### 10. Concurrency controls on expensive workflows

`concurrency: group: ... cancel-in-progress: true` on long-running workflows so a new push cancels the stale one. Prevents pipeline backups.

## Workflow

### Phase 1 — Inventory

Before editing, read the current file(s). Summarize what's there. Note every line that violates a rule above.

### Phase 2 — Classify the change

- **Additive** (new job, new step) → apply rules to the new code only. Don't scope-creep into fixing existing violations.
- **Refactor** (rewriting the CI) → opportunity to fix all violations. Do it in one pass with explicit approval.
- **Fix** (broken CI) → minimum change to unblock. File a follow-up note for the unrelated violations.

### Phase 3 — Apply and verify

- Make the edit
- Validate yaml syntax (`yamllint`, or `yq eval .` as a dry parse)
- For GitHub Actions, cross-check against the Actions schema (`yq eval .jobs` roundtrip)
- If Dockerfile touched, run `snyk_container_scan` on the resulting image

### Phase 4 — Test in isolation

- For GitHub Actions: use `act` locally if available
- For Dockerfile: build + run locally; don't rely on CI to catch a broken build
- For deploy scripts: dry-run mode, print-only, or test env

### Phase 5 — Commit with clear intent

Commit message pattern: `ci(<scope>): <what> — <why>`. Include the rule number(s) being enforced if fixing a violation: `ci(workflow): pin actions/checkout to SHA — rule 3`.

## Hard rules (summary)

- **`--bare` for CC in CI.** Always.
- **API key only in CI.** Never Max sub.
- **Pin every version.** SHA for Actions, digest for containers, lockfile for deps.
- **`justfile` wraps commands.** Pipeline yaml just calls `just <target>`.
- **Secrets in secrets manager only.** Never echoed.
- **`--frozen-lockfile` / `npm ci` / `--locked` / `--frozen`.** Reproducible installs.
- **Timeouts on every job.**
- **Concurrency cancellation on expensive jobs.**
- **Container sandbox for agentic work.**
- **claude-mem on 127.0.0.1.**

## Chains to (synergy)

- **`security-audit`** — invoke `snyk_container_scan` / `snyk_iac_scan` in new pipelines; CI is where security regressions get caught.
- **`tdd-first`** — CI pipeline's `test` step is only meaningful if real tests exist. If the repo has none, route there first.
- **`doc-hygiene`** — README badges, CONTRIBUTING's "required checks" section, CHANGELOG release notes for CI changes.
- **`refactor-safely`** — CI overhauls >5 files follow its workflow (baseline green → simplify → re-verify).

## What this skill avoids

- Rewriting a whole CI config when only one line was asked about
- Introducing new tools (linters, validators) the repo doesn't already use
- Blocking CI on advisory issues — if rule N is violated but the user just wanted rule M fixed, note N and fix M
