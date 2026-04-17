# No dead defense

Error handling exists to serve recovery. If there's no recovery, there's no handler.

## No try/catch for impossible cases

```ts
// Bad — the null is impossible if the types are honest
function getUserName(user: User): string {
  try {
    return user.name;  // user is typed User, .name is typed string — why the try?
  } catch {
    return 'unknown';
  }
}
```

```ts
// Good — trust the types
function getUserName(user: User): string {
  return user.name;
}
```

If the null IS possible, the type should say `User | null` or `User | undefined`, and you handle it explicitly — not with a try/catch that swallows surprises.

## No fallbacks for inputs you control

```py
# Bad — you built this dict; it cannot be malformed
config = {
    'port': 8080,
    'host': 'localhost',
    'timeout_ms': 30000,
}

def start_server():
    try:
        port = config['port']
    except KeyError:
        port = 8080   # dead branch
```

```py
# Good — trust your own construction
def start_server():
    port = config['port']
```

Fallbacks belong at system boundaries where data comes from elsewhere (env vars, API responses, user input) — never for values you constructed in the same file or module.

## No silent catch

```ts
// Bad — this is the worst pattern in software
try {
  await chargeCard(amount);
} catch {}
```

The payment failed silently. The user is charged / not charged inconsistently. Downstream state corrupts. Weeks pass before someone notices.

```ts
// Good — let it bubble
await chargeCard(amount);
```

```ts
// Also good — transform if you know the recovery
try {
  await chargeCard(amount);
} catch (err) {
  if (err.code === 'CARD_DECLINED') {
    return { status: 'declined', reason: err.message };
  }
  throw err;  // anything we don't know how to handle keeps bubbling
}
```

`catch (e) {}` and `except: pass` are red flags in any review. Name them in PR review; remove them.

## Bubble errors to the right handler

```go
// Bad — middle layer catches, logs, then returns a generic error
func middle(in string) (string, error) {
    result, err := inner(in)
    if err != nil {
        log.Printf("inner failed: %v", err)
        return "", errors.New("middle failed")  // caller loses the real cause
    }
    return result, nil
}
```

```go
// Good — bubble with context
func middle(in string) (string, error) {
    result, err := inner(in)
    if err != nil {
        return "", fmt.Errorf("middle: %w", err)  // wrap, preserve cause
    }
    return result, nil
}
```

The function that can *actually recover* is the one that catches. Middle layers add context with `fmt.Errorf`/`Error.cause`/`anyhow::Context` and bubble. The top layer (HTTP handler, CLI main, message-queue consumer) makes the recovery decision.

## Validate at the boundary, once

```ts
// Bad — validate everywhere
function handleRequest(req) {
  if (!req.body || typeof req.body.email !== 'string') throw new Error();
  sendEmail(req.body.email);
}

function sendEmail(email) {
  if (typeof email !== 'string') throw new Error();
  if (!email.includes('@')) throw new Error();
  // ...
}

function validateEmail(email) {
  if (typeof email !== 'string') throw new Error();
  if (!email.includes('@')) throw new Error();
  return true;
}
```

```ts
// Good — validate at the HTTP boundary; internal functions trust typed input
type Email = string & { __email: true };

function handleRequest(req: Request): Response {
  const email = parseEmail(req.body?.email);  // <-- boundary validation
  sendEmail(email);
}

function parseEmail(raw: unknown): Email {
  if (typeof raw !== 'string') throw new HTTPError(400, 'email required');
  if (!raw.includes('@')) throw new HTTPError(400, 'invalid email');
  return raw as Email;
}

function sendEmail(email: Email): void {
  // trusts Email is validated; no re-check
}
```

Boundary validation = one validator per input type per entry point. Once validated into a branded type (`Email`, `UserId`, `SanitizedHTML`), internal code trusts it unconditionally.

## The test

For every `try`/`catch` / `except` / `match err` in your diff, name the recovery action in one sentence:
- *"If the card is declined, return a declined status to the caller so they can show a retry UI."* → legitimate, keep
- *"So it doesn't crash."* → dead defense, remove

If you can't name concrete recovery, the handler is decoration. Delete it and let the error bubble to someone who can actually do something about it.
