# Date-pinning examples

The date you research as-of is a **promise**. If you say "as of 2024-06-01" you're asserting the claim reflects state on that date. Pick the date deliberately.

## Case 1: User pins a date

> User: *"How did React Server Components work in Feb 2024?"*

Resolve: date = 2024-02-01 (or whatever mid-Feb ref the user implies).

- Research: `github:list_releases anthropic/react`, filter to ≤ 2024-02-28 tags; or `deepwiki ask_question facebook/react "RSC behavior in 18.3 era"` — deepwiki may not time-travel perfectly, so cross-check with github releases list.
- Cite: *"RSC in React 18.3 (released 2024-04-25, closest stable before that era: 18.2, 2023-06-14). Per react.dev changelog as of Feb 2024, …"*
- Never silently drift to "today" behavior.

## Case 2: User pins a version

> User: *"On Axum 0.7 how do I write a middleware?"*

Resolve: version = `axum@0.7`.

- `docfork:search_docs("middleware", "axum")` — filter docs to 0.7.x if possible; `fetch_doc` on the top result.
- If docfork doesn't segment by version, `github:get_file_contents tokio-rs/axum README.md ref=v0.7.9`.
- Cite: *"Per `axum` v0.7.9 README and `middleware::from_fn` docs …"*
- State the resolved patch version — "0.7" alone is ambiguous if behavior differs between 0.7.0 and 0.7.9.

## Case 3: User pins nothing → today

> User: *"How do I integrate Stripe subscriptions?"*

Resolve: date = today. Run `date -I` once at start.

- Cite: *"Per `docfork:fetch_doc` on Stripe's `Subscription.create` docs, current as of 2026-04-17, …"*
- Any sentence describing current-state behavior gets the ISO-date stamp OR a citation (citation preferred; date stamp is fallback).

## Case 4: Future / unreachable date

> User: *"What will React ship in 20.0?"*

Resolve: unresolvable — future unreleased.

- `github:search_issues facebook/react "20.0"` — find current discussion/RFC.
- Cite: *"React 20 is unreleased as of 2026-04-17. Current RFC discussion (github.com/facebook/react/discussions/xxxx) suggests …"*
- Never assert unreleased behavior as factual.

## Case 5: Past-beyond-MCP-reach

> User: *"What was Linux kernel 2.4 epoll semantics?"*

Resolve: historical, likely beyond MCP coverage.

- Try `deepwiki ask_question torvalds/linux "epoll behavior in 2.4"` — may or may not have deep history.
- Try `github:list_tags torvalds/linux`, find a 2.4.x tag, `get_file_contents fs/eventpoll.c ref=v2.4.37`.
- If no MCP resolves: *"Unverified — MCPs don't cover kernel 2.4 era with confidence. Training-cutoff memory: <brief>. Recommend checking Linux 2.4 changelogs directly."*

## The resolution rule

In every response that makes a version-specific claim, one of these must be visible:
- **Version pin:** "On X v1.2.3, …" (user or resolved)
- **Date pin:** "As of 2026-04-17, …" (today)
- **Range pin:** "Between X@1.0 and X@2.0, …"
- **Unverified stamp:** "Unverified (MCP no coverage / training-cutoff): …"

Never none.
