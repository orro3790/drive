# Audit test coverage and quality

Task: DRV-a5s

## Steps

1. Inventory all test files under `tests/` (expected total: 37) and support utilities under `tests/harness/`, then map each test file to covered domain areas (services, API endpoints, cron flows, auth paths).
2. Build a coverage matrix for critical production paths (shift lifecycle, bidding, confirmations, health checks), explicitly separating happy-path and error-path coverage and identifying services/endpoints with zero tests.
3. Audit test quality in every test file by reviewing assertions and mocking patterns, distinguishing behavior-focused tests from implementation-coupled tests and validating mock correctness against real contracts.
4. Evaluate high-risk gaps: boundary/timezone/concurrency edge cases, cron idempotency, auth abuse scenarios, missing assertions, and potential flaky-test factors (time, randomness, order dependencies).
5. Write findings to `logs/nightly/2026-02-10/audit-test-coverage.md`, including: audited-file count (`expected_test_files=37`, `audited_test_files=<n>`), a criterion-to-evidence traceability table, severity ratings using a defined `critical/high/medium/low` rubric (impact + likelihood + exploitability), and a prioritized must-add-tests-before-production list ordered by that rubric.

## Acceptance Criteria

- Audit identifies which services and endpoints currently have no automated tests.
- Audit evaluates critical-path coverage for shift lifecycle, bidding, confirmations, and health flows across both happy and error paths.
- Audit assesses test quality (behavior vs implementation coupling) and validates mock correctness in `tests/harness/` usage.
- Audit identifies gaps in edge-case coverage (boundary values, timezone, concurrency), cron idempotency testing, and auth abuse scenario testing.
- Audit flags missing assertions and flaky-test risks caused by time dependence, random data, or order dependence.
- Findings are written to `logs/nightly/2026-02-10/audit-test-coverage.md` and include audited file-count verification, criterion-to-evidence traceability, severity ratings (`critical/high/medium/low`), and a prioritized must-add-tests-before-production list.
