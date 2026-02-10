# Audit all Svelte stores

Task: DRV-3o8

## Steps

1. Discover the full store scope with recursive matching (`src/lib/stores/**/*.svelte.ts`), capture the exact inventory list in the report, and confirm audited count must equal discovered count.
2. Build and fill a per-store x per-criterion audit matrix covering all required dimensions: runes correctness, state handling, optimistic rollback, API failure surfacing, connectivity guards, response validation, race risks, memory cleanup, and init-failure handling.
3. Record evidence for every matrix judgment with file/line references and explicit pass/fail/partial/NA outcomes.
4. Apply a fixed severity rubric (`critical`, `high`, `medium`, `low`) for each issue using impact and likelihood, and include concrete remediation guidance.
5. Write `logs/nightly/2026-02-10/audit-stores.md` with mandatory sections: scope inventory, audit matrix, findings by severity, prioritized must-fix-before-production list, and an acceptance-criteria traceability section mapping each criterion to evidence.

## Acceptance Criteria

- Audit covers all Svelte 5 stores in `src/lib/stores/**/*.svelte.ts`.
- Findings assess runes correctness (`$state`, `$derived`, `$effect`) and state model quality.
- Findings assess optimistic rollback behavior and API failure handling/user surfacing.
- Findings assess race-condition and memory-leak risks.
- Findings assess connectivity guards (`ensureOnlineForWrite`) on write operations.
- Findings assess API response validation before storing and store initialization failure handling.
- Report includes per-store/per-criterion traceability with evidence references.
- Report includes a fixed severity rubric and prioritized must-fix-before-production actions.
- Report is written to `logs/nightly/2026-02-10/audit-stores.md` with severity ratings.
