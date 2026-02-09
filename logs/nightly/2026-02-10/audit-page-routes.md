# DRV-sea Nightly Audit - Page Routes and Layouts

Date: 2026-02-10
Task: DRV-sea

## Scope

- `src/routes/(driver)/+layout.svelte`
- `src/routes/(driver)/dashboard/+page.svelte`
- `src/routes/(driver)/schedule/+page.svelte`
- `src/routes/(driver)/bids/+page.svelte`
- `src/routes/(manager)/+layout.svelte`
- `src/routes/(manager)/drivers/+page.svelte`
- `src/routes/(manager)/routes/+page.svelte`
- `src/routes/(manager)/warehouses/+page.svelte`
- `src/routes/(manager)/admin/reset-password/+page.svelte`
- `src/routes/(app)/+layout.svelte`
- `src/routes/(app)/settings/+page.svelte`
- `src/routes/(app)/notifications/+page.svelte`
- Supporting shell/state files: `src/routes/(app)/+layout.server.ts`, `src/routes/(driver)/+layout.server.ts`, `src/routes/(manager)/+layout.server.ts`, `src/lib/components/app-shell/AppSidebar.svelte`, `src/lib/components/app-shell/PageHeader.svelte`, `src/lib/components/data-table/DataTable.svelte`, `src/lib/stores/app-shell/pageHeaderStore.svelte.ts`, and audited page stores under `src/lib/stores/*.svelte.ts`

## Findings Summary

- High: 3
- Medium: 3
- Low: 1

## Findings

### HIGH - Manager shell is missing offline UX parity with driver/shared app shells

- Evidence:
  - `src/routes/(manager)/+layout.svelte:8`-`src/routes/(manager)/+layout.svelte:10` imports no `OfflineBanner`.
  - `src/routes/(manager)/+layout.svelte:15`-`src/routes/(manager)/+layout.svelte:23` renders shell without offline banner region.
  - `src/routes/(driver)/+layout.svelte:10` and `src/routes/(driver)/+layout.svelte:20` include/render `OfflineBanner`.
  - `src/routes/(app)/+layout.svelte:10` and `src/routes/(app)/+layout.svelte:24` include/render `OfflineBanner`.
- Impact: Managers lose explicit offline state feedback and recovery context in the same shell where drivers/shared pages still provide it, which creates role-dependent behavior drift.
- Recommendation: Add `OfflineBanner` to manager layout and keep all app-shell variants aligned through a shared shell composition path.

### HIGH - Error-state handling is incomplete across major audited pages (failures collapse into generic UI)

- Evidence:
  - Store-level error state exists in all major route stores, e.g. `src/lib/stores/dashboardStore.svelte.ts:92`, `src/lib/stores/scheduleStore.svelte.ts:50`, `src/lib/stores/bidsStore.svelte.ts:45`, `src/lib/stores/driverStore.svelte.ts:21`, `src/lib/stores/routeStore.svelte.ts:29`, `src/lib/stores/warehouseStore.svelte.ts:25`.
  - Driver pages branch only on loading/content/empty and never render store error state: `src/routes/(driver)/dashboard/+page.svelte:476`, `src/routes/(driver)/schedule/+page.svelte:408`, `src/routes/(driver)/bids/+page.svelte:79`.
  - Manager pages pass loading/empty props to `DataTable` but do not render explicit load-error UI: `src/routes/(manager)/drivers/+page.svelte:694`, `src/routes/(manager)/routes/+page.svelte:994`, `src/routes/(manager)/warehouses/+page.svelte:458`.
  - By contrast, notifications does render an explicit error branch: `src/routes/(app)/notifications/+page.svelte:114`.
- Impact: API/network failures are visually ambiguous (often appearing as empty datasets after a toast), which is high-risk for operational pages (drivers/routes/warehouses) and can hide outage conditions.
- Recommendation: Add persistent inline error branches with retry actions on all audited data pages; reserve empty states for true-empty payloads only.

### HIGH - Global app header context (title/breadcrumbs) is blank or stale for most audited routes

- Evidence:
  - Header state defaults to empty title: `src/lib/stores/app-shell/pageHeaderStore.svelte.ts:19`.
  - `PageHeader` renders title directly from store when no breadcrumbs: `src/lib/components/app-shell/PageHeader.svelte:27` and `src/lib/components/app-shell/PageHeader.svelte:108`.
  - Route-level header configuration appears only on settings: `src/routes/(app)/settings/+page.svelte:75` and reset at `src/routes/(app)/settings/+page.svelte:91`.
  - No equivalent header configuration was found in audited driver/manager pages.
