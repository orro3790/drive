# Audit bidding service

Task: DRV-4ue

## Steps

1. Establish audit baselines by identifying the authoritative dispatch-policy source for scoring weights and defining explicit lifecycle invariants: allowed transitions (`competitive -> instant -> emergency`), forbidden reverse transitions, and idempotency expectations for repeated transition triggers.
2. Read `src/lib/server/services/bidding.ts` end-to-end and build a function-level map from each transition/scoring decision point to the baseline invariants and policy source.
3. Audit transaction boundaries and concurrency-sensitive competitive-resolution paths, and perform at least one adversarial verification method (existing test evidence or deterministic reasoning trace) for race windows, lock coverage, and double-award prevention under expected DB isolation behavior.
4. Verify scoring formula correctness against the authoritative policy weights and inspect edge-case handling (no bids, single bid, tied scores, self-bid on dropped shift), then evaluate input validation, error handling, and logging quality for operational readiness.
5. Write `logs/nightly/2026-02-10/audit-services-bidding.md` with required sections: scope map, per-criterion evidence table (`code path`, `method`, `finding`, `severity`, `confidence`, `recommended fix`), severity rubric (`critical/high/medium/low`), and a prioritized must-fix-before-production list containing only confirmed/high-confidence findings.

## Acceptance Criteria

- Report cites the authoritative dispatch-policy source used to validate bid-scoring weights/formulas.
- Report defines and validates lifecycle invariants for allowed/forbidden transitions and idempotency.
- Audit reviews race conditions in competitive bid resolution with explicit concurrency evidence and assumptions.
- Audit validates bid scoring accuracy against policy weights and covers edge cases: no bids, single bid, tied scores, and self-bid on dropped shifts.
- Audit evaluates error handling completeness, transaction safety, input validation, and logging coverage.
- Findings are written to `logs/nightly/2026-02-10/audit-services-bidding.md` with per-criterion evidence, severity ratings, confidence labels, and a prioritized must-fix-before-production list.
