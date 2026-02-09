# DRV-3o8 Nightly Audit - Svelte Stores

Date: 2026-02-10
Task: DRV-3o8

## Scope Inventory

Discovered store set (recursive): `src/lib/stores/**/*.svelte.ts`

1. `src/lib/stores/academyMapStore.svelte.ts`
2. `src/lib/stores/app-shell/appSidebarStore.svelte.ts`
3. `src/lib/stores/app-shell/pageHeaderStore.svelte.ts`
4. `src/lib/stores/app-shell/toastStore.svelte.ts`
5. `src/lib/stores/bidWindowStore.svelte.ts`
6. `src/lib/stores/bidsStore.svelte.ts`
7. `src/lib/stores/dashboardStore.svelte.ts`
8. `src/lib/stores/driverStore.svelte.ts`
9. `src/lib/stores/explorerStore.svelte.ts`
10. `src/lib/stores/notificationsStore.svelte.ts`
11. `src/lib/stores/pipelineStore.svelte.ts`
12. `src/lib/stores/preferencesStore.svelte.ts`
13. `src/lib/stores/routeStore.svelte.ts`
14. `src/lib/stores/scheduleStore.svelte.ts`
15. `src/lib/stores/warehouseStore.svelte.ts`

Note: bead description references 12 stores with non-recursive glob; current repo has 15 recursive matches.

## Findings Summary

- Critical: 0
- High: 3
- Medium: 3
- Low: 1

## Findings

### HIGH - Connectivity guard coverage is inconsistent across write paths

- Evidence:
  - `ensureOnlineForWrite` exists and is used in driver-side mutation stores (`src/lib/stores/dashboardStore.svelte.ts:206`, `src/lib/stores/scheduleStore.svelte.ts:115`, `src/lib/stores/preferencesStore.svelte.ts:107`, `src/lib/stores/bidsStore.svelte.ts:123`).
  - Manager/admin mutation stores perform network writes without the guard:
    - `src/lib/stores/warehouseStore.svelte.ts:98`, `src/lib/stores/warehouseStore.svelte.ts:138`, `src/lib/stores/warehouseStore.svelte.ts:182`
    - `src/lib/stores/routeStore.svelte.ts:139`, `src/lib/stores/routeStore.svelte.ts:198`, `src/lib/stores/routeStore.svelte.ts:247`, `src/lib/stores/routeStore.svelte.ts:312`, `src/lib/stores/routeStore.svelte.ts:371`
    - `src/lib/stores/driverStore.svelte.ts:162`, `src/lib/stores/driverStore.svelte.ts:185`, `src/lib/stores/driverStore.svelte.ts:208`
    - `src/lib/stores/bidWindowStore.svelte.ts:169`, `src/lib/stores/bidWindowStore.svelte.ts:229`
    - `src/lib/stores/notificationsStore.svelte.ts:130`, `src/lib/stores/notificationsStore.svelte.ts:159`
- Impact: Offline mutation attempts become generic API failures, optimistic state may flicker/rollback late, and users get inconsistent UX between modules.
- Recommendation: Enforce `ensureOnlineForWrite` (or a shared guarded mutation helper) across all write methods before `fetch`.

### HIGH - Runtime response validation is missing in most business-critical stores

- Evidence:
  - Direct JSON-to-state assignment without schema parse in core stores:
    - `src/lib/stores/dashboardStore.svelte.ts:79`, `src/lib/stores/dashboardStore.svelte.ts:82`
    - `src/lib/stores/scheduleStore.svelte.ts:102`, `src/lib/stores/scheduleStore.svelte.ts:103`
    - `src/lib/stores/routeStore.svelte.ts:98`, `src/lib/stores/routeStore.svelte.ts:99`
    - `src/lib/stores/warehouseStore.svelte.ts:55`, `src/lib/stores/warehouseStore.svelte.ts:56`
    - `src/lib/stores/bidsStore.svelte.ts:88`, `src/lib/stores/bidsStore.svelte.ts:89`, `src/lib/stores/bidsStore.svelte.ts:109`
    - `src/lib/stores/bidWindowStore.svelte.ts:127`, `src/lib/stores/bidWindowStore.svelte.ts:128`
    - `src/lib/stores/preferencesStore.svelte.ts:83`, `src/lib/stores/preferencesStore.svelte.ts:85`
  - Validation exists in only a subset (`src/lib/stores/notificationsStore.svelte.ts:89`, `src/lib/stores/driverStore.svelte.ts:103`).
