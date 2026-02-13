# Integration Failure Triage Runbook (Real DB, Multi-Tenant)

Status: active (Milestone A landed: real-DB integration harness + smoke/full scripts). This runbook defines the triage contract so failures are diagnosable without tribal context.

## Glossary (what CI must print)

- `scenarioId`: stable id for the failing scenario (example: `BID-001`).
- `invariantId`: stable id for the invariant that failed (example: `NOTIF-001`).
- `organizationUnderTest`: which org fixture the scenario operated on (example: `org-a`).
- `keyEntityIds`: the entity ids needed to inspect evidence (orgId/driverId/assignmentId/bidWindowId/etc.).

Notes:

- `scenarioId` should appear in Vitest output via the suite/test name (we encode it in `describe(...)`).
- `invariantId` should appear in the thrown error message (prefix before `:`).

If a failure does not include both `scenarioId` + `invariantId`, treat it as a harness/diagnostics defect and file it as such.

## First-Response Checklist (10 minutes)

1. Identify the failing `scenarioId` + `invariantId` from the CI logs.
2. Download CI artifacts (logs + JSON report + DB evidence snapshots). Keep them local and link them in your defect/fix.
3. Classify the failure:
   - Infra/CI (Postgres unavailable, env missing)
   - Harness/diagnostics (reset/seed/clock/invariant wiring)
   - Deterministic algorithm regression (business logic changed)
   - Data/schema drift (migration/seed mismatch)
   - Flake/concurrency timing (must be fixed deterministically; do not accept "rerun until green")
4. Reproduce locally (prefer running the single failing scenario, else run smoke).
5. If it reproduces, fix or file a defect bead with evidence pointers (template at the end of this doc).

## Reproduce Locally

### Safety Guardrails

- Only run real-DB integration tests against a disposable local DB.
- The integration harness will DROP + recreate the `public` schema and push the latest Drizzle schema. Never point `DATABASE_URL` at anything you care about.
- Run via `pnpm test:integration:*` (configs set `INTEGRATION_TEST=1` and route `$lib/server/db` to the integration-safe client).
- `DATABASE_URL` database name must end with `_integration` (enforced by `src/lib/server/db/test-client.ts`).

### Environment Contract

Required env vars (minimum set):

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drive_integration`
- `CRON_SECRET=test-cron-secret`
- `BETTER_AUTH_SECRET=test-better-auth-secret`

Automatically set by the integration scripts/config:

- `INTEGRATION_TEST=1`

Optional overrides:

- `ALLOW_NONLOCAL_INTEGRATION_DB=1` (allows non-local hosts; still blocks common managed DB domains)

PowerShell example:

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/drive_integration"
$env:CRON_SECRET = "test-cron-secret"
$env:BETTER_AUTH_SECRET = "test-better-auth-secret"
```

### Create the integration database (one-time)

The integration harness expects a dedicated local Postgres database whose name ends with `_integration` (example: `drive_integration`).

```bash
createdb drive_integration

# or
psql -c "CREATE DATABASE drive_integration;"
```

### Smoke Suite

```bash
pnpm install
pnpm test:integration:smoke
```

### Full Suite

```bash
pnpm test:integration:full
```

### Single Scenario (preferred)

To run just the failing scenario/test (filter by `scenarioId`):

```bash
pnpm exec vitest run -c vitest.integration.smoke.config.ts -t "BID-001"

# OR (full suite config)
pnpm exec vitest run -c vitest.integration.config.ts -t "BID-001"
```

Where these commands live:

| Goal                       | Command                              | Defined in                                                                         |
| -------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| Integration smoke          | `pnpm test:integration:smoke`        | `package.json` + `vitest.integration.smoke.config.ts`                              |
| Integration full           | `pnpm test:integration:full`         | `package.json` + `vitest.integration.config.ts`                                    |
| Integration DB guardrails  | (enforced automatically)             | `src/lib/server/db/test-client.ts`                                                 |
| Integration migration/push | (runs automatically in global setup) | `tests/integration/harness/globalSetup.ts`, `tests/integration/harness/migrate.ts` |

## Download CI Artifacts

### GitHub UI

1. Open the failing workflow run.
2. Download artifacts.
3. Extract into a local folder and keep paths stable for linking from defects.

### GitHub CLI

```bash
# 1) Find the run (adjust workflow name once integration jobs land)
gh run list --limit 20

# 2) Inspect artifact names
gh run view <run-id> --json artifacts -q '.artifacts[].name'

# 3) Download everything
gh run download <run-id> --dir logs/nightly/<YYYY-MM-DD>/ci-artifacts
```

Expected artifact contents (contract):

- Machine-readable report JSON containing `scenarioId`, `invariantId`, `keyEntityIds`, and evidence pointers.
- Human-readable summary markdown.
- DB evidence snapshots (queries/rows) sufficient to confirm isolation + idempotency properties.
- (If UI witness verification is part of the nightly pack) screenshots proving the UI matches DB outcomes.

