# Audit remaining services (assignments, lifecycle, flagging, metrics, managers, audit)

Task: DRV-9gz

## Steps

1. Review `src/lib/server/services/assignments.ts` and `src/lib/server/services/assignmentLifecycle.ts` for assignment lifecycle state transitions, invalid transition handling, and transactional safety.
2. Review `src/lib/server/services/flagging.ts` for threshold logic (`<10` shifts => `80%`, `>=10` shifts => `70%`), one-week grace period handling, and weekly cap reduction behavior.
3. Review `src/lib/server/services/metrics.ts` for calculation correctness across edge cases (`0` shifts, partial weeks) and consistency of derived values.
4. Review `src/lib/server/services/managers.ts` and `src/lib/server/services/audit.ts` for warehouse-scoped access control and coverage of sensitive-operation audit logging.
5. Cross-check all six services for query performance risks (N+1 patterns, expensive scans, potential missing indexes) and write prioritized findings with severity ratings to `logs/nightly/2026-02-10/audit-services-remaining.md`.

## Acceptance Criteria

- `logs/nightly/2026-02-10/audit-services-remaining.md` exists and contains production-readiness findings with severity ratings.
- Audit covers assignment lifecycle state machine correctness and invalid transition handling.
- Audit verifies flagging thresholds, grace period logic, and weekly cap reduction behavior.
- Audit verifies metrics edge-case handling (`0` shifts, partial weeks).
- Audit verifies manager warehouse-level access control and audit logging for sensitive operations.
- Audit identifies query performance risks, including potential N+1 issues and likely missing indexes.
