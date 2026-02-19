# DRV-b1l: Technical Implementation Plan for Multi-Tenant End-to-End Validation

Status: completed (implemented via DRV-b1l child beads)

Last updated: 2026-02-19

Owner intent: testing is the backbone safety system for this project, not secondary QA.

## 1) Problem Statement and Strict Objectives

The dispatch/scheduling system has strong mocked unit coverage but insufficient confidence under real persistence + real orchestration behavior. We need deterministic, DB-backed end-to-end validation that proves:

1. Multi-tenant isolation is preserved in complete workflows.
2. Core algorithm behavior is explainable and stable in normal and adversarial conditions.
3. Regressions are blocked in CI before merge.

This program is a reliability initiative and a release safety requirement.

## 2) Non-Negotiable Acceptance Bar

1. Every core workflow has at least one real DB integration scenario with explicit cross-tenant assertions.
2. PR CI includes a required smoke integration suite that blocks merges on failure.
3. Nightly CI runs a broader matrix that includes adversarial/concurrency/idempotency scenarios.
4. Failures emit actionable diagnostics: `scenarioId`, `invariantId`, and DB evidence.
5. Algorithm scenarios encode expected decisions, not only final outcomes.

## 3) Current Technical Constraints (Repository Reality)

1. Current tests in `tests/server/` are primarily mocked-service/unit style.
2. DB module `src/lib/server/db/index.ts` currently binds to `drizzle-orm/neon-http` + `@neondatabase/serverless`.
3. CI (`.github/workflows/ci.yml`) runs lint/type/coverage but no real DB integration suite.
4. Vitest currently uses one profile from `vite.config.ts`.

### 3.1 Baseline maturity checkpoint

Current maturity:

1. Good service logic tests (mocked boundaries).
2. No committed real-DB integration harness.
3. No CI integration gate.

Therefore the first deliverable is a small, real-DB smoke matrix with hard tenant invariants.

## 4) Architecture Decisions

### 4.1 DB transport design for integration tests

Decision:

1. Keep production DB module behavior unchanged.
2. Do not add conditional driver switching to production import graph.
3. Add a test-only DB entrypoint for integration runtime.
4. Use Node Postgres path for reliable local/CI Postgres integration execution.

Implementation details:

1. Keep `src/lib/server/db/index.ts` as production path.
2. Add `src/lib/server/db/test-client.ts` (integration-only Drizzle client).
3. Add `vitest.integration.config.ts` alias:
   - `$lib/server/db` -> `$lib/server/db/test-client`
4. Add dependencies:
   - `pg`
   - use `drizzle-orm/node-postgres` in integration client
5. Integration env contract:
   - `DATABASE_URL` points at integration Postgres
   - `INTEGRATION_TEST=1` used by harness scripts/guards only
6. Integration safety guardrails:
   - fail fast unless `INTEGRATION_TEST=1`
   - reject known production hosts and require allowed host patterns for integration runs

### 4.2 Test isolation model

Decision:

1. Milestone A (smoke): single schema + deterministic truncate/reset for stability.
2. Milestone B+ (full): optional schema-per-worker if runtime/parallelism requires it.
3. Smoke runs with conservative parallelism first (`maxWorkers=1`) to eliminate flake.
4. Reset ownership is explicit: `beforeEach` performs deterministic data reset in single-schema mode.

Implementation details:

1. `tests/integration/harness/dbLifecycle.ts`
2. `tests/integration/harness/reset.ts`
3. `tests/integration/harness/schemaIsolation.ts` (deferred optimization)

### 4.3 Deterministic clock and scenario control

Decision:

1. Reuse `tests/harness/time.ts` and extend only if integration-specific helpers are missing.
2. Add integration-level timezone helper only if needed after reuse check.
3. All scenario fixtures use explicit org ids (`org-a`, `org-b`) and deterministic ids.

Implementation details:

1. Extend `tests/harness/time.ts` where possible.
2. Add `tests/integration/harness/clock.ts` only for integration-specific gaps.
3. Add `tests/integration/fixtures/multiTenantBaseline.ts`.
4. Add `tests/integration/fixtures/scenarioBuilders.ts`.

