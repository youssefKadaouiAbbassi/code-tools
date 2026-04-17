# Clean + optimized

## Dead code — delete

```ts
// Before
export function parseConfig(raw: string) { ... }
function parseConfigLegacy(raw: string) { ... }  // unused since v2
function validateEnv(env: object) { ... }         // referenced nowhere
```
```ts
// After
export function parseConfig(raw: string) { ... }
```
Run `tsc --noUnusedLocals` / `ruff --select F401` / `cargo clippy` every pass. Dead code is a liability — it reads as intent and confuses maintenance.

## Speculative abstractions — don't write

```py
# Before: generic "for the future" — single caller
class StorageBackend(ABC):
    @abstractmethod
    def read(self, key: str) -> bytes: ...
    @abstractmethod
    def write(self, key: str, value: bytes) -> None: ...

class S3Backend(StorageBackend): ...  # only implementation
```
```py
# After: concrete, matches actual use
class S3Storage:
    def read(self, key: str) -> bytes: ...
    def write(self, key: str, value: bytes) -> None: ...
```
Extract the interface when the *third* concrete implementation appears. Two is a coincidence; three is a pattern.

## Stale imports

```ts
// Before
import { parse, validate, transform } from './schema';
import { log } from './logger';  // log was removed in previous edit

export function run(input: unknown) {
  return validate(parse(input));  // transform not called either
}
```
```ts
// After
import { parse, validate } from './schema';

export function run(input: unknown) {
  return validate(parse(input));
}
```

## Delete over deprecate

```py
# Bad: tombstones that never get cleaned
@deprecated("use parse_v2 instead")
def parse_v1(raw: str): ...

def parse_v2(raw: str): ...
```
```py
# Good: if you control all callers, migrate them and delete parse_v1
def parse(raw: str): ...
```
`@deprecated` is useful only for public SDK surface when you can't migrate third-party consumers. For internal code, delete.

## Reuse before writing

```ts
// Bad: reinventing
function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
```
```ts
// Check first
// $ grep -r "toSlug\|slugify\|kebab" src/
// utils/string.ts: export function kebabCase(s: string) { ... }
import { kebabCase } from './utils/string';
```

## The test for a diff

Before committing, answer: did the codebase gain or lose net lines?
- Net loss → good default
- Net gain → must be justified by a concrete, named requirement, not "future flexibility"
