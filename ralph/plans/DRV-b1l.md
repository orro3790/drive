# Establish full multi-tenant end-to-end integration coverage for core dispatch algorithm

Task: DRV-b1l

## Steps

1. Validate closure preconditions for the epic (necessary, not sufficient).
   - Confirm every DRV-b1l child bead is closed and no nightly-labeled follow-up child remains open.
   - Perform an independent repo audit of harness/tests/workflows/docs to prove acceptance by code artifacts, not child status alone.
2. Build a criterion-to-evidence matrix before closing.
   - Update `documentation/plans/DRV-b1l-multi-tenant-e2e-testing-program.md` status/metadata from planning to completion evidence.
   - Add a required matrix mapping each acceptance criterion and each listed backbone flow (`SCH`, `BID`, `NOS`, `HLT`, `API/UI`, `ADV`) to exact test files/scenarios, explicit isolation assertions (read/write/assignment/notification), CI workflow coverage, and merged PR references.
3. Run reproducible verification with explicit commands and pass gates.
   - Integration smoke gate command: `pnpm test:integration:smoke` with `DATABASE_URL` pointing to local/test Postgres and `INTEGRATION_TEST=1` (already set by script).
   - Nightly contract command: `pnpm vitest tests/server/nightlyOrchestrate.test.ts tests/server/nightlyWitnessUiVerdict.test.ts`.
   - Pass threshold: both commands exit 0; if any fail, capture failures in closure evidence and do not close the epic.
4. Validate actionable diagnostics contract.
   - Verify failure diagnostics requirements are enforced by tests/docs: scenario identity, invariant identity, and DB-state evidence/artifact path.
   - Record where those fields are asserted or emitted so closure is auditable.
5. Apply go/no-go closure rule.
   - If any acceptance criterion lacks direct evidence or verification fails, create/assign follow-up bead(s), keep DRV-b1l open, and document gaps.
   - Only if all criteria have direct evidence and verification passes: land docs update, close DRV-b1l with PR link, and summarize completion-by-aggregation.
6. Merge and clean up.
   - Enable auto-squash merge for the PR; if repository policy blocks, merge with the minimal required override after checks pass.
   - Return local branch to `main`, pull latest, and delete merged feature branch.

## Acceptance Criteria

- A reusable integration harness creates deterministic multi-tenant fixtures (at least two orgs) and supports full workflow execution against real DB-backed service/API paths.
- End-to-end suites cover the backbone flows: schedule generation, assignment eligibility/caps, bidding (competitive/instant/emergency), no-show detection, health scoring, manager overrides, dispatch settings, and notification fanout.
- Every covered flow includes explicit cross-tenant assertions proving no reads, writes, assignments, or notifications leak across organizations.
- The algorithm no longer behaves as an opaque black box: tests assert key decision points and expected outcomes for representative and adversarial scenarios.
- Suites run in CI with at least a PR smoke subset plus broader scheduled run, and failures provide actionable diagnostics (scenario name, invariant violated, and relevant DB-state evidence).
