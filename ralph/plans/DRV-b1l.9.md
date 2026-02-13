# Publish integration failure triage runbook and ownership model

Task: DRV-b1l.9

## Steps (<= 5)

1. Define the runbook deliverable + scope boundaries.
   - Primary deliverable: update `documentation/testing/integration-triage-runbook.md`.
   - Supporting link: add a prominent link from `documentation/plans/DRV-b1l-multi-tenant-e2e-testing-program.md` (and one additional obvious entry point if it exists; otherwise skip).
   - Explicitly out of scope for this bead: fixing harness/CI/artifacts; instead file follow-up bead(s) with evidence.

2. Document how to reproduce locally (smoke + full) with a clean environment contract.
   - Add copy/paste commands for:
     - Smoke: `pnpm test:integration:smoke`
     - Full: `pnpm test:integration:full`
   - Include required env vars, non-secret defaults for local, and guardrails (e.g., disposable DB only).
   - Include "single scenario" guidance (filter by `scenarioId`) if supported.
   - If any command/env requirement is unclear, locate the canonical definition (e.g., `package.json`, vitest config) and cite it in the runbook.

3. Specify failure classes + required diagnostics ("what to capture") with an explicit ID contract.
   - Add a failure-class taxonomy table (infra/CI, harness/diagnostics, algorithm regression, schema/data drift, flake/timing) and the minimum evidence required for each.
   - Define the invariant meaning contract:
     - `scenarioId` format + where it appears.
     - `invariantId` format + where it appears.
     - What to do when IDs are missing (treat as harness/diagnostics defect; file a follow-up bead).
   - Do NOT require generating a new local failure; use either (a) CI log examples, or (b) the produced test report/junit/json artifacts from a normal run to show where IDs live.

4. Add a first-response workflow + ownership/escalation routing that is executable.
   - Provide a 10-20 minute first-response checklist (triage -> classify -> reproduce -> route).
   - Define ownership rules that separate:
     - Core algorithm regressions vs harness/diagnostics failures (explicit decision points).
     - Escalation triggers + fallback owner when classification is unclear.
   - Add a defect template with working commands for creating a bead (include both `bd` and `bd.exe` forms if needed) and required fields (scenarioId, invariantId, CI run URL, artifact paths, repro steps, owner guess).

5. Validate "fresh session" end-to-end and close verification gaps.
   - Perform a clean-room validation using only the runbook:
     - Fresh clone or equivalent (no prior setup assumptions), install deps, set env, run smoke.
     - Confirm IDs are discoverable as documented (logs and/or artifacts).
     - Confirm CI artifact retrieval steps work (either `gh` commands or documented UI fallback).
   - Record an objective pass/fail checklist at the bottom of the runbook.
   - If any step fails due to missing infra/artifacts/permissions, document the limitation in the runbook and file a follow-up bead (do not patch around it silently).

## Acceptance Criteria (from bead)

- Runbook explains failure classes, required diagnostics, and first-response workflow.
- Ownership is defined for core algorithm regressions vs harness failures.
- Docs include commands for local reproduction of smoke and full suites.
- Team can execute runbook from a fresh session without tribal context.
