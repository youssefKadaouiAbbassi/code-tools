# Smallest surface

## One concern per function

```ts
// Bad — two concerns hiding in one function
function parseAndPersistUser(raw: string) {
  const user = JSON.parse(raw) as User;
  if (!isValidEmail(user.email)) throw new Error('bad email');
  db.users.insert(user);
  return user;
}
```

```ts
// Good — each function owns one thing
function parseUser(raw: string): User {
  return JSON.parse(raw) as User;
}

function validateUser(user: User): User {
  if (!isValidEmail(user.email)) throw new Error('bad email');
  return user;
}

function persistUser(user: User): User {
  db.users.insert(user);
  return user;
}

// Caller composes:
const user = persistUser(validateUser(parseUser(raw)));
```

**Smell:** if the function name has "And" (`parseAndValidate`, `loadAndTransform`), it's doing two things. Split.

## Rule of 3 for extraction

```py
# 1st use — inline
total = sum(x * 1.2 for x in prices)

# 2nd use — still inline (maybe a pattern, too early to tell)
inline_total = sum(y * 1.2 for y in new_prices)

# 3rd use — NOW extract, because you know the shape
def apply_vat(price: float) -> float:
    return price * 1.2

total = sum(apply_vat(x) for x in prices)
```

Premature extraction is worse than duplication. You lock in a shape before seeing how it's actually used. Three uses = enough signal to know the real interface.

## Pure over stateful

```ts
// Bad — mutates input, no return
function sortUsers(users: User[]): void {
  users.sort((a, b) => a.name.localeCompare(b.name));
}
```

```ts
// Good — pure; return sorted copy
function sortUsers(users: readonly User[]): User[] {
  return [...users].sort((a, b) => a.name.localeCompare(b.name));
}
```

Pure functions are testable, composable, parallelizable. Mutation is sometimes necessary (perf, streaming); when you choose it, make it explicit in the name (`sortInPlace`) or the type (accepts `User[]`, returns `void`).

## Validate at boundaries, trust inside

```py
# Bad — defensive re-check in every internal function
def outer(raw: str):
    if not isinstance(raw, str): raise TypeError(...)
    return middle(raw)

def middle(s: str):
    if not isinstance(s, str): raise TypeError(...)
    return inner(s)

def inner(s: str):
    if not isinstance(s, str): raise TypeError(...)
    return s.upper()
```

```py
# Good — validate once at the boundary
def handle_http(request):
    raw = request.body.decode('utf-8')        # <-- validation boundary
    if not raw: raise HTTPError(400)
    return inner(raw)

def inner(s: str):                             # <-- trust str here
    return s.upper()
```

Boundaries = where untrusted data enters the system:
- HTTP request handlers
- CLI argument parsing
- File/stream readers
- External API responses
- User input

Once past the boundary, trust the type. No defensive re-validation deep in the call stack.

## The test

Describe the function's purpose in one sentence. If you use "and", "also", or "then", you have ≥2 concerns. Split.

```
"parseUser reads raw JSON and validates email and writes to DB"  → 3 concerns, split
"parseUser decodes raw bytes into a User object"                  → 1 concern, keep
```
