# Self-documenting names

## Verbs for functions

| Bad | Good | Why |
|---|---|---|
| `handleInput(x)` | `parseInput(x)` | "handle" is generic; "parse" names the action |
| `doPersist(o)` | `persistSession(o)` | "do" is filler; action + object clarifies scope |
| `tryIt(fn)` | `retryWithBackoff(fn)` | "try" hides intent; the real operation is the retry policy |
| `processUser(u)` | `validateUser(u)` / `enrichUser(u)` | "process" is a code smell — split if it does more than one thing |
| `manageState(s)` | `persistState(s)` / `loadState(s)` | "manage" = too vague |

## Nouns for data

| Bad | Good | Why |
|---|---|---|
| `data` | `userRecords` | data is meaningless |
| `val` | `retryDelayMs` | val has no type, no unit, no domain |
| `result` | `parsedConfig` | "result" restates that the fn returns |
| `info` | `deviceMetadata` | info = I didn't want to name it |
| `x` (outside 3-char loop body) | `user`, `elementIndex`, etc. | single letters only in tight loops with no ambiguity |

## Full words over abbreviations

| Bad | Good | Exception |
|---|---|---|
| `usr`, `cust`, `prod` | `user`, `customer`, `product` | — |
| `conn`, `cfg`, `auth` | `connection`, `configuration`, `authentication` | unless "auth" is the project's canonical term |
| `num`, `arr`, `dict` | `count` or `index`, `collection`, `map` | — |
| `e` in catch blocks | `error` or a specific `validationError` | `e` acceptable only for non-error event params |

**Abbreviations that stay abbreviated** (canonical, not confusing): `url`, `id`, `db`, `http`, `tcp`, `json`, `xml`, `css`, `api`, `ui`. Domain-specific: `mtu`, `pid`, `pwd` (password) — use if the reader in your domain will always know them.

## Plurals signal collections

| Single | Collection |
|---|---|
| `user` | `users: User[]` |
| `failedJob` | `failedJobs: Job[]` |
| `config` | `configs: Config[]` |

Never `userList`, `userArray`, `userMap` — the type already says that. Use `userList` only if it's *semantically a list* (e.g. a display-order list distinct from a set).

## Booleans are predicates

| Bad | Good |
|---|---|
| `active` | `isActive` |
| `access` | `hasAccess` |
| `retry` | `shouldRetry` |
| `error` | `hasError` or `didError` |
| `done` | `isDone` or `isComplete` |

Prefixes (`is`, `has`, `should`, `can`, `did`, `will`) make predicates unambiguous at the call site: `if (user.isActive)` reads naturally; `if (user.active)` reads like truthiness of a flag that might be a string.

## The test

Take the function signature (name + types, no body) and show it to someone who has never seen the codebase. Can they predict:
1. What it does
2. What inputs are valid
3. What the return means

If any "no" → rename until all "yes."
