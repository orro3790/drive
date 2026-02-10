# DRV-17l.17: Dead-Code and Dependency Cleanup Plan

## Goal

Implement low-risk cleanup from the 2026-02-10 dead-code audit, limited to removals with high confidence and clear validation gates, while preserving core auth and dashboard behavior.

## Source Inputs

- Bead: `DRV-17l.17`
- Audit report: `logs/nightly/2026-02-10/audit-dead-code.md`
- Acceptance criteria: validate chosen removals with `pnpm check`, `pnpm build`, and core auth/dashboard smoke checks.

## Proposed Scope (Build Candidate)

### 1) Remove duplicate orphaned Paraglide tree

- Remove tracked legacy tree: `src/paraglide/**`
- Rationale:
  - Current Vite config generates Paraglide output to `src/lib/paraglide`.
  - Code imports resolve through `$lib/paraglide/*`.
  - No code references to `src/paraglide/*`.

### 2) Trim unused exports (keep behavior unchanged)

- `src/lib/config/lifecycleLabels.ts`
  - Remove unused exported `statusChipVariants`.
  - Make `cancelReasonLabels` internal (non-export) because it is only used to derive `cancelReasonOptions` within the module.
- `src/lib/auth-client.ts`
  - Keep `ac`, `admin`, and `manager` as module-local constants (remove `export`) since only `authClient` is consumed externally.
- `src/lib/stores/helpers/connectivity.ts`
  - Keep `isOffline` as module-local helper (remove `export`) and retain `ensureOnlineForWrite` as the public API.

### 3) Remove dormant utility and dependency

- Remove unused utility file `src/lib/utils/cn.ts`.
- Remove stale re-export from `src/lib/utils/index.ts`.
- Remove unused dependency `clsx` from `package.json`.

### 4) Remove unused table adapter dependency

- Remove `@tanstack/svelte-table` from `package.json`.
- Keep `@tanstack/table-core` because it is actively used by the custom table adapter.

## Deferred / Out of Scope (for this bead execution)

- `src/lib/firebase.ts` removal is deferred pending explicit product decision on client-side push initialization path.
- `@playwright/test` removal is deferred because project docs describe planned E2E usage.
- Dormant academy/explorer/pipeline store slice cleanup is deferred as a larger feature-scope decision.
- API/schema field removals in `/api/drivers` are deferred to avoid contract churn in this low-risk cleanup.

## Execution Steps

1. Capture baseline
   - Record `git status --short`.
   - Run `pnpm check` and `pnpm build` before edits.
2. Run pre-delete usage scans (immediately before file/dependency removal)
   - Confirm zero references to `src/paraglide/*`.
   - Confirm zero imports of `src/lib/utils/cn.ts` and `clsx`.
   - Confirm zero imports of `@tanstack/svelte-table`.
3. Batch A: remove duplicate Paraglide tree only (`src/paraglide/**`)
   - Validate with `pnpm check` and `pnpm build`.
   - Smoke: sign-in load/login, dashboard load, locale switch updates visible labels.
4. Batch B: trim export visibility + utility cleanup
   - Apply export trims in `lifecycleLabels.ts`, `auth-client.ts`, `connectivity.ts`.
   - Remove `src/lib/utils/cn.ts` and stale `utils/index.ts` re-export.
   - Validate with `pnpm check` and `pnpm build`.
   - Smoke: dashboard write-path action guarded by connectivity helper still behaves correctly.
5. Batch C: remove verified-unused dependencies
   - Remove `clsx` and `@tanstack/svelte-table` from `package.json`.
   - Run `pnpm install` to refresh lockfile.
   - Validate with `pnpm check` and `pnpm build`.
6. Final smoke + evidence capture
   - Auth: sign-in page loads and sign-in succeeds.
   - Dashboard: cards/status labels render correctly after login.
   - Locale: switch language and verify translated text updates.
   - Write path: run one dashboard write action and confirm no regression.
   - Save command outputs/checklist notes as closure evidence for the bead.
7. Optional hardening (non-blocking for this bead)
   - Run `pnpm lint`; if failures are unrelated pre-existing lint debt, document and defer.
8. If any regression is found
   - Revert only the failing batch (keep other batches intact) and re-run gates.

## Risk Notes and Mitigations

- Paraglide risk: removing `src/paraglide` could expose hidden import aliases.
  - Mitigation: repo-wide import scan plus `pnpm check` and `pnpm build` after removal.
- Dependency risk: removing `clsx` or `@tanstack/svelte-table` could break dormant imports.
  - Mitigation: run immediate pre-delete usage scans, then typecheck/build after each batch.
- Export visibility risk: making helpers internal could break out-of-module consumers.
  - Mitigation: pre-change usage scans and compile-time verification.
- Rollback risk: mixed edits can make selective undo error-prone.
  - Mitigation: keep changes in isolated batches so a single batch can be reverted without losing safe removals.

## Acceptance Mapping

- Chosen removals are explicit and bounded to high-confidence dead code.
- Validation gates include `pnpm check` and `pnpm build`.
- Smoke coverage includes auth, dashboard rendering, locale switch, and one dashboard write-path check.
- Any deferred item is intentionally excluded to keep this bead low-risk.
- Command outputs and smoke checklist notes are captured as closure evidence.

## Exit Criteria

- All scoped removals merged with no validation failures.
- Manual smoke checks for auth/dashboard pass.
- Bead `DRV-17l.17` can be closed with evidence of gates run.
