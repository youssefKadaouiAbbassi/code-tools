# No comments unless critical

## Good — keep

```ts
// Stripe webhook signature check must precede parsing — the raw body
// is required for HMAC, and parsing mutates it.
const sig = req.headers['stripe-signature'];
stripe.webhooks.constructEvent(req.rawBody, sig, secret);
parseBody(req);
```
*Why kept*: hidden constraint about order-of-operations a reader can't infer from names.

```py
# Workaround: pandas 2.1.0 groupby().agg() drops the index name.
# Remove once we pin >= 2.1.1. See pandas/#54321.
df = df.reset_index().rename(columns={'index': 'ts'})
```
*Why kept*: bug workaround with concrete upstream reference.

```rust
// Buffer must be >= one MTU or the write stalls on the Linux 6.x
// kernel when TCP_NODELAY is set.
let buf = Vec::with_capacity(MTU.max(1500));
```
*Why kept*: subtle invariant tied to a specific platform behavior.

## Bad — delete

```ts
// Parse the user input
const parsed = parseUserInput(raw);
```
*Why delete*: comment restates the function name.

```py
# Added for the subscription flow (see PR #842)
def charge_customer(id, amount): ...
```
*Why delete*: history belongs in git, not source.

```go
// TODO: handle the edge case where the user has no orders
if len(orders) == 0 {
    return nil
}
```
*Why delete*: the code handles it. File an issue if there's more to do, or delete.

```ts
/**
 * Retrieves a user by their ID from the database.
 * @param id The user's ID
 * @returns The user object
 */
async function getUserById(id: string): Promise<User> { ... }
```
*Why delete*: every line restates what the signature already says. Keep JSDoc only for public API types that need contract-level clarity (error conditions, preconditions).

## Edge case — library author boundary

When you're *publishing* a library consumed by strangers, brief contract docs on the public surface are acceptable — not to describe WHAT, but to document invariants the consumer can't see (thread safety, ordering guarantees, exception types). Internal code still follows the no-comment rule.