### 4.4 Invariant-first assertion layer

Decision:

1. Define reusable invariants once; every scenario references invariant ids.
2. Diagnostic evidence is mandatory on invariant failure.

Implementation details:

1. `tests/integration/invariants/tenantIsolation.ts`
2. `tests/integration/invariants/notifications.ts`
3. `tests/integration/invariants/assignmentIntegrity.ts`
4. `tests/integration/invariants/stateMachine.ts`
5. `tests/integration/invariants/idempotency.ts`
6. `tests/integration/harness/diagnostics.ts`

## 5) Milestones and Technical Phase Mapping

### Milestone A (must ship first): harness + CI smoke gate

Files to add/update:

1. `src/lib/server/db/test-client.ts` (new)
2. `vitest.integration.config.ts` (new)
3. `tests/integration/harness/{dbLifecycle.ts,reset.ts,diagnostics.ts,actors.ts}` (new)
4. `tests/integration/fixtures/{multiTenantBaseline.ts,scenarioBuilders.ts}` (new)
5. `tests/harness/time.ts` (extend if needed)
6. `package.json` scripts:
   - `test:integration:smoke`
   - `test:integration:full`
7. `.github/workflows/ci.yml` (new `integration-smoke` job)

Execution details:

1. CI `integration-smoke` job starts Postgres service with healthcheck.
2. Job installs deps, applies schema (`pnpm db:push`), then runs smoke suite.
3. Harness seeds baseline fixtures and returns actor/context handles.
4. Smoke suite initially uses conservative parallelism.

Initial smoke scope (minimum):

1. Must-pass minimum smoke gate:
   - `BID-001`
   - `NOS-003`
   - `API-001`
2. Target-expanded smoke set for Milestone A:
   - `SCH-001`
   - `BID-003`
   - `HLT-001`

### Milestone B: backbone matrix expansion

1. Expand full `SCH-*`, `BID-*`, `NOS-*`, `HLT-*` matrix.
2. Keep invariant tagging mandatory.

### Milestone C: API/UI critical journey hardening

1. Add critical `API-*` journeys and selected `UI-*` journeys.

### Milestone D: adversarial + operationalization

1. Add `ADV-*` scenarios for concurrency + idempotency.
2. Add nightly full workflow.
3. Publish triage runbook and ownership model.

### Existing phase mapping

1. Phase 1 => Milestone A
2. Phase 2 => Milestone B
3. Phase 3 => Milestone C
4. Phase 4 => Milestone D

## 6) Detailed Domain Implementation Targets

### Phase 2 (Milestone B): Backbone Domain Matrices

Files:

1. `tests/integration/scheduling/*.test.ts`
2. `tests/integration/bidding/*.test.ts`
3. `tests/integration/noshow/*.test.ts`
4. `tests/integration/health/*.test.ts`

Scenario contract:

1. Every scenario has id prefix (`SCH`, `BID`, `NOS`, `HLT`).
2. Every scenario asserts business outcome + at least one isolation invariant.
3. Core algorithm scenarios include explicit decision-expectation checks.

### Phase 3 (Milestone C): API + Critical UI

Files:

1. `tests/integration/api/*.test.ts`
2. `tests/e2e/*.spec.ts` (Playwright, targeted critical flows only)

Journey targets:

1. Driver bid accept and reflected assignment state.
2. Manager override/cancel with strict cross-tenant denials.
3. Dispatch settings changes affecting emergency behavior.

### Phase 4 (Milestone D): Adversarial + Operations

Files:

1. `tests/integration/adversarial/*.test.ts`
2. `.github/workflows/integration-nightly.yml` (new)
3. `documentation/testing/integration-triage-runbook.md` (new)

Adversarial targets:

1. Duplicate cron invocations.
2. Near-simultaneous bid attempts.
3. Conflicting manager actions on same assignment.
4. Cross-tenant contamination attempts.

