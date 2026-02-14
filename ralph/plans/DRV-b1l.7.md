# Wire integration smoke suite into PR CI

Task: DRV-b1l.7

## Steps

1. Update `.github/workflows/ci.yml` to add a separate `integration_smoke` job that runs on `pull_request`.
2. Configure a pinned Postgres service with a healthcheck and an explicit DB-ready wait (avoid CI flake).
   - Set `DATABASE_URL` to a local host + db name ending in `_integration` (guarded by `src/lib/server/db/test-client.ts`).
3. Run the smoke suite via `pnpm test:integration:smoke`.
   - Smoke selection is already explicit/stable via `vitest.integration.smoke.config.ts` (`tests/integration/**/*.smoke.test.ts`).
   - The harness applies schema deterministically in global setup and seeds baseline fixtures per test.
4. Capture diagnostics and upload them when the smoke job fails.
   - Write Vitest output to `logs/ci/integration-smoke/vitest.log` (use `pipefail` so failures still fail the job).
   - Upload `logs/ci/integration-smoke/**` and `tests/integration/.evidence/**` with stable artifact names and `if-no-files-found: ignore`.
5. Track runtime in both the job summary and a small JSON artifact, then update `documentation/testing/integration-triage-runbook.md` with the exact workflow/job check name + artifact names.

## Acceptance Criteria

- PR CI starts a Postgres service, applies schema, seeds deterministic baseline fixtures, and runs `pnpm test:integration:smoke`.
- Smoke failures are merge-blocking and include diagnostics artifacts (scenario id, invariant id, evidence rows/logs).
- Smoke selection is explicit and stable (only `*.smoke.test.ts`).
- Runtime budget remains stable and tracked over time.