- Impact: API contract drift or malformed responses can silently poison store state and cause downstream rendering/logic failures.
- Recommendation: Add schema-validated response parsing for each read/write response before committing to store state.

### HIGH - Optimistic mutation rollback is race-prone under rapid successive actions

- Evidence:
  - Rollbacks restore an earlier snapshot captured pre-mutation, without versioning or request ordering:
    - `src/lib/stores/warehouseStore.svelte.ts:122`, `src/lib/stores/warehouseStore.svelte.ts:154`
    - `src/lib/stores/routeStore.svelte.ts:174`, `src/lib/stores/routeStore.svelte.ts:219`
    - `src/lib/stores/driverStore.svelte.ts:119`, `src/lib/stores/driverStore.svelte.ts:177`
    - `src/lib/stores/preferencesStore.svelte.ts:116`, `src/lib/stores/preferencesStore.svelte.ts:157`
    - `src/lib/stores/notificationsStore.svelte.ts:120`, `src/lib/stores/notificationsStore.svelte.ts:142`
- Impact: Out-of-order completion (request A fails after request B succeeds) can revert valid newer state and mislead users.
- Recommendation: Add per-entity mutation version tokens (or queues) and only apply rollback/confirm if request version matches latest outstanding mutation.

### MEDIUM - Polling lifecycle can leak intervals and duplicate network traffic

- Evidence:
  - Polling uses module-level `setInterval` with manual stop (`src/lib/stores/bidWindowStore.svelte.ts:261`, `src/lib/stores/bidWindowStore.svelte.ts:279`), and cleanup depends on caller discipline.
- Impact: Missed teardown can leave orphan polling loops after navigation, increasing load and causing stale state churn.
- Recommendation: Wrap polling in lifecycle-aware integration (guaranteed teardown on route/component dispose) and consider visibility-based throttling.

### MEDIUM - Request ordering protection is absent on high-frequency loaders

- Evidence:
  - Bounds fetch does not cancel/sequence overlapping requests (`src/lib/stores/academyMapStore.svelte.ts:47`, `src/lib/stores/academyMapStore.svelte.ts:69`).
  - Bid windows load + polling can overlap and last response wins (`src/lib/stores/bidWindowStore.svelte.ts:114`, `src/lib/stores/bidWindowStore.svelte.ts:271`).
- Impact: Slower old responses can overwrite fresher user context (stale markers, stale windows).
- Recommendation: Use request IDs or abort controllers and ignore stale responses.

### MEDIUM - Audited store inventory differs from bead scope text

- Evidence:
  - Current recursive inventory returns 15 stores (including `app-shell/*` and `academyMapStore`).
  - Bead text expects 12 stores with `src/lib/stores/*.svelte.ts`.
- Impact: Nightly coverage can be undercounted if non-recursive scope is reused in future audits.
- Recommendation: Standardize audit scope to recursive glob and keep bead descriptions aligned with repository reality.

### LOW - Mutation state telemetry is inconsistent across stores

- Evidence:
  - Some stores expose explicit mutation flags (`src/lib/stores/dashboardStore.svelte.ts:86`, `src/lib/stores/bidWindowStore.svelte.ts:41`), others only show load-level state while running background writes (`src/lib/stores/warehouseStore.svelte.ts:22`, `src/lib/stores/driverStore.svelte.ts:18`).
- Impact: UX cannot consistently disable controls/show pending status for all mutations.
- Recommendation: Standardize per-action pending/error conventions across stores.

## Per-Store Audit Matrix

Legend:

- PASS = acceptable in current implementation
- RISK = issue identified
- PARTIAL = present but incomplete
- N/A = not applicable for this store

Criteria columns:

- `Runes` = `$state/$derived/$effect` correctness
- `Rollback` = optimistic rollback on failed writes
- `APIFailUX` = API failure handling + user surfacing
- `Race` = rapid-action/stale-response safety
- `State` = loading/error/success state quality
- `Connectivity` = `ensureOnlineForWrite` coverage on writes
- `Memory` = cleanup/leak risk
- `Validation` = runtime response validation before storing
- `InitFail` = initialization failure handling

