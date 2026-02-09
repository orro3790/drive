# Audit page routes and layouts

Task: DRV-sea

## Steps

1. Inventory all route pages and layout files under `src/routes/(driver)/`, `src/routes/(manager)/`, and `src/routes/(app)/`, then map role ownership and layout nesting flow (`auth -> app -> role guard`).
2. Audit each page for loading, error, and empty-state handling, including whether async data paths and fallback UX are consistently implemented.
3. Verify role isolation and navigation correctness: ensure driver/manager access boundaries are enforced, sidebar/navigation entries match existing routes, and active-state logic aligns with the current path.
4. Validate UX readiness across cross-cutting concerns: 390px mobile layout (no horizontal overflow), offline behavior (`OfflineBanner` and connectivity handling), store initialization on mount, transition smoothness, and page title appropriateness.
5. Write findings to `logs/nightly/2026-02-10/audit-page-routes.md` with evidence-linked severity ratings (`critical/high/medium/low`) and a prioritized fix list for production readiness.

## Acceptance Criteria

- Audit covers all page routes in `src/routes/(driver)/`, `src/routes/(manager)/`, `src/routes/(app)/`, and all related layout files.
- Audit evaluates loading/error/empty states, role-based access isolation, and layout nesting/guard flow.
- Audit verifies navigation correctness, including route parity and active-state behavior.
- Audit validates mobile behavior at 390px, offline/connectivity UX, store initialization, transitions, and page titles.
- Findings are documented in `logs/nightly/2026-02-10/audit-page-routes.md` with severity ratings and concrete remediation priorities.
