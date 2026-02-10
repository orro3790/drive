# Audit health service

Task: DRV-65e

## Steps

1. Inspect `src/lib/server/services/health.ts` and map the core evaluation flow (daily, weekly, simulation, and persistence touchpoints).
2. Verify score calculation math and weighting logic (attendance 50%, completion 30%, reliability 20%), including boundary values at 0/49/50/100.
3. Review hard-stop and star progression behavior, including no-show and late-cancellation handling, score capping/reset rules, qualifying-week criteria, and pool eligibility removal persistence.
4. Build and execute a timezone scenario matrix for `America/Toronto` (day boundary, week rollover, DST transition, new-driver and partial-week cases), recording expected vs actual behavior.
5. Validate simulation preview correctness by checking simulation outputs against real evaluation logic across representative boundary scenarios, explicitly audit data staleness risks during evaluation (read/write timing and concurrent updates), then write prioritized findings with severity ratings to `logs/nightly/2026-02-10/audit-services-health.md`.

## Acceptance Criteria

- Audit `src/lib/server/services/health.ts` for production readiness.
- Review score math correctness: attendance 50%, completion 30%, reliability 20%.
- Review hard-stop logic: no-shows and 2+ late cancellations cap score at 49 and reset stars.
- Review star progression qualifying week criteria.
- Review daily vs weekly timezone edge cases (Toronto/Eastern).
- Review pool eligibility removal on hard-stop.
- Review edge cases: new drivers, partial weeks, boundary scores 0/49/50/100.
- Review simulation preview correctness.
- Review data staleness risks during evaluation.
- Record findings with severity ratings in `logs/nightly/2026-02-10/audit-services-health.md`.