## 7) Scenario Matrix (Minimum Required)

### Scheduling / Eligibility (`SCH-*`)

1. `SCH-001`: in-org schedule generation only.
2. `SCH-002`: flagged drivers blocked, cross-org unaffected.
3. `SCH-003`: weekly cap enforcement without cross-org counting.
4. `SCH-004`: DST boundary week calculations stable.

### Bidding (`BID-*`)

1. `BID-001`: competitive resolve winner correctness + org-safe notifications.
2. `BID-002`: competitive -> instant transition with correct fanout scope.
3. `BID-003`: instant/emergency first-accept semantics with conflict guard.
4. `BID-004`: deterministic tie-break under equal score/time.
5. `BID-005`: conflict retry with invariant: no duplicate assignment.

### No-show (`NOS-*`)

1. `NOS-001`: route-start cutoff behavior pre/post deadline.
2. `NOS-002`: DST spring/fall deadline correctness.
3. `NOS-003`: emergency bonus from org dispatch settings.
4. `NOS-004`: idempotent repeated cron execution.

### Health (`HLT-*`)

1. `HLT-001`: daily scoring isolation across orgs.
2. `HLT-002`: weekly streak progression/reset correctness.
3. `HLT-003`: hard-stop + intervention flags without tenant bleed.

### API/UI (`API-*`, `UI-*`)

1. `API-001`: manager endpoints deny cross-org access.
2. `API-002`: driver endpoints cannot act on foreign-org assignments.
3. `UI-001`: manager override critical path remains org-safe.

### Adversarial (`ADV-*`)

1. `ADV-001`: simultaneous bid acceptance safety.
2. `ADV-002`: duplicate no-show cron safety.
3. `ADV-003`: conflicting manager edits deterministic resolution.

## 8) CI and Runtime Commands

Required scripts:

1. `pnpm test:integration:smoke`
2. `pnpm test:integration:full`

PR CI integration job contract:

1. Start `postgres` service and wait for healthy status.
2. Run `pnpm install --frozen-lockfile`.
3. Apply schema using production-aligned migration command (`pnpm db:migrate` once added), with temporary fallback `pnpm db:push` until migration script exists.
4. Seed deterministic baseline fixtures.
5. Run `pnpm test:integration:smoke`.
6. Always upload diagnostics artifacts on failure.

Nightly CI contract:

1. Run `pnpm test:integration:full`.
2. Upload artifacts:
   - scenario failure report
   - DB evidence snapshots
   - integration logs

Smoke/full selection mechanism:

1. Smoke files use suffix `*.smoke.test.ts`.
2. Full includes all `tests/integration/**/*.test.ts`.
3. Smoke command targets only smoke suffix.
4. CI includes a consistency check that smoke tests are a strict subset of full integration tests.

Runtime budgets:

1. Smoke: <= 10 minutes.
2. Full nightly: <= 35 minutes.

## 9) Diagnostics and Failure Contract

Operational runbook:

- `documentation/testing/integration-triage-runbook.md` (how to reproduce, download artifacts, classify failures, and route ownership)

Every failing scenario must output:

1. `scenarioId`
2. `invariantId`
3. `organizationUnderTest`
4. `keyEntityIds`
5. evidence rows or artifact paths

Output formats:

1. human-readable summary in test output
2. machine-readable JSON artifact for CI triage

## 10) Risks and Mitigations

1. Risk: DB transport mismatch in integration runtime.
   - Mitigation: test-only DB entrypoint + alias + harness self-test.
2. Risk: flaky timing under concurrency scenarios.
   - Mitigation: deterministic clock controls + explicit synchronization.
3. Risk: smoke/full runtime drift beyond budgets.
   - Mitigation: strict suffix-based selection and scenario budget tracking.
4. Risk: diagnostics too thin for fast triage.
   - Mitigation: invariant-id + evidence snapshot mandatory contract.

## 11) Exit Criteria for DRV-b1l

