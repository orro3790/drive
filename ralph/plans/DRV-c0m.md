# Bidding API endpoint audit

Task: DRV-c0m

## Steps

1. Inspect `src/routes/api/bids/submit`, `available`, and `mine` to map auth checks, validation, duplicate protections, and error responses.
2. Inspect `src/routes/api/bid-windows/list`, `create`, `close`, and `assign` for manager-only controls, mode transitions, instant-assign behavior, input handling, and endpoint error behavior.
3. Review cross-endpoint race and state consistency risks (window closure during bid submission, closed/assigned bidding attempts, and concurrent updates), including service-layer safeguards these handlers rely on.
4. Build a traceability matrix with rows for each required criterion and columns for all seven endpoints (`submit`, `available`, `mine`, `list`, `create`, `close`, `assign`), then score each cell with evidence and severity.
5. Confirm completion gate (no endpoint/criterion unscored; unknowns called out as risks), then write a severity-rated report to `logs/nightly/2026-02-10/audit-api-bidding.md` with prioritized remediation actions.

## Acceptance Criteria

- Audit covers `src/routes/api/bids/` endpoints (`submit`, `available`, `mine`) and `src/routes/api/bid-windows/` endpoints (`list`, `create`, `close`, `assign`).
- Findings evaluate auth and authorization boundaries (drivers bid, managers manage windows).
- Findings identify race-condition and state-transition risks (simultaneous bids, window closing during submission).
- Findings assess input validation, duplicate bid prevention, and bidding restrictions on closed or assigned windows.
- Findings assess manager instant-assign bypass behavior for emergency mode.
- Findings assess available-bids filtering (closed/resolved exclusion and eligibility checks) and response pagination.
- Findings assess error-handling consistency.
- Report is written to `logs/nightly/2026-02-10/audit-api-bidding.md` with severity ratings.
