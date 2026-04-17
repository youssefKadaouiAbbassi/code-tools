# Citation format

One claim, one citation. Visible next to the assertion, not pooled at the end.

## Acceptable formats

### MCP call + accessed date

```
React 19 removed `useEffect`'s silent-cleanup-on-dep-change behavior —
docfork:fetch_doc https://react.dev/reference/react/useEffect (accessed 2026-04-17)
```

```
Axum 0.7 introduced `middleware::from_fn` as the preferred middleware pattern —
deepwiki ask_question tokio-rs/axum "middleware evolution" (accessed 2026-04-17)
```

```
`session-report` plugin landed in v2.1.95 per release notes —
github get_release_by_tag anthropics/claude-plugins-official v2.1.95
```

### Multiple claims from same source

```
Bun introduced `--bail` in v1.1.9 and `--reporter=json` in v1.2.0 —
both via docfork:fetch_doc https://bun.sh/docs/cli/test (accessed 2026-04-17)
```

### Unverified fallback

```
*Unverified (MCP no coverage, training-cutoff):* Ruby 3.3 might have YJIT
tiering changes. Would need ruby-lang/ruby changelog — flagging for manual check.
```

### "Today" disclaimer when no version-specific claim but current state matters

```
Current as of 2026-04-17: `bun test` supports `--bail`, `--reporter=json`,
`--concurrency=N`. — docfork:fetch_doc on https://bun.sh/docs/cli/test
```

## Not acceptable

```
❌ React 19 removed useEffect silent-cleanup.
(No citation, no date, no MCP — unsourced library claim, lint failure)

❌ According to my training data, Axum 0.7 has middleware...
(Training-data claim without verification — at least stamp "unverified, training-cutoff")

❌ [End of response footer]: Sources consulted: docfork.
(Pooled citations — each claim needs its own inline cite)

❌ React 19 does X. (docfork)
(Parenthetical source tag without URL or date — too vague)
```

## Minimum fields per citation

- **Tool** — `docfork:fetch_doc`, `deepwiki:ask_question`, `github:get_file_contents`, etc.
- **Target** — URL, repo name, file path, release tag
- **Date** — ISO date accessed (for docfork/deepwiki; github citations can use commit SHA or tag instead of date if the ref is pinned)

## Abbreviation shortcut

For readability in prose, after citing the full source once, you can reference subsequent claims from the same result with a short form:

```
React 19 removed silent-cleanup — docfork:fetch_doc https://react.dev/reference/react/useEffect (accessed 2026-04-17). The replacement pattern uses explicit `return` for cleanup [same source].
```

But the first citation must be complete.
