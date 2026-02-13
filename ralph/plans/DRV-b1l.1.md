# Build real-DB multi-tenant integration harness

Task: DRV-b1l.1

## Preconditions / Contract

- Integration tests must fail fast unless `INTEGRATION_TEST=1`.
- `DATABASE_URL` must point at a dedicated integration Postgres database whose db name ends with `_integration` (fail closed otherwise).
- Default allowlist: only `localhost` / `127.0.0.1` are permitted. Any non-local host requires an explicit override env var (e.g. `ALLOW_NONLOCAL_INTEGRATION_DB=1`).
- Integration tests run non-concurrently (single worker + no file parallelism) to avoid DB state races.

## Steps

1. Identify the production DB module import path used by app code and its runtime export surface so the integration client can match it 1:1.

2. Add an integration-only DB entrypoint at `src/lib/server/db/test-client.ts` using `drizzle-orm/node-postgres` + `pg` that matches the production DB module exports.
   - Implement `assertSafeIntegrationDbUrl()` that enforces:
     - `INTEGRATION_TEST === "1"`
     - `DATABASE_URL` is present
     - db name ends with `_integration`
     - host is local unless `ALLOW_NONLOCAL_INTEGRATION_DB === "1"`
     - reject obvious production host patterns (explicit denylist) and fail closed on parse errors
   - Ensure the guard runs before creating any `pg.Pool` and logs the resolved host/db name when allowed.

3. Create `vitest.integration.config.ts` that:
   - Includes only `tests/integration/**/*.test.*`
   - Aliases the production DB module import path to `src/lib/server/db/test-client.ts` for integration runs only (no production module code changes).
   - Forces non-concurrent execution (single worker / no file parallelism) to avoid DB state races.
   - Uses timeouts appropriate for real DB IO.

4. Add package scripts:
   - `test:integration:smoke`: runs only smoke tests (define via file naming like `*.smoke.test.ts`).
   - `test:integration:full`: runs all integration tests.
   - Both scripts must set `INTEGRATION_TEST=1` in a cross-platform way.

5. Implement harness modules under `tests/integration/harness/`:
   - `migrate.ts`: brings the DB schema to current app schema once per run.
     - Prefer `drizzle-kit push --force` against the dedicated `_integration` DB for determinism and to avoid drift between generated SQL migrations and current Drizzle schema files.
   - `reset.ts`: deterministic reset between tests (TRUNCATE all app tables + restart identity, preserving migration tables).
   - `fixtures.ts`: deterministic multi-tenant baseline fixtures for `org-a` and `org-b` with stable IDs (orgs + actor accounts).
   - `diagnostics.ts`: helpers to emit actionable evidence bundles keyed by `scenarioId`/`invariantId`.

6. Add shared helpers for actor/scenario setup plus invariant assertions with stable ids and failure diagnostics:
   - Actor/scenario builders that always take an explicit `orgId`
   - Invariants for tenant isolation, cross-org notification leakage, and assignment integrity

7. Add Milestone-A smoke scenarios under `tests/integration/`:
   - `BID-001`, `NOS-003`, `API-001`
   - Each smoke test must:
     - call harness reset + baseline fixture setup
     - exercise the minimal end-to-end path
     - assert the invariants above
   - Confirm `pnpm test:integration:smoke` is deterministic across two consecutive runs.

## Acceptance Criteria

- New harness under `tests/integration/harness/` supports deterministic setup/reset for org-a and org-b using real DB state.
- Integration runtime uses a test-only DB client path (without modifying production DB module behavior).
- Shared helpers support actor-based scenario setup and invariant assertions for tenant isolation, cross-org notification leakage, and assignment integrity.
- Milestone-A smoke scenarios BID-001, NOS-003, and API-001 run on the harness.
