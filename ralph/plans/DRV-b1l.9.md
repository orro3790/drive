# Publish integration failure triage runbook and ownership model

Task: DRV-b1l.9

## Steps

1. Gate on prerequisites + current reality.
   - Confirm the spec source exists/usable: `documentation/plans/DRV-b1l-multi-tenant-e2e-testing-program.md`.
   - Identify the CI workflow(s) that run integration suites and confirm they upload artifacts (note workflow file paths + artifact names).
   - Confirm required tooling for a "fresh session" exists: node/pnpm (or whatever the repo uses), docker/postgres (if required), `gh` authenticated, and `bd` available for defect filing.
   - If any prerequisite is missing, explicitly document the limitation in the runbook and file a follow-up bead to close the gap.
2. Make the failure output contract explicit (IDs + where they appear).
   - Run the integration smoke suite locally (use the repo-defined command) and capture a representative failing output that includes `scenarioId` and `invariantId`.
   - Record where IDs appear (stdout/stderr vs junit XML vs JSON artifact) and the exact format.
   - If IDs are missing/unstable, document the interim extraction workaround (e.g., exact grep/file path) and file a follow-up bead to fix harness outputs.
3. Extract taxonomy/invariants from the spec, then reconcile with implementation.
   - From `documentation/plans/DRV-b1l-multi-tenant-e2e-testing-program.md`, extract scenario taxonomy (prefixes) + invariant glossary (`invariantId` meanings) + required diagnostics/artifacts.
   - Cross-check against what the harness actually emits (Step 2). If mismatched, document the discrepancy and file a follow-up bead (do not silently pick a side).
4. Inventory local/CI entrypoints and artifact retrieval.
   - List exact commands for smoke and full runs; for each: where defined, required env vars (and which are secrets), expected runtime bands, produced output paths.
   - Document CI artifact retrieval with copy-pastable `gh` examples (`gh run list`, `gh run view`, `gh run download`) and the exact artifact names + internal paths to the diagnostics.
5. Update the runbook + validate from a fresh session.
   - Write/update `documentation/testing/integration-triage-runbook.md` to include: quick-start triage, taxonomy table, invariant glossary (with evidence-to-capture), first-response workflow/decision tree, CI artifact download + permissions notes, environment contract, ownership/escalation routing (with concrete owner targets + fallback), and a defect bead template with exact `bd` commands.
   - Ensure discoverability by linking the runbook from the program plan and the docs index/front door.
   - Fresh-session validation checklist (objective pass/fail): setup succeeds using only the runbook; local smoke run executes; IDs appear where documented; CI artifacts download works against a real run; artifacts contain the documented diagnostics paths; defect template is usable.

## Acceptance Criteria

- Runbook explains failure classes, required diagnostics, and first-response workflow.
- Ownership is defined for core algorithm regressions vs harness failures.
- Docs include commands for local reproduction of smoke and full suites.
- Team can execute runbook from a fresh session without tribal context.
