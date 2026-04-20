---
name: security-audit
description: [yka-code] Run a multi-layered security audit using installed tools. Use when the user asks for a security review, vulnerability scan, audit, or wants to check for injection/XSS/secrets/unsafe patterns. Chains snyk MCP, silent-failure-hunter, pre-secrets-guard hook findings, and claude-mem prior findings.
---

# Security Audit Workflow

Layer the user's installed security tooling into one systematic pass.

## Principles (applied throughout)

Load and apply the `karpathy-guidelines` skill alongside this workflow. Short version:

1. **Think Before Coding** — surface assumptions and tradeoffs explicitly; don't silently pick one interpretation.
2. **Simplicity First** — prefer minimal code; no speculative abstractions, no just-in-case configs.
3. **Surgical Changes** — only touch what the task requires; preserve existing style/imports/whitespace.
4. **Goal-Driven Execution** — define the verifiable success criterion up front and loop until it passes.


## When to activate

- User asks: "security review", "audit", "vuln scan", "check for vulnerabilities", "is this secure?"
- User is about to ship something sensitive (auth, crypto, data handling, uploads)
- A CVE was announced and user wants to check exposure

## Tool dispatch — when to reach for each MCP / skill / agent

| Condition | Tool | Why |
|---|---|---|
| Always, first thing | `/claude-mem:mem-search "security"` | Don't re-flag known accepted issues |
| Code-level vulns (SQL-i, XSS, path traversal) | `snyk_code_scan` (snyk MCP) | SAST |
| Dependency vulns (supply chain) | `snyk_sca_scan` | SCA on package-lock/requirements |
| Infrastructure as Code in scope | `snyk_iac_scan` | Terraform/K8s/CloudFormation |
| Dockerfile or container in scope | `snyk_container_scan` | Image vulns |
| **Run all four in parallel when scope covers them** — ONE message, 4 MCP calls | | |
| Test a vuln repro safely | `container-use` CLI | Sandboxed execution, can't escape |
| Silent-failure patterns near security code | `pr-review-toolkit:silent-failure-hunter` | Swallowed errors in auth/crypto paths |
| Weak types around security boundaries | `pr-review-toolkit:type-design-analyzer` | `string` where `Branded<UserId, "verified">` belongs |
| Past security fixes in related repos | `github` MCP (needs `GITHUB_PAT`) | Cross-repo CVE/fix search |
| Known vulns in similar OSS code | `deepwiki` MCP | Q&A against public repos |
| DB query security (parameterization, injection) | `psql` / `mongosh` + Grep for raw-concat query patterns | Run EXPLAIN + search source for `"SELECT " + var` anti-patterns |

## Workflow

### Phase 1 — Scope the audit
Ask the user what's in scope if unclear:
- Whole repo? A specific directory? A single PR diff?
- SAST only, or also dependencies, or also container/IaC?

Don't audit everything by default — that's noise. Scope to what the user actually wants.

### Phase 2 — Check memory for past findings
`/claude-mem:mem-search "security"` — surface any prior audits or known-issue patterns. If we already logged "don't use rand() for session tokens", do NOT re-raise it as a new finding.

### Phase 3 — Static analysis via Snyk MCP
The `snyk` MCP is already registered. Invoke its tools:
- `snyk_code_scan` — SAST for code-level vulns (SQL-i, XSS, path traversal, etc.)
- `snyk_sca_scan` — dependency vulnerability scan (supply-chain)
- `snyk_iac_scan` — if there's IaC in scope (Terraform/Kubernetes/CloudFormation)
- `snyk_container_scan` — if there's a Dockerfile in scope

Run ONLY the scans relevant to the scope. No point running IaC scan on a pure TypeScript library.

### Phase 4 — Hunt silent failures around security boundaries
Spawn `pr-review-toolkit:silent-failure-hunter` on the auth / crypto / validation code. Swallowed exceptions in security-critical paths are where real bugs hide (e.g., `catch { return user }` that returns the wrong user under load).

### Phase 5 — Type-invariant audit
Spawn `pr-review-toolkit:type-design-analyzer`. Security bugs frequently stem from weak types — e.g., `string` for something that should be `UserId & Brand<"verified">`. This agent catches that.

### Phase 6 — Check the deny-list hygiene
Our `~/.claude/settings.json` has a deny-list. Verify the current rules are still appropriate for the code in scope. If new patterns have emerged (e.g., code now makes external HTTP calls — add rate-limit rules), note them.

Our `pre-secrets-guard.sh` hook catches AWS/Stripe/GitHub/Anthropic keys, `.env` reads, etc. If the audit scope includes handling secrets, verify the expected patterns are in the hook.

### Phase 7 — Summarize findings
Group by severity. For each finding:
- Severity (critical / high / medium / low)
- Category (injection / auth / deps / etc.)
- File:line
- Why it matters
- Concrete fix

Present CRITICAL and HIGH together. MEDIUM and below in a collapsible list. Don't bury a critical finding in a 40-item dump.

### Phase 8 — Capture into memory
`/claude-md-management:revise-claude-md` — add a "Security notes" section with the patterns we found and their fixes. Future audits should benefit.

## Hard rules

- **Scope first.** Auditing a whole repo with no focus is low-signal.
- **Don't double-report.** If snyk and silent-failure-hunter both flag the same line, mention once.
- **Critical findings get their own message.** Not a bullet in a 50-line report.
- **Fixes, not just findings.** A finding without a suggested fix is homework you're passing back to the user.

## Chains to (synergy)

- **`audit-rigor`** — load at Phase 0 alongside the base skills. Owns the output discipline (≥70% confidence, inline citations, SWAP/ADD/DROP format, delegate retrieval). Security-audit supplies the WHAT (vulns, scanners); audit-rigor supplies the HOW.
- **`fix-bug`** — each confirmed finding routes there for the actual remediation (red test → patch → verify).
- **`ci-hygiene`** — wire `snyk_code_scan` / `snyk_iac_scan` into CI so future regressions fail the pipeline.
- **`doc-hygiene`** — record remediations in `SECURITY.md` / `CHANGELOG.md` under its rules.
- **`test-driven-development`** — vulnerabilities get a red test (exploit proof-of-concept) before the fix ships.

## What this skill avoids

- Running every scanner against everything regardless of scope (token waste)
- Reporting low-confidence static-analysis noise as if it were a real finding
- Lecturing on general security principles (stay concrete)