1. Milestone A complete: harness + CI smoke gate merged and required.
2. Milestone B complete: `SCH`, `BID`, `NOS`, `HLT` matrices pass consistently.
3. Milestone C complete: API/UI critical path matrix merged.
4. Milestone D complete: adversarial pack + nightly full suite passes for 7 consecutive days with actionable artifacts.
5. Triage runbook is validated by fresh-session reproduction.

## 12) Bead Decomposition (Spec-to-Beads Source)

This section is the authoritative decomposition input.

### Bead: Build real-DB multi-tenant integration harness

1. Type: task
2. Priority: P1
3. Depends on: DRV-b1l
4. Deliverables:
   - test-only DB client path for integration runtime
   - deterministic fixture/clock harness
   - invariant helper scaffolding
   - first smoke scenarios implemented (`BID-001`, `NOS-003`, `API-001`)

### Bead: Implement bidding lifecycle end-to-end matrix

1. Type: task
2. Priority: P1
3. Depends on: Build real-DB multi-tenant integration harness
4. Deliverables:
   - `BID-*` scenarios including tie-break and conflict retry
   - org isolation assertions for bids/windows/notifications

### Bead: Implement scheduling and eligibility end-to-end matrix

1. Type: task
2. Priority: P1
3. Depends on: Build real-DB multi-tenant integration harness
4. Deliverables:
   - `SCH-*` scenarios for caps/flags/DST/week boundaries

### Bead: Implement no-show and emergency reassignment end-to-end matrix

1. Type: task
2. Priority: P1
3. Depends on: Build real-DB multi-tenant integration harness
4. Deliverables:
   - `NOS-*` scenarios for cutoffs/DST/idempotency/emergency bonus

### Bead: Implement health scoring and intervention end-to-end matrix

1. Type: task
2. Priority: P1
3. Depends on: Build real-DB multi-tenant integration harness
4. Deliverables:
   - `HLT-*` scenarios for daily/weekly/hard-stop correctness

### Bead: Implement API and critical UI end-to-end multi-tenant journeys

1. Type: task
2. Priority: P1
3. Depends on: Build real-DB multi-tenant integration harness
4. Deliverables:
   - `API-*` and selected `UI-*` critical path scenarios

### Bead: Add adversarial concurrency and idempotency scenario pack

1. Type: task
2. Priority: P1
3. Depends on:
   - Implement bidding lifecycle end-to-end matrix
   - Implement no-show and emergency reassignment end-to-end matrix
4. Deliverables:
   - `ADV-*` stress scenarios with deterministic outcomes

### Bead: Wire integration smoke suite into PR CI

1. Type: task
2. Priority: P1
3. Depends on: Build real-DB multi-tenant integration harness
4. Deliverables:
   - required PR smoke workflow + failure artifact upload

### Bead: Wire nightly full integration runs and artifacts

1. Type: task
2. Priority: P1
3. Depends on:
   - Implement bidding lifecycle end-to-end matrix
   - Implement scheduling and eligibility end-to-end matrix
   - Implement no-show and emergency reassignment end-to-end matrix
   - Implement health scoring and intervention end-to-end matrix
   - Implement API and critical UI end-to-end multi-tenant journeys
   - Add adversarial concurrency and idempotency scenario pack
   - Wire integration smoke suite into PR CI
4. Deliverables:
   - nightly full workflow + artifact upload

### Bead: Publish integration failure triage runbook and ownership model

1. Type: task
2. Priority: P2
3. Depends on: Wire nightly full integration runs and artifacts
4. Deliverables:
   - runbook with reproduction, triage, ownership, and escalation rules

## 13) Implementation Completion Evidence (2026-02-19)

This section converts DRV-b1l from proposal to closure evidence. Child bead closure is treated as a signal, but completion is proven from repository artifacts below.

### 13.1 Acceptance Criteria -> Evidence Matrix

