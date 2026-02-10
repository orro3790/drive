# DRV-dbd Reachability and Deep-Link Verification

Date: 2026-02-07
Epic: `DRV-dbd`

## Scope

- Driver routes: `/dashboard`, `/schedule`, `/bids`
- Shared routes: `/notifications`, `/settings`
- Shell layouts: driver/app/manager

## Pass Evidence

### Scroll-owner contract (code evidence)

- Single vertical scroll owner added at shell level via `data-scroll-root` on:
  - `src/routes/(driver)/+layout.svelte`
  - `src/routes/(app)/+layout.svelte`
  - `src/routes/(manager)/+layout.svelte`
- Shell content region now scrolls vertically (`overflow-y: auto`) and wrappers no longer clip route surfaces.
- Shared page scaffolding updated in `src/app.css`:
  - `.page-stage` no longer clips (`overflow: visible`)
  - `.page-stage` can grow with route content (`flex: 1 0 auto`, `min-height: 100%`)

### Route surface contract (code evidence)

- Removed viewport-height coupling from target surfaces:
  - `src/routes/(driver)/dashboard/+page.svelte`
  - `src/routes/(driver)/schedule/+page.svelte`
  - `src/routes/(driver)/bids/+page.svelte`
  - `src/routes/(app)/notifications/+page.svelte`
  - `src/routes/(app)/settings/+page.svelte`
- Settings route no longer introduces independent vertical scroll owners in sidebar/content columns.

### Notifications infinite scroll reliability

- `IntersectionObserver` now resolves root from the shell scroll container (`[data-scroll-root]`) in:
  - `src/routes/(app)/notifications/+page.svelte`
- Observer uses prefetch root margin and a low threshold to reduce missed loads near the sentinel.

### Deep-link and role redirect guard checks (code evidence)

- Unauthenticated deep links still redirect through hooks middleware:
  - `src/hooks.server.ts`
- Role guards remain active and unchanged for deep links:
  - Driver-only guard: `src/routes/(driver)/+layout.server.ts`
  - Manager-only guard: `src/routes/(manager)/+layout.server.ts`
  - Shared-auth guard: `src/routes/(app)/+layout.server.ts`

### Reachability matrix (agent-browser run, desktop + mobile)

| Route            | Desktop | Mobile | Evidence                                                                                          |
| ---------------- | ------- | ------ | ------------------------------------------------------------------------------------------------- |
| `/dashboard`     | PASS    | PASS   | `hasRoot=true`; mobile `scrollHeight=1951`, `clientHeight=620`, bottom reachable                  |
| `/schedule`      | PASS    | PASS   | `hasRoot=true`; desktop `scrollHeight=1591`, `clientHeight=676`, bottom reachable                 |
| `/bids`          | PASS    | PASS   | `hasRoot=true`; desktop `scrollHeight=19828`, mobile `scrollHeight=20054`, bottom reachable       |
| `/notifications` | PASS    | PASS   | `hasRoot=true`; sentinel rendered and pagination advanced to load all pages on desktop and mobile |
| `/settings`      | PASS    | PASS   | `hasRoot=true`; sidebar/content overflow styles are `visible` (no nested vertical scroll owners)  |

### Notifications pagination trigger checks (agent-browser)

- Data setup for this check: inserted 45 additional notifications for `billy.walsh@driver.test` (total 54).
- Post-check cleanup: deleted all seeded rows tagged with `data.source = agent-browser-seed` (45 rows).
- Desktop run (`/notifications`):
  - Initial state: `count=20`, `hasSentinel=true`
  - After scrolling shell root: `count=54`, `hasSentinel=false`
  - Captured fetches: `/api/notifications?page=2&pageSize=20`, `/api/notifications?page=3&pageSize=20`
- Mobile run (iPhone 14 emulation, `/notifications`):
  - Initial state: `count=20`, `hasSentinel=true`
  - After scrolling shell root: `count=54`, `hasSentinel=false`
  - Captured fetches: `/api/notifications?page=2&pageSize=20`, `/api/notifications?page=3&pageSize=20`

### Redirect checks (agent-browser)

- Driver attempting manager deep link `/routes` redirects to `/dashboard`.
- Unauthenticated deep links redirect to sign-in with preserved redirect query:
  - `/dashboard` -> `/sign-in?redirect=%2Fdashboard`
  - `/notifications` -> `/sign-in?redirect=%2Fnotifications`
- Browser error scan (`agent-browser errors`) returned no page errors during the run.

### Quality gates

- `pnpm lint`: PASS (Prettier drift resolved; ESLint reports warnings in generated Paraglide files)
- `pnpm check`: PASS
- `pnpm test`: PASS (3/3 tests)

## Fail Evidence / Remaining Defects

- No remaining defects observed within DRV-dbd scope.