- Impact: The shell header can show blank/stale context while route content changes, weakening navigation orientation and perceived polish.
- Recommendation: Standardize per-route `pageHeaderStore.configure(...)` and cleanup on all shell pages (driver, manager, notifications, etc.).

### MEDIUM - Layout nesting is implemented as duplicated role shells rather than a single shared app shell flow

- Evidence:
  - Three separate shell layouts duplicate app-shell structure: `src/routes/(app)/+layout.svelte:20`, `src/routes/(driver)/+layout.svelte:16`, `src/routes/(manager)/+layout.svelte:15`.
  - Role guards are enforced separately in server layouts: `src/routes/(app)/+layout.server.ts:11`, `src/routes/(driver)/+layout.server.ts:10`, `src/routes/(manager)/+layout.server.ts:10`.
  - Divergence already exists (offline banner parity issue above), indicating drift risk from duplicate shell code paths.
- Impact: Increases maintenance overhead and raises probability of role-specific shell regressions (feature added in one shell, missed in another).
- Recommendation: Consolidate shell rendering into one shared layout path and keep role checks in dedicated guard logic only.

### MEDIUM - Manager route inventory and sidebar navigation are not fully aligned

- Evidence:
  - Manager route exists at `src/routes/(manager)/admin/reset-password/+page.svelte:1`.
  - Manager sidebar includes only drivers/routes/warehouses links: `src/lib/components/app-shell/AppSidebar.svelte:69`-`src/lib/components/app-shell/AppSidebar.svelte:88`.
- Impact: Admin-capable pages may be effectively hidden from in-app discoverability and create mismatch between route surface and declared navigation IA.
- Recommendation: Either add explicit navigation/entry point for manager admin routes or document and enforce the route as intentionally non-navigable.

### MEDIUM - 390px no-horizontal-scroll requirement conflicts with current data-table baseline behavior

- Evidence:
  - Data table scroll region explicitly enables horizontal scrolling: `src/lib/components/data-table/DataTable.svelte:799`.
  - Table width uses intrinsic max-content behavior: `src/lib/components/data-table/DataTable.svelte:809`.
  - Inline note indicates mobile horizontal scroll is expected: `src/lib/components/data-table/DataTable.svelte:805`.
  - Manager pages audited here are table-driven: `src/routes/(manager)/drivers/+page.svelte:692`, `src/routes/(manager)/routes/+page.svelte:992`, `src/routes/(manager)/warehouses/+page.svelte:456`.
- Impact: On narrow devices (390px), users can encounter lateral panning in core manager workflows unless mobile detail patterns fully eliminate overflow.
- Recommendation: Validate at 390px in-browser and prioritize a no-horizontal-scroll baseline (column pruning/stacking first, horizontal scroll as explicit fallback only).

### LOW - Sidebar active-state matching can produce false positives for prefix-sharing routes

- Evidence:
  - Active nav detection uses `startsWith`: `src/lib/components/app-shell/AppSidebar.svelte:92`-`src/lib/components/app-shell/AppSidebar.svelte:94`.
- Impact: Paths that share prefixes (for example, `/routes-archive`) can incorrectly highlight `/routes` as active.
- Recommendation: Use segment-aware matching (exact or slash-delimited prefix) for stable active-state semantics.

## Checks Completed (No Immediate Defect Found)

- Role-based route isolation is present in server guards for manager/driver/shared sections (`src/routes/(manager)/+layout.server.ts:10`, `src/routes/(driver)/+layout.server.ts:10`, `src/routes/(app)/+layout.server.ts:11`).
- All audited pages include explicit document titles via `<svelte:head><title>...` (for example `src/routes/(driver)/dashboard/+page.svelte:463`, `src/routes/(manager)/routes/+page.svelte:1033`, `src/routes/(app)/notifications/+page.svelte:86`).
- Store initialization on mount is present across audited data routes (`dashboard`, `schedule`, `bids`, `drivers`, `routes`, `warehouses`, `notifications`).
- Loading and empty-state branches are implemented across audited pages; primary gap is explicit persistent error state parity.

## Priority Fix Order

1. Restore manager offline parity and add persistent error-state branches for all audited data pages.
2. Standardize shell header configuration (`pageHeaderStore`) across all role/shared pages.
3. Consolidate duplicated shell layout paths to reduce guard/shell drift.
4. Resolve manager navigation-to-route mismatch for admin routes.
5. Verify and enforce 390px no-horizontal-scroll behavior for manager table workflows.
