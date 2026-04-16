<!-- Generated: 2026-04-14 | Updated: 2026-04-14 -->

# tests/e2e

## Purpose

End-to-end integration tests for the **code-tools installer**. These tests run the installer inside isolated Docker containers (Ubuntu / Arch / Fedora) against a pristine environment, then assert that the expected `~/.claude/` layout, hooks, permissions, and binaries are in place. They catch OS-specific regressions (package manager paths, shell rc layouts, hook executability) that unit and integration tests cannot.

- **Framework:** `bun test` + `testcontainers` (`GenericContainer.fromDockerfile`)
- **Isolation:** each test builds a fresh image and starts a throwaway container
- **Gating:** disabled by default — only run when `RUN_E2E_TESTS=true` **and** Docker daemon is reachable

## Parent

See `../AGENTS.md` for the full `tests/` contract (unit, integration, e2e, behavioral, scenarios, ci, fixtures).

## Key Files

| File | Description |
|------|-------------|
| `containers.test.ts` | Bun test suite — builds `ubuntu.Dockerfile`, copies repo to `/app`, runs `bin/setup.ts --non-interactive --tier primordial`, asserts `settings.json` deny-rules count (>= 40), hook executability, and `jq` availability. Second test runs installer twice to verify idempotency. Test timeout 300s each. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `containers/` | Dockerfiles for each target OS — `ubuntu.Dockerfile` (ubuntu:24.04 + apt), `arch.Dockerfile` (archlinux:latest + pacman), `fedora.Dockerfile` (fedora:41 + dnf). All three install `curl unzip git sudo`, then install Bun via the official script, set `PATH="/root/.bun/bin:${PATH}"`, and `WORKDIR /app`. |
| `scenarios/` | Declarative YAML scenario specs — `ubuntu-primordial.yaml`, `ubuntu-full.yaml`, `arch-primordial.yaml`, `fedora-primordial.yaml`. Each declares `container`, `command`, `preconditions` (e.g. `no_claude_config: true`), and `expected` (exit code, `files_exist` list, `binaries_available` list, `settings_deny_rules_min`). |

## For AI Agents

### Running E2E Tests

```bash
# Prerequisites: Docker daemon running + Bun >= 1.2
RUN_E2E_TESTS=true bun test tests/e2e/

# Single test
RUN_E2E_TESTS=true bun test tests/e2e/containers.test.ts

# Without RUN_E2E_TESTS=true, the suite is skipped via describe.skipIf
bun test tests/e2e/          # -> skipped
```

The suite uses `describe.skipIf(!hasDocker || !runE2E)` — if Docker is unreachable or the flag is unset, every test in the block is skipped. This keeps `bun test` fast for local dev while allowing CI / manual runs to opt in.

### Hard Rules

1. **Never run E2E against the developer's real `~/.claude/`.** Every test MUST go through `testcontainers` or an equivalent sandbox. Writing to the host `$HOME` is a critical bug.
2. **Keep tests under the 300s timeout.** Large apt/dnf installs can blow past this — if you need heavier setup, bake it into the Dockerfile layer (cacheable) rather than `container.exec`.
3. **Idempotency is a first-class test.** When adding a new tier or component, add a companion "run twice, both exit 0, final state unchanged" case.
4. **Mirror scenarios across OSes.** When adding a new primordial expectation (file, binary, deny rule), update `ubuntu-primordial.yaml`, `arch-primordial.yaml`, and `fedora-primordial.yaml` together — they are expected to stay in sync.
5. **`settings_deny_rules_min: 40` is the minimum deny-list floor.** This matches the hard floor in `src/primordial.ts` / `configs/home-claude/settings.json`. If you raise the floor in source, raise it in every scenario YAML.
6. **Assert hook executability, not just presence.** Use `test -x` (as in `containers.test.ts`) — a non-executable hook is a silent regression because Claude Code skips unrunnable hooks.

### Adding A New Container Target

1. Add `tests/e2e/containers/<os>.Dockerfile` — install `curl unzip git sudo`, install Bun, set `PATH`, `WORKDIR /app`.
2. Add `tests/e2e/scenarios/<os>-primordial.yaml` mirroring the existing primordial scenarios.
3. Add a `describe.skipIf(...)` block in `containers.test.ts` (or factor into a helper) with at least: install, primordial install, idempotent re-run.
4. Register the OS in CI matrix (see `.github/workflows/`).

### Debugging A Failing E2E Run

- Tests pipe installer output via `2>&1` into `exec.output`. Print `installResult.output` / `result.output` in the failing assertion to see what the container saw.
- To repro interactively, build the image manually and drop into a shell:
  ```bash
  docker build -t code-tools-e2e -f tests/e2e/containers/ubuntu.Dockerfile .
  docker run --rm -it -v "$PWD:/app" -w /app code-tools-e2e bash
  # then: bun install --frozen-lockfile && bun run bin/setup.ts --non-interactive --tier primordial
  ```
- Do NOT `docker exec` into a test-owned container — the `finally { container.stop() }` block tears it down as soon as the test returns.

### Writer vs Reviewer

Authoring new e2e tests and approving their coverage are separate passes. After writing, hand the review lane to `code-reviewer` or `verifier` — do not self-approve in the same context.

## Dependencies

### Runtime (Test Infra)

| Package | Version | Role |
|---------|---------|------|
| `bun:test` | built-in | Test runner (`describe`, `test`, `expect`, `describe.skipIf`) |
| `testcontainers` | `^10.0` (root `package.json`) | `GenericContainer.fromDockerfile`, `withCommand`, `withCopyDirectoriesToContainer`, `container.exec` |

### External Requirements

- **Docker** daemon reachable (checked at module-load via `docker info`)
- **`RUN_E2E_TESTS=true`** environment variable (tests are `skipIf` otherwise)
- **Bun** `>= 1.2` on the host (to run `bun test`); **Bun is also installed inside each container** via the official install script in every Dockerfile
- **Network egress** from the Docker build context — Dockerfiles fetch packages from apt/pacman/dnf mirrors and Bun from `bun.sh/install`

### Env Vars Consumed

| Var | Effect |
|-----|--------|
| `RUN_E2E_TESTS` | Must be `"true"` for the `describe` block to run; anything else skips |

<!-- MANUAL: -->