| Store                | Runes   | Rollback | APIFailUX | Race    | State   | Connectivity | Memory  | Validation | InitFail |
| -------------------- | ------- | -------- | --------- | ------- | ------- | ------------ | ------- | ---------- | -------- |
| `academyMapStore`    | PASS    | N/A      | PARTIAL   | RISK    | PASS    | N/A          | PASS    | RISK       | PASS     |
| `appSidebarStore`    | PASS    | N/A      | N/A       | PASS    | PASS    | N/A          | PASS    | N/A        | N/A      |
| `pageHeaderStore`    | PASS    | N/A      | N/A       | PASS    | PASS    | N/A          | PASS    | N/A        | N/A      |
| `toastStore`         | PASS    | N/A      | N/A       | PASS    | PASS    | N/A          | PARTIAL | N/A        | N/A      |
| `bidWindowStore`     | PASS    | PASS     | PASS      | RISK    | PASS    | RISK         | RISK    | RISK       | PASS     |
| `bidsStore`          | PASS    | N/A      | PASS      | PARTIAL | PASS    | PASS         | PASS    | RISK       | PASS     |
| `dashboardStore`     | PASS    | N/A      | PASS      | PARTIAL | PASS    | PASS         | PASS    | RISK       | PASS     |
| `driverStore`        | PASS    | PASS     | PASS      | RISK    | PARTIAL | RISK         | PASS    | PARTIAL    | PASS     |
| `explorerStore`      | PASS    | N/A      | N/A       | PASS    | PASS    | N/A          | PASS    | N/A        | N/A      |
| `notificationsStore` | PASS    | PASS     | PASS      | RISK    | PASS    | RISK         | PASS    | PASS       | PASS     |
| `pipelineStore`      | PARTIAL | PASS     | N/A       | RISK    | PARTIAL | N/A          | PASS    | N/A        | N/A      |
| `preferencesStore`   | PASS    | PASS     | PASS      | RISK    | PASS    | PASS         | PASS    | RISK       | PASS     |
| `routeStore`         | PASS    | PASS     | PASS      | RISK    | PARTIAL | RISK         | PASS    | RISK       | PASS     |
| `scheduleStore`      | PASS    | N/A      | PASS      | PARTIAL | PASS    | PASS         | PASS    | RISK       | PASS     |
| `warehouseStore`     | PASS    | PASS     | PASS      | RISK    | PARTIAL | RISK         | PASS    | RISK       | PASS     |

## Acceptance-Criteria Traceability

- Runes correctness (`$state`, `$derived`, `$effect`) -> matrix `Runes`; no invalid rune use found, but no `$derived/$effect` usage across audited files.
- Optimistic rollback on failed mutations -> matrix `Rollback`; assessed in `warehouseStore`, `routeStore`, `driverStore`, `notificationsStore`, `preferencesStore`, `bidWindowStore`; race weakness captured in High finding 3.
- API failure handling and user surfacing -> matrix `APIFailUX`; error-to-toast handling exists broadly, with partial surfacing in `academyMapStore`.
- Race conditions (rapid actions/stale closures) -> matrix `Race`; covered by High finding 3 and Medium finding 2.
- Loading/error/success state management -> matrix `State`; inconsistencies called out in Low finding 1.
- Connectivity guards (`ensureOnlineForWrite` on writes) -> matrix `Connectivity`; coverage gap is High finding 1.
- Memory leaks (cleanup/subscriptions/effects) -> matrix `Memory`; interval lifecycle risk is Medium finding 1.
- API response validation before storing -> matrix `Validation`; systemic gap is High finding 2.
- Store initialization failure handling -> matrix `InitFail`; networked stores generally catch/set error.

## Must-Fix-Before-Production (Prioritized)

1. Enforce connectivity guards across all write paths in manager/admin stores and notifications writes.
2. Add runtime schema validation on all API responses before store-state assignment in scheduling/dispatch-critical stores.
3. Add mutation ordering/version safeguards so optimistic rollback cannot clobber newer successful state.
4. Harden polling and bounds-fetch loaders against stale response overwrite and interval leakage.
