# Integration Failure Triage Runbook (Real DB, Multi-Tenant)

Status: draft until DRV-b1l Milestone A lands (integration harness + smoke scripts). This runbook defines the target triage contract so failures are diagnosable without tribal context.

## Glossary (what CI must print)

- `scenarioId`: stable id for the failing scenario (example: `BID-001`).
- `invariantId`: stable id for the invariant that failed (example: `TENANT-001`).
- `organizationUnderTest`: which org fixture the scenario operated on (example: `org-a`).
- `keyEntityIds`: the entity ids needed to inspect evidence (orgId/driverId/assignmentId/bidWindowId/etc.).

If a failure does not include `scenarioId` + `invariantId`, treat it as a harness/diagnostics defect and file it as such.

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
- Set `INTEGRATION_TEST=1` (the harness must refuse to run without it).

### Environment Contract

Required env vars (minimum set; mirrors CI defaults):

- `INTEGRATION_TEST=1`
- `DATABASE_URL=postgresql://test:test@localhost:5432/test`
- `CRON_SECRET=test-cron-secret`
- `BETTER_AUTH_SECRET=test-better-auth-secret`

PowerShell example:

```powershell
$env:INTEGRATION_TEST = "1"
$env:DATABASE_URL = "postgresql://test:test@localhost:5432/test"
$env:CRON_SECRET = "test-cron-secret"
$env:BETTER_AUTH_SECRET = "test-better-auth-secret"
```

### Smoke Suite

```bash
pnpm install
pnpm db:push
pnpm test:integration:smoke
```

### Full Suite

```bash
pnpm test:integration:full
```

### Single Scenario (preferred)

Once `vitest.integration.config.ts` exists, run just the failing scenario/test file:

```bash
pnpm exec vitest -c vitest.integration.config.ts tests/integration --run -t "BID-001"
```

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
- `invariantId`: <TENANT-001>
- CI run: <url>
- Artifacts: `logs/nightly/<YYYY-MM-DD>/ci-artifacts/...`
- Expected: <what should have happened>
- Observed: <what happened>
- Repro (local): <exact commands + env>
- Key entity ids: <orgId, driverId, assignmentId, bidWindowId, ...>