| Epic acceptance criterion                                                                                                                              | Implementation evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | CI/runtime evidence                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1) Reusable deterministic multi-tenant harness using real DB-backed paths                                                                              | `tests/integration/harness/fixtures.ts` seeds deterministic `org-a` and `org-b` baseline IDs; `tests/integration/harness/setup.ts` enforces deterministic reset + seed per test; `src/lib/server/db/test-client.ts` and `vitest.integration*.config.ts` route integration runs to guarded Node Postgres test client                                                                                                                                                                                                                                                   | `package.json` scripts `test:integration:smoke` and `test:integration:full`; `.github/workflows/ci.yml` (`integration_smoke`) and `.github/workflows/integration-full-nightly.yml` (`integration_full`) execute the suites against service Postgres |
| 2) Backbone flows covered end-to-end (schedule, eligibility/caps, bidding, no-show, health, manager overrides, dispatch settings, notification fanout) | Flow-by-flow matrix in section 13.2 maps each required flow to concrete scenarios/files (`SCH-*`, `BID-*`, `NOS-*`, `HLT-*`, `API-*`, `UI-*`)                                                                                                                                                                                                                                                                                                                                                                                                                         | PR smoke and nightly jobs run these suites via `pnpm test:integration:smoke`, `pnpm test:integration:full`, and nightly drill orchestration                                                                                                         |
| 3) Explicit cross-tenant assertions for read/write/assignment/notification isolation                                                                   | `tests/integration/invariants/tenantIsolation.ts` defines `NOTIF-001`, `TENANT-002`, `TENANT-003`, `TENANT-004`, `TENANT-005`; integration scenario files call these assertions directly after writes and workflow transitions                                                                                                                                                                                                                                                                                                                                        | Isolation invariants are exercised in smoke + full suites and reflected in nightly drill reports (`scenarioId` + `invariantId` failure lines)                                                                                                       |
| 4) Algorithm is not a black box: key decision points and expected outcomes are asserted, including adversarial/idempotency paths                       | Decision assertions are encoded in scenario tests (for example deterministic schedule generation/caps in `tests/integration/scheduling/SCH-003-SCH-004.realdb.test.ts`, winner/notification outcomes in `tests/integration/bidding/BID-001.smoke.test.ts`, no-show cutoff behavior in `tests/integration/noshow/NOS-001-002-003.realdb.test.ts`, health progression in `tests/integration/health/HLT-001-002-003.realdb.test.ts`); adversarial/idempotency checks are encoded in nightly drill run1/run2 invariants (`IDEMP-*`) in `scripts/nightly/cron-e2e.test.ts` | Nightly orchestration enforces non-pass on upstream/witness inconsistencies via `scripts/nightly/orchestrate.ts` and tests in `tests/server/nightlyOrchestrate.test.ts` plus `tests/server/nightlyWitnessUiVerdict.test.ts`                         |
| 5) CI has PR smoke + scheduled broader run with actionable diagnostics (scenario, invariant, DB evidence)                                              | Diagnostics contract codified in `scripts/nightly/cron-e2e.test.ts` report schema (`scenarioId`, `invariantId`, `keyEntityIds`, invariant evidence) and integration evidence bundles via `tests/integration/harness/diagnostics.ts`; operational triage/ownership process documented in `documentation/testing/integration-triage-runbook.md`                                                                                                                                                                                                                         | `.github/workflows/ci.yml` runs PR smoke and uploads artifacts on failure; `.github/workflows/integration-full-nightly.yml` runs scheduled full suite and uploads logs/evidence artifacts plus runtime metadata                                     |

### 13.2 Backbone Flow Coverage Matrix