Local evidence bundles (available today):

- Some scenarios may write JSON evidence bundles to `tests/integration/.evidence/*.json` via `tests/integration/harness/diagnostics.ts`.
- If a scenario failure has no evidence bundle, treat that as a diagnostics gap and capture the minimal DB rows needed in your defect report.

## Scenario Taxonomy (`scenarioId` prefixes)

| Prefix  | Meaning                                           | Typical failure surface                                       |
| ------- | ------------------------------------------------- | ------------------------------------------------------------- |
| `SCH-*` | Scheduling / eligibility / caps / DST             | schedule generation, eligibility filters, week-boundary math  |
| `BID-*` | Bidding lifecycle (competitive/instant/emergency) | winner selection, bid-window transitions, notification fanout |
| `NOS-*` | No-show detection + emergency reassignment        | cutoff math, emergency windows, manager alerts                |
| `HLT-*` | Health scoring + interventions                    | streak transitions, scoring rules, tenant isolation           |
| `API-*` | API journeys (org-scoped authZ)                   | cross-org access denials, actor context                       |
| `UI-*`  | Targeted UI journeys (Playwright/agent-browser)   | UI shows stale/incorrect state, missing alerts                |
| `ADV-*` | Adversarial concurrency/idempotency               | duplicates, races, ordering bugs, flake                       |

## Invariant Taxonomy (`invariantId` prefixes)

Invariant ids must be stable, searchable, and map to a single responsibility. Recommended prefix scheme:

| Prefix     | Meaning                                                    | Evidence to capture                                              |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `TENANT-*` | Tenant isolation (no cross-org reads/writes/notifications) | counts by orgId, sample foreign ids, offending rows              |
| `IDEMP-*`  | Idempotency (reruns do not duplicate transitions)          | before/after counts, dedupe keys, window/notification uniqueness |
| `NOTIF-*`  | Notification correctness + scoping                         | notification rows, types, dedupe behavior                        |
| `ASSIGN-*` | Assignment integrity (single winner, no duplicates)        | assignment rows, unique constraints, assigned_by                 |
| `STATE-*`  | State machine correctness                                  | status transitions, timeline evidence                            |

### Current invariants (stable IDs)

| invariantId  | Meaning                                                                       | Where thrown                                          |
| ------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| `NOTIF-001`  | Cross-org notification leakage (notification org must match user org)         | `tests/integration/invariants/tenantIsolation.ts`     |
| `TENANT-002` | Assignment assigned to cross-org user (warehouse org must match user org)     | `tests/integration/invariants/tenantIsolation.ts`     |
| `TENANT-003` | Bid window resolved to cross-org winner (warehouse org must match winner org) | `tests/integration/invariants/tenantIsolation.ts`     |
| `ASSIGN-001` | Assignment missing or not scheduled/assigned to expected driver               | `tests/integration/invariants/assignmentIntegrity.ts` |
| `ASSIGN-002` | Bid window missing or not resolved to expected winner                         | `tests/integration/invariants/assignmentIntegrity.ts` |

If the invariant id is present but the meaning is unclear, treat that as a documentation gap and update this runbook (or the invariant itself) so the next responder does not have to reverse-engineer it.

## Ownership and Escalation Model

Classify the failure first, then route it:

- Infra/CI:
  - Examples: Postgres service not healthy, missing env vars, node/pnpm failures.
  - Owner: CI/workflow maintainers (files: `.github/workflows/**`).
- Harness/diagnostics:
  - Examples: reset/seed fails, clock helpers wrong, missing `scenarioId`/`invariantId`, evidence snapshots missing.
  - Owner: integration harness maintainers (files: `tests/integration/harness/**`, `vitest.integration.config.ts`).
- Algorithm regression:
  - Examples: deterministic business logic drift; scenario reproduces locally.
  - Owner: domain service owners (files under `src/lib/server/services/**`).
- Data/schema drift:
  - Examples: schema mismatch, seed assumes old columns/constraints.
  - Owner: schema/migrations owners (files under `drizzle/**`, `scripts/seed.ts`).

Escalate when:

- You cannot classify within 20 minutes.
- The failure impacts multiple scenario classes (likely harness or shared service regression).

## Defect Bead Template (copy/paste)

Title: `Integration failure: <scenarioId> / <invariantId> (<short symptom>)`

Include:

- `scenarioId`: <BID-001>
- `invariantId`: <NOTIF-001>
- CI run: <url>
- Artifacts:
  - CI: `logs/nightly/<YYYY-MM-DD>/ci-artifacts/...`
  - Local evidence (if present): `tests/integration/.evidence/<scenarioId>.<label>.<timestamp>.json`
- Git SHA: <sha>
- Expected: <what should have happened>
- Observed: <what happened>
- Repro (local): <exact commands + env>
- Key entity ids: <orgId, driverId, assignmentId, bidWindowId, ...>
- Owner guess: <infra | harness | algorithm | schema>
