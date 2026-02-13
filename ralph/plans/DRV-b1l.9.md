# Publish integration failure triage runbook and ownership model

Task: DRV-b1l.9

## Steps

1. Confirm the current integration harness emits `scenarioId` + `invariantId` in failure output and that CI artifacts contain the referenced diagnostics.
   - If missing, document the interim workaround in the runbook and file a follow-up defect bead to make the outputs/artifacts conform.
2. Extract the authoritative triage contract from `documentation/plans/DRV-b1l-multi-tenant-e2e-testing-program.md`: scenario taxonomy (prefixes), invariant glossary (`invariantId` meanings), and required diagnostics/artifacts.
   - Avoid hardcoding taxonomy/invariants until extracted from the source contract.
3. Inventory current repo entrypoints (scripts/configs/directories) for integration smoke/full runs and CI artifact retrieval.
   - Capture a table in the runbook: command, where defined, required env vars, expected runtime, produced artifact paths.
   - Include concrete `gh run list` / `gh run download` examples with placeholders + expected artifact names.
4. Write `documentation/testing/integration-triage-runbook.md` including:
   - Scenario taxonomy table (from Step 2) and what each class implies.
   - Invariant glossary: `invariantId` -> meaning, common failure modes, and what evidence to capture.
   - Failure classes + first-response workflow/decision tree + required artifacts.
   - CI artifacts section with exact download commands + expected artifact names/paths.
   - Environment contract (toolchain, required env vars, safety/sanitization notes).
   - Ownership + escalation routing (rules + RACI-style table) + defect bead template with required fields.
5. Validate the runbook from a fresh session with an explicit checklist and "done when" bar.
   - Checklist: clean clone/install, run smoke locally, confirm outputs include IDs, download artifacts from a CI run, file a defect bead using the template, and verify discoverability links (program plan + docs index).
   - Done when: a new contributor can reproduce/download artifacts + route ownership in under 30 minutes.

## Acceptance Criteria

- Runbook explains failure classes, required diagnostics, and first-response workflow.
- Ownership is defined for core algorithm regressions vs harness failures.
- Docs include commands for local reproduction of smoke and full suites.
- Team can execute runbook from a fresh session without tribal context.