| Required flow                           | Concrete scenarios/files                                                                                                                                                                                                                                                                                               | Explicit tenant-isolation assertions                                                                                                                             | CI path                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Schedule generation                     | `scripts/nightly/cron-e2e.test.ts` (`CRON-LOCK-PREFERENCES`, `SCH-001`, `SCH-002`)                                                                                                                                                                                                                                     | `TENANT-LOCK-001` plus org-scoped assignment checks in scenario invariants                                                                                       | Nightly full + orchestrated nightly drill |
| Assignment eligibility/caps             | `tests/integration/scheduling/SCH-003-SCH-004.realdb.test.ts` (`SCH-004` cap boundary); `scripts/nightly/cron-e2e.test.ts` (`SCH-CAP-001`, `SCH-FLAG-001`)                                                                                                                                                             | Cross-org assignment guards via `assertNoCrossOrgAssignmentLeakage` and nightly invariant checks                                                                 | Integration full + nightly full           |
| Bidding (competitive/instant/emergency) | Competitive close/resolve in `scripts/nightly/cron-e2e.test.ts` (`BID-RESOLVE-*`, `BID-NOTIF-001`); instant assignment in `tests/integration/bidding/BID-001.smoke.test.ts` and `tests/integration/api/API-002.smoke.test.ts`; emergency path in `tests/integration/noshow/NOS-001-002-003.realdb.test.ts` (`NOS-003`) | `assertNoCrossOrgBidWinnerLeakage`, `assertNoCrossOrgAssignmentLeakage`, `assertNoCrossOrgNotificationLeakage` and nightly idempotency invariant `IDEMP-BID-001` | Integration smoke/full + nightly full     |
| No-show detection                       | `tests/integration/noshow/NOS-001-002-003.realdb.test.ts` (`NOS-001`, `NOS-002`, `NOS-003`); `scripts/nightly/cron-e2e.test.ts` (`NOS-001/002/003`)                                                                                                                                                                    | `assertNoCrossOrgNoShowNotificationLeakage` and `assertNoCrossOrgNotificationLeakage`                                                                            | Integration full + nightly full           |
| Health scoring                          | `tests/integration/health/HLT-001-002-003.realdb.test.ts`; `scripts/nightly/cron-e2e.test.ts` (`HLT-D-*`, `HLT-W-*`)                                                                                                                                                                                                   | `assertNoCrossOrgHealthNotificationLeakage` and no-show/health cross-org checks                                                                                  | Integration full + nightly full           |
| Manager overrides                       | `tests/integration/api/API-002.smoke.test.ts` (`API-003`) via override route handler path                                                                                                                                                                                                                              | Explicit foreign-org denial + global isolation assertions (`assertNoCrossOrg*`)                                                                                  | Integration smoke (API suite)             |
| Dispatch settings                       | `tests/integration/api/API-002.smoke.test.ts` (`API-004`) dispatch settings patch route                                                                                                                                                                                                                                | Tenant-bound update + foreign-org denial + global isolation assertions                                                                                           | Integration smoke (API suite)             |
| Notification fanout                     | `tests/integration/bidding/BID-001.smoke.test.ts` (bid open fanout), `tests/integration/noshow/NOS-001-002-003.realdb.test.ts` (driver_no_show/emergency fanout), `scripts/nightly/cron-e2e.test.ts` (`REM-*`, `BID-NOTIF-001`)                                                                                        | `NOTIF-001`, `TENANT-004`, `TENANT-005` via integration invariants                                                                                               | Integration smoke/full + nightly full     |
| API/UI critical journeys                | `tests/integration/api/API-001.smoke.test.ts`, `tests/integration/api/API-002.smoke.test.ts`, `tests/e2e/UI-001.driver-bid-journey.spec.ts`                                                                                                                                                                            | API suites invoke tenant isolation assertions and UI smoke validates org-bound journey behavior                                                                  | PR CI (`integration_smoke`, `e2e_smoke`)  |
| Adversarial/idempotency                 | `scripts/nightly/cron-e2e.test.ts` run1/run2 per scenario with `IDEMP-*` invariants across scheduling, reminders, auto-drop, bidding, no-show, health                                                                                                                                                                  | Duplicate-run invariants fail when cross-tenant or duplicate side effects appear                                                                                 | Nightly full + orchestrator gating        |

### 13.3 Closure Gate Result

- Gate status: PASS.
- Rationale: all required DRV-b1l child beads are closed and repository artifacts above provide direct evidence for each epic acceptance criterion.
- Remaining constraints are documented as explicit non-goals (for example production delivery-provider behavior) in `documentation/testing/nightly-e2e-coverage.md` and do not block DRV-b1l acceptance.
