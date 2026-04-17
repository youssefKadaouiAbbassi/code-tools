---
plugin: code-tools
name: release-cut
description: Cut a new release of the current project — semver bump, tag, CHANGELOG entry, optional GitHub release. Use when user says "cut a release", "ship vX.Y.Z", "release this", "/release", or is otherwise preparing a tagged version. Defers to the `claude-mem:version-bump` plugin when present (it handles package.json / Cargo.toml / pyproject.toml / etc.) and adds CHANGELOG + GH-release wiring on top.
---

# Release Cut Workflow

A release is a commit to deploy, tag, and annotate. This skill closes the loop between "feature is merged" and "artifact exists that downstream can pin."

Inherits `karpathy-guidelines`: Goal-Driven — the verifiable criterion is "a new tag exists on origin and downstream can install the new version."

## When to activate

- User says: "cut a release", "ship vX.Y.Z", "release this", "publish the new version", "tag vX"
- User runs `/release`
- A merged feature is ready to go out and the user hasn't specified the mechanism yet

## When to skip

- User wants a commit, not a release → use `commit-commands` instead
- User is mid-development; release would be premature
- The project has its own release automation (e.g., semantic-release in CI) — adapt to that instead of overriding

## Preconditions — verify before acting

1. On a clean working tree (`git status` empty). If not: abort, tell user to commit or stash.
2. On a branch that's merged into default (usually `main`/`master`). A release from a feature branch is almost always wrong.
3. Tests pass in the current state. Run the project's test command and abort on failure.
4. A manifest file the bump plugin understands exists (`package.json`, `Cargo.toml`, `pyproject.toml`, `marketplace.json`, etc.).

## Tool dispatch

| Step | Tool | Why |
|---|---|---|
| Version bump | `/claude-mem:version-bump` | It knows the manifest files, writes consistent semver, handles multi-manifest projects (package.json + marketplace.json + plugin.json) |
| Changelog generation | `git log --pretty=format:'- %s' <prev-tag>..HEAD` | No plugin needed; raw git log filtered by Conventional Commits is accurate enough |
| Tag creation | `git tag -a vX.Y.Z -m 'vX.Y.Z'` | Annotated tag; the message is the summary of what's in this release |
| Tag push | `git push origin vX.Y.Z` | Downstream needs this to pin |
| GitHub release | `gh release create vX.Y.Z --generate-notes --notes-file CHANGELOG-release.md` | Optional; user may have their own release-notes process |
| Announce | `claude-mem` to record the release for future cross-session context | So "when did we ship X?" has an answer |

## Workflow

### Phase 1 — Decide the bump level

Ask the user unless they specified in the activation message. Default to `patch` for bug-fix-only changes, `minor` for new features, `major` for breaking changes.

Use `git log --pretty=format:'%s' <prev-tag>..HEAD` and classify by Conventional-Commit type to recommend:
- Any `!` (breaking) or `BREAKING CHANGE` → major
- Any `feat` → minor
- Only `fix`/`refactor`/`chore`/`docs` → patch

Present the recommendation with the commit list as evidence. User confirms or overrides.

### Phase 2 — Bump version

Invoke `/claude-mem:version-bump` with the chosen level. It updates all manifests. If not installed, write the bump manually — `package.json` is the common case.

### Phase 3 — Generate changelog

Create/update `CHANGELOG.md`:

```
## [X.Y.Z] - YYYY-MM-DD

### Added
- …

### Changed
- …

### Fixed
- …
```

Bucket the commits by Conventional-Commit type: `feat` → Added, `refactor`/`perf` → Changed, `fix` → Fixed. Skip `chore`, `docs`, `test` unless they're notable.

### Phase 4 — Commit the bump

```
git add -A
git commit -m "chore(release): vX.Y.Z"
```

### Phase 5 — Tag + push

```
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin <current-branch>
git push origin vX.Y.Z
```

### Phase 6 — GitHub release (optional)

If the repo has a GitHub remote and the user wants it:

```
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --generate-notes
```

`--generate-notes` lets GitHub auto-compose from merged PRs. Skip it and use `--notes-file CHANGELOG-release.md` if you want the handcrafted changelog as the release notes instead.

### Phase 7 — Record in memory

Append a one-liner to `tasks/lessons.md` under a "Releases" section:

```
- vX.Y.Z (YYYY-MM-DD): <one-line summary of what this release delivered>
```

This gives future sessions an answer to "when did we ship feature X?"

## Hard rules

- **Never `git push --force` a tag.** Tags are immutable; re-tagging is a bug signal, not a workflow.
- **Never skip tests.** If tests are failing, the release is broken — fix first.
- **Never bump past a major without an explicit user confirmation.** Even if the commit log says breaking change, major bumps need a human yes.
- **Publishing is a separate step.** This skill tags; it does NOT run `npm publish`, `cargo publish`, etc. Those belong in CI gated on tag push, or a separate explicit command from the user.

## Calibration examples

**"Cut v2.1.0"** — user specified the version. Go directly to Phase 2 with bump=custom.

**"Release this"** — no version given. Phase 1: recommend from commit log, confirm.

**"Ship the fix we just merged"** — patch bump. Skip Phase 1's interactive ask; the commit type signals fix.

**"I want to publish this to npm"** — activation mismatch. Release-cut does not publish. Either chain with a follow-up `npm publish` (after user confirms package.json is correct) or redirect to the user's CI/release automation.
