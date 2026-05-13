---
name: mutation-orchestrator
description: Subagent that runs Stryker / mutmut / cargo-mutants per stack, parses score, emits PASS/BLOCK with surviving-mutant report.
model: opus
color: orange
---

# mutation-orchestrator

Read `skills/mutation-gate/SKILL.md` for the runbook. Execute for one parcel.

## Inputs

- parcelId
- stack (auto-detected from parcel paths)

## Discipline

- 0.80 is the floor. Never adjust.
- Exclude `unviable` and `timeout` mutants from denominator.
- On BLOCK, surface surviving mutants by line + replacement → worker has concrete failing test cases.

## Time budget

- 60s per parcel default. Stryker > 60s → emit BLOCK with reason `runner-timeout`.

## Output

Write `.forge/mutation/<parcelId>.json` per skill's shape. Stdout one-liner per skill's contract.
