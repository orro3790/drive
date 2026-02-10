# Dead Code Audit - 2026-02-10

Task: DRV-59t

## Scope and method

- Scanned `src/` for orphaned files, unused exports, dead branches, store/schema usage gaps, stale artifacts, and unused CSS selectors.
- Cross-checked with static tooling (`pnpm dlx ts-prune`, `pnpm dlx knip --include files,dependencies,exports`) plus manual repo-wide import/usage searches.
- Treated generated code and dynamic runtime loading as special cases to avoid unsafe removals.

## Findings

### DC-01 - Duplicate orphaned i18n output tree (`src/paraglide/**`)

- Severity: **HIGH**
- Confidence: **High**
- Category: Orphaned files / unused exports
- Evidence:
  - `vite.config.ts:9` configures Paraglide output to `./src/lib/paraglide`.
  - Repo search shows active imports from `$lib/paraglide/*`, with no import references to `src/paraglide/*`.
  - `knip` reports `src/paraglide/runtime.js`, `src/paraglide/server.js`, and the message shards as unused files.
- Safe-to-remove recommendation:
  - Remove `src/paraglide/**` after confirming generation target is intentionally `src/lib/paraglide` only.
- Verification gate before/after removal:
  - Run `pnpm check` and `pnpm build`.
  - Smoke-test sign-in and dashboard text rendering plus locale switch.

### DC-02 - Orphaned Firebase web config module

- Severity: **MEDIUM**
- Confidence: **High**
- Category: Orphaned file
- Evidence:
  - `src/lib/firebase.ts` exports `firebaseConfig`, but there are no imports of `$lib/firebase` in the repo.
  - `ts-prune` flags `src/lib/firebase.ts:10 - firebaseConfig` as unused.
- Safe-to-remove recommendation:
  - Remove `src/lib/firebase.ts` if web push initialization is not planned in the app runtime.
  - If planned, wire it into the notification bootstrap and add coverage.
- Verification gate:
  - Run notifications-related flows (`/app/settings` token registration) and `pnpm check`.

### DC-03 - Unused lifecycle label exports

- Severity: **MEDIUM**
- Confidence: **High**
- Category: Unused exports
- Evidence:
  - `src/lib/config/lifecycleLabels.ts:26` `statusChipVariants` has no inbound usages.
  - `src/lib/config/lifecycleLabels.ts:34` `cancelReasonLabels` is only used internally to build `cancelReasonOptions`.
- Safe-to-remove recommendation:
  - Remove export visibility for internal-only maps (`cancelReasonLabels`) and delete `statusChipVariants` if not needed.
- Verification gate:
  - `pnpm check`, and spot-check driver schedule/dashboard status chip rendering.

### DC-04 - Exported internals that are not consumed externally

- Severity: **LOW**
- Confidence: **High**
- Category: Unused exports
- Evidence:
  - `src/lib/auth-client.ts` exports `ac`, `admin`, `manager` but only `authClient` is imported by app routes/components.
  - `src/lib/stores/helpers/connectivity.ts` exports `isOffline`; only `ensureOnlineForWrite` is used externally.
- Safe-to-remove recommendation:
  - Keep these as internal module symbols (remove `export`) unless external consumption is intentionally part of public API.
- Verification gate:
  - `pnpm check` and quick auth + write-action flows.

### DC-05 - Dormant utility path implies removable dependency (`clsx`)

- Severity: **MEDIUM**
- Confidence: **Medium**
- Category: Unused dependency / orphaned utility
- Evidence:
  - `src/lib/utils/cn.ts` imports `clsx`, but there are no inbound imports of `$lib/utils/cn` or `$lib/utils`.
  - `knip` reports `clsx` as unused dependency.
- Safe-to-remove recommendation:
  - If utility is truly unused, remove `src/lib/utils/cn.ts`, trim `src/lib/utils/index.ts` re-export, and remove `clsx` from `package.json`.
- Verification gate:
  - `pnpm lint` + `pnpm check`.

### DC-06 - Dormant academy/pipeline store slice appears disconnected

- Severity: **MEDIUM**
- Confidence: **Medium**
- Category: Orphaned feature modules
- Evidence:
  - `src/lib/stores/academyMapStore.svelte.ts`, `src/lib/stores/explorerStore.svelte.ts`, and `src/lib/stores/pipelineStore.svelte.ts` only reference each other and related schemas.
  - No route/component imports to activate this feature path were found.
  - `knip` marks these stores and related schemas as unused files.
- Safe-to-remove recommendation:
  - Either (a) archive/remove the feature slice, or (b) add explicit entry-point usage and tests to keep it alive.
- Verification gate:
  - If removing: `pnpm check`, `pnpm build`, and route smoke test.
  - If retaining: add route integration test proving usage.

### DC-07 - API/schema fields computed but not consumed by UI

- Severity: **LOW**
- Confidence: **Medium**
- Category: Unused schema/API fields
- Evidence:
  - `src/lib/schemas/driver.ts` fields `primaryWarehouseId`, `primaryWarehouseName`, `warehouseCohortAvgParcels`, `avgParcelsDeltaVsCohort` are produced in `src/routes/api/drivers/+server.ts`.
  - No UI/component consumption of these fields was found.
- Safe-to-remove recommendation:
  - Remove from API payload + schema if they are not part of an upcoming UX requirement.
- Verification gate:
  - Run manager drivers page smoke test and any contract tests for `/api/drivers`.

## Additional checks (no high-confidence removals)

- Unreachable code / impossible branches:
  - No high-confidence unreachable branch was found from static scan.
- Commented-out code and debug artifacts:
  - No `TODO`/`FIXME` markers in `src/`.
  - No runtime `console.log` in app code; only generated Paraglide doc examples.
- Unused CSS classes:
  - No high-confidence unused selector; dynamic class bindings and comment text caused false positives in heuristic scans.

## Dependency notes

- Likely removable after validation:
  - `@tanstack/svelte-table` (no imports found).
  - `@playwright/test` (no e2e specs found).
- Likely **not** removable without runtime verification:
  - `@axiomhq/pino` and `pino-pretty` are referenced as dynamic Pino transport targets in `src/lib/server/logger.ts`.

## Prioritized next actions

1. Remove duplicate `src/paraglide/**` tree and run full type/build checks.
2. Decide whether dormant academy/pipeline slice is planned; archive/remove if not.
3. Trim unused exports (`statusChipVariants`, auth-client internals, connectivity internal helper).
4. Remove `@tanstack/svelte-table` and possibly `clsx` after utility cleanup and validation.
