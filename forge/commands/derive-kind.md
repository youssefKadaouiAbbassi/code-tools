---
description: Classify a parcel as pure-fn / io / ui / config / infra to route the right verify gates.
argument-hint: parcel id
---

Parcel id: $ARGUMENTS

Read `.forge/dag.json`, locate the parcel by id, classify per `skills/derive-kind/SKILL.md`. Output a single token: pure-fn | io | ui | config | infra.
