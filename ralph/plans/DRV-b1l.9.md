# Publish integration failure triage runbook and ownership model

Task: DRV-b1l.9

## Steps

0. Lock scope + audience + definition of "publish".
   - Define the intended reader (any dev vs oncall) and what "fresh session" means (new clone + documented installs; excludes access provisioning unless explicitly included).
   - Define what "published" means for this repo (doc location + linked from a docs front door + PR merged).
1. Gate on prerequisites + current reality (with stop conditions).
   - Confirm spec source exists/usable: `documentation/plans/DRV-b1l-multi-tenant-e2e-testing-program.md`.
   - Identify the CI workflow(s) that run integration suites and confirm they upload artifacts (note workflow file paths + artifact names).
   - Confirm tooling exists for the intended reader: node/pnpm, docker/postgres (if required), `gh` authenticated (for artifact download), and `bd` available for defect filing.
   - Stop conditions:
     - If CI artifacts cannot be downloaded by the intended reader, the runbook must not claim CI retrieval works (either fix prerequisites or document limitation + file follow-up bead).
     - If integration entrypoint commands cannot be identified, stop and file a follow-up bead (do not publish speculative commands).
2. Make the failure output contract explicit (IDs + where they appear).
   - Prefer a real CI failure as the canonical sample output/artifact to document `scenarioId` and `invariantId` formats.
   - If the suite is currently green (no failures to sample), document where IDs appear on success, and file a follow-up bead to add a deterministic "contract check"/forced-failure mode if needed.
   - Record where IDs appear (stdout/stderr vs junit XML vs JSON artifacts) and the exact format.
3. Extract taxonomy/invariants from the spec, then reconcile with implementation.
   - From `documentation/plans/DRV-b1l-multi-tenant-e2e-testing-program.md`, extract scenario taxonomy (prefixes) + invariant glossary (`invariantId` meanings) + required diagnostics/artifacts.
   - Cross-check against what the harness actually emits (Step 2). If mismatched, document the discrepancy and file a follow-up bead (do not silently pick a side).
4. Inventory local/CI entrypoints and artifact retrieval.
   - List exact commands for smoke and full runs; for each: where defined, required env vars (and which are secrets), expected runtime bands, produced output paths.
   - Document CI artifact retrieval with copy-pastable `gh` examples (`gh run list`, `gh run view`, `gh run download`) and the exact artifact names + internal paths to the diagnostics.
   - Include a known-good end-to-end example against a specific run id.
5. Publish the ownership + escalation model.
   - Add a RACI-style routing table with concrete owner targets (GitHub team handles if available), fallback/escalation targets, and scope boundaries (algorithm regression vs harness/infra vs test-data).
   - Include rerun/flakiness policy (when to rerun vs file a defect bead).
6. Update runbook + validate + land.
   - Write/update `documentation/testing/integration-triage-runbook.md` to include: quick-start triage, failure classification + decision tree, taxonomy table, invariant glossary (with evidence-to-capture), CI artifact download + permissions notes, environment contract, ownership/escalation routing, and a defect bead template with exact `bd` commands.
   - Ensure discoverability by linking the runbook from the program plan and the docs index/front door.
   - Validate with an objective checklist: local smoke run executes; IDs appear where documented; CI artifacts download works for a real run id (or limitation documented + follow-up bead filed).
   - Land via PR with at least one reviewer from harness/CI ownership and one from algorithm/product ownership (or document why that's not possible).

## Acceptance Criteria

- Runbook explains failure classes, required diagnostics, and first-response workflow.
- Ownership is defined for core algorithm regressions vs harness failures.
- Docs include commands for local reproduction of smoke and full suites.
- Team can execute runbook from a fresh session without tribal context.
