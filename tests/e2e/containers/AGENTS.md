<!-- Generated: 2026-04-14 | Parent: ../AGENTS.md -->

# tests/e2e/containers

## Purpose

Dockerfile definitions used by the e2e test suite to provision **clean, throwaway Linux environments** for cross-platform installer verification. Each Dockerfile builds a minimal OS image with the prerequisites `bootstrap.sh` expects (`curl`, `unzip`, `git`, `sudo`) plus Bun, then lets `tests/e2e/containers.test.ts` copy the repo in and run `bin/setup.ts --non-interactive --tier primordial` against an untouched `~/.claude/`.

These containers are the only sanctioned place where the installer writes to a real `$HOME` — never point e2e tests at a developer's live `~/.claude/`.

## Key Files

| File | Base Image | Package Manager | Notes |
|------|-----------|-----------------|-------|
| `ubuntu.Dockerfile` | `ubuntu:24.04` | `apt-get` | Primary matrix target — used by both `Ubuntu primordial install` and `Ubuntu idempotent — run twice` tests |
| `fedora.Dockerfile` | `fedora:41` | `dnf` | Exercises the `dnf` branch of `installBinary()` |
| `arch.Dockerfile` | `archlinux:latest` | `pacman` | Exercises the `pacman` branch; `latest` tag means rolling, expect occasional churn |

All three follow the same shape:

```dockerfile
FROM <base>
RUN <pkg-mgr> install -y curl unzip git sudo
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"
WORKDIR /app
```

The repo is copied into `/app` at runtime by `withCopyDirectoriesToContainer` — it is **not** baked into the image, so rebuilds are cheap and the same image serves every test.

## How They're Used

`tests/e2e/containers.test.ts` drives the lifecycle:

1. `GenericContainer.fromDockerfile(CONTAINERS_DIR, "<os>.Dockerfile").build()` — builds the image
2. `.withCommand(["sleep", "infinity"]).withCopyDirectoriesToContainer([{ source: ".", target: "/app" }]).start()` — boots it with the repo mounted at `/app`
3. `container.exec(["bash", "-c", "cd /app && bun install --frozen-lockfile"])` — installs deps inside the container
4. `container.exec(["bash", "-c", "cd /app && bun run bin/setup.ts --non-interactive --tier primordial"])` — runs the installer
5. Assertions against `/root/.claude/settings.json`, hook executability, and `jq` availability

The suite is gated behind two conditions (see `describe.skipIf` in `containers.test.ts`):

- `docker info` must succeed (`hasDocker`)
- `RUN_E2E_TESTS=true` must be set in the environment

Without both, the describe block is skipped entirely — `bun test` stays fast for local runs and only exercises containers when explicitly requested (CI, pre-release, regression hunting).

Run the e2e lane:

```bash
RUN_E2E_TESTS=true bun test tests/e2e/containers.test.ts
```

Per-test timeout is `300_000` ms (5 min) to absorb cold image builds.

## For AI Agents

### Working With These Dockerfiles

- **Keep them minimal.** These are test harnesses, not production images. Only add a package if a failing test requires it.
- **Never embed the repo with `COPY .`** — `testcontainers` handles source sync via `withCopyDirectoriesToContainer`. Adding `COPY` lines invalidates the cache on every edit and duplicates the repo into the image layer.
- **Match the parent contract.** `bootstrap.sh` installs `curl`, `jq`, Bun, and Claude Code via the host package manager. The test fixtures only need the subset required to run `bun install` and exercise `bin/setup.ts` — hence `curl unzip git sudo` plus Bun. `jq` is installed by the installer itself (primordial tier) and asserted in the test, not preinstalled here.
- **Pin base images carefully.** `ubuntu:24.04` and `fedora:41` are pinned to specific releases; `archlinux:latest` is intentionally rolling to catch breakage from upstream package-manager changes. Do not downgrade Ubuntu/Fedora to `latest` without discussing.
- **Stay non-interactive.** `apt-get install -y`, `dnf install -y`, `pacman -Sy --noconfirm` — any prompt will hang the build forever inside `testcontainers`.
- **PATH must include `/root/.bun/bin`** via `ENV`, not a shell `source`. Docker's `RUN` steps and `container.exec` bypass interactive shell init.

### Adding A New OS Target

1. Create `tests/e2e/containers/<os>.Dockerfile` following the pattern above.
2. Add a matching test block in `tests/e2e/containers.test.ts` referencing `"<os>.Dockerfile"`.
3. Confirm `src/utils.ts` `installBinary()` has a branch for that OS's package manager (the installer itself must be able to run there).
4. Update the table above.

### Debugging A Failing Container Test

- Reproduce locally: `docker build -f tests/e2e/containers/ubuntu.Dockerfile .` — isolates image-build failures from test-runtime failures.
- Inspect interactively: `docker run --rm -it -v "$PWD":/app $(docker build -q -f tests/e2e/containers/ubuntu.Dockerfile .) bash`.
- Check `bun --version` inside the container to confirm Bun's `curl | sh` install landed on `PATH`.
- If a pacman/dnf/apt mirror is flaking, rerun; do not add retry logic to the Dockerfile — flakes should be caught, not hidden.

### Do Not

- Do not run these containers against the developer's `~/.claude/` — the whole point is isolation.
- Do not add `apt-get clean` / `rm -rf /var/lib/apt/lists/*` optimizations unless image size becomes a CI bottleneck; test clarity outweighs a few MB.
- Do not self-approve Dockerfile edits. Author here, hand off to `code-reviewer` or `verifier` for the approval pass (Principle 7 — writer != reviewer).

## Dependencies

### Host

| Requirement | Purpose |
|-------------|---------|
| **Docker** (or a compatible daemon — Podman, Colima, Orbstack) | `testcontainers` needs a reachable Docker socket |
| **`docker` CLI on `PATH`** | `dockerAvailable()` in `containers.test.ts` shells out to `docker info` |
| **Env var `RUN_E2E_TESTS=true`** | Gates the suite — unset by default so local `bun test` stays fast |

### Inside Each Image

| Binary | Source | Installed By |
|--------|--------|--------------|
| `curl`, `unzip`, `git`, `sudo` | Distro package manager | Dockerfile `RUN` |
| `bun` | `https://bun.sh/install` | Dockerfile `RUN` |
| `jq` | Distro package manager | The installer itself (primordial tier) — asserted by test |
| `claude` (Claude Code CLI) | Not needed — `primordial` tier does not exercise Claude itself | N/A |

### Test Harness

- `testcontainers` `^10.0` (dev dep in root `package.json`) — builds images and drives container lifecycle
- `bun:test` — test runner and `describe.skipIf` gating

<!-- MANUAL: -->
