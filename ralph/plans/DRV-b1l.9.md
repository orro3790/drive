# Publish integration failure triage runbook and ownership model

Task: DRV-b1l.9

## Steps

1. Extract the explicit triage contract from `documentation/plans/DRV-b1l-multi-tenant-e2e-testing-program.md`: scenario taxonomy (`scenarioId` prefixes), invariant glossary (`invariantId` meanings), and required diagnostics/artifacts.
2. Inventory current repo entrypoints (scripts/configs/directories) and the expected smoke/full command surface; document how to retrieve artifacts from CI (including `gh run download`).
3. Write `documentation/testing/integration-triage-runbook.md` including:
   - Scenario taxonomy table (`SCH-*`, `BID-*`, `NOS-*`, `HLT-*`, `API-*`, `ADV-*`) and what each class implies.
   - Invariant glossary: `invariantId` -> meaning, common failure modes, and what evidence to capture.
   - Example failure output showing `scenarioId` + `invariantId` and how to interpret them.
   - Failure taxonomy + first-response decision tree + required artifacts.
   - Local reproduction commands (smoke/full) and environment contract.
4. Define an explicit ownership + escalation routing model (harness/infra vs algorithm regression vs data/migration), and include a defect bead template that requires `scenarioId`, `invariantId`, CI link, and artifact pointers.
5. Validate the runbook from a fresh session (follow it end-to-end); then make it discoverable by linking it from the DRV-b1l program plan (and any relevant docs index).

## Acceptance Criteria

- Runbook explains failure classes, required diagnostics, and first-response workflow.
- Ownership is defined for core algorithm regressions vs harness failures.
- Docs include commands for local reproduction of smoke and full suites.
- Team can execute runbook from a fresh session without tribal context.
