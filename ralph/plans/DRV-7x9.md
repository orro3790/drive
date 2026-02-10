# Audit assignment, preference, route, and warehouse endpoints

Task: DRV-7x9

## Steps

1. Build a complete endpoint manifest (method + path + handler file) for all targets under `src/routes/api/assignments/`, `src/routes/api/preferences/`, `src/routes/api/routes/`, `src/routes/api/warehouses/`, and `src/routes/api/onboarding/`, then map every endpoint to a control matrix entry (`covered` or `n/a` with rationale).
2. Define and apply a mandatory negative-access matrix for each endpoint group: unauthenticated request, wrong role, wrong resource owner, cross-warehouse access, revoked/stale manager linkage, malformed ID/body; record expected vs observed authorization and validation behavior with `file:line` evidence.
3. Audit assignments (`confirm`, `cancel`, `assign`, `emergency-reopen`) and preferences for manager-only and driver-scoped controls, confirmation window boundaries (`7 days` to `48 hours`) with timezone/boundary semantics called out explicitly, late-cancellation detection, and locked-preference rejection after Sunday lock.
4. Audit routes, warehouses, and onboarding for manager warehouse scoping, warehouse delete cascade behavior (what is deleted, preserved, or blocked), onboarding invite lifecycle (create/list/revoke plus accept/consume, single-use, expired/revoked replay rejection), and input validation coverage.
5. Write `logs/nightly/2026-02-10/audit-api-management.md` in the format `control -> endpoint -> evidence(file:line) -> verdict -> confidence -> remediation`, include severity (`critical/high/medium/low`) with impact/likelihood rationale, define/check a canonical API error contract (status + required error keys), and end with coverage totals plus `Unverified/Follow-up` items.

## Acceptance Criteria

- Plan execution produces a complete endpoint manifest for all five route groups, with each endpoint mapped to at least one control or marked `n/a` with rationale.
- Audit verifies assignment controls (`confirm`, `cancel`, `assign`, `emergency-reopen`) for manager-only restrictions, driver scoping, confirm-window boundaries (`7d-48h`) including timezone/boundary semantics, and late-cancellation detection.
- Audit verifies preferences controls for access scoping and rejection when preferences are locked after Sunday.
- Audit verifies routes and warehouses controls for manager-to-warehouse scoping and explicit warehouse-delete cascade expectations.
- Audit verifies onboarding invite lifecycle across list/create/revoke and accept/consume paths, including single-use guarantees and expired/revoked replay rejection.
- Audit applies a negative-access matrix (unauthenticated, wrong role, wrong owner, cross-warehouse, revoked linkage, malformed input) and reports pass/fail evidence.
- Findings are written to `logs/nightly/2026-02-10/audit-api-management.md` with severity ratings, canonical error-contract consistency checks, and `file:line` evidence for each control.
