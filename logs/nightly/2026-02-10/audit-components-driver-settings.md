# DRV-ff4 Nightly Audit - Driver, Settings, and Notification Components

Date: 2026-02-10
Task: DRV-ff4

## Scope

- `src/lib/components/driver/HealthCard.svelte`
- `src/lib/components/driver/CancelShiftModal.svelte`
- `src/lib/components/settings/AccountSection.svelte`
- `src/lib/components/settings/DriverPreferencesSection.svelte`
- `src/lib/components/settings/ManagerOnboardingSection.svelte`
- `src/lib/components/settings/SettingsGrid.svelte`
- `src/lib/components/settings/SettingsGroupTitle.svelte`
- `src/lib/components/settings/SettingsRow.svelte`
- `src/lib/components/settings/SettingsNav.svelte`
- `src/lib/components/notifications/NotificationItem.svelte`
- Supporting references: `src/routes/(app)/settings/+page.svelte`, `src/routes/(app)/notifications/+page.svelte`, `src/lib/stores/preferencesStore.svelte.ts`, `src/lib/stores/notificationsStore.svelte.ts`, `src/routes/api/driver-health/+server.ts`

Note: The bead text mentions "all 6 components in settings/"; current tree contains 7 Svelte files under `src/lib/components/settings/`, and all 7 were audited.

## Findings Summary

- High: 3
- Medium: 4
- Low: 1

## Findings

### HIGH - Manager onboarding failed-load path is rendered as a false empty state

- Evidence:
  - `src/lib/components/settings/ManagerOnboardingSection.svelte:115` fetches onboarding entries.
  - `src/lib/components/settings/ManagerOnboardingSection.svelte:125`-`src/lib/components/settings/ManagerOnboardingSection.svelte:127` handles failures with toast only (no persistent error flag).
  - `src/lib/components/settings/ManagerOnboardingSection.svelte:75`-`src/lib/components/settings/ManagerOnboardingSection.svelte:77` renders "empty" when `entries.length === 0`.
- Impact: A backend/API failure is visually indistinguishable from a genuinely empty onboarding list, creating operator risk (duplicate approvals/invites and missed incident detection).
- Recommendation: Add explicit `loadError` state with inline error banner + retry, and avoid showing the empty-state message when a fetch failed.

### HIGH - Notification item nests a link inside a button (invalid interactive semantics)

- Evidence:
  - `src/lib/components/notifications/NotificationItem.svelte:93` defines the root as `<button>`.
  - `src/lib/components/notifications/NotificationItem.svelte:121` places `<a class="notification-cta">` inside that button.
- Impact: Nested interactive elements produce invalid HTML semantics and can cause inconsistent keyboard/screen-reader behavior and click handling across browsers.
- Recommendation: Restructure so the card container is non-button (`article`/`div`) with explicit child actions, or split into separate sibling controls for "mark read" and CTA navigation.

### HIGH - Mobile touch-target policy (44px minimum) is not met for key settings controls

- Evidence:
  - `src/lib/components/Combobox.svelte:61` sets combobox control height to `28px`.
  - `src/lib/components/Select.svelte:70` sets select control height to `28px`.
  - `src/lib/components/InlineEditor.svelte:223` sets small inline editor min-height to `32px`.
  - These controls are used in audited flows: `src/lib/components/settings/ManagerOnboardingSection.svelte:77`, `src/lib/components/settings/ManagerOnboardingSection.svelte:312`, `src/lib/components/settings/ManagerOnboardingSection.svelte:327`, `src/lib/components/settings/AccountSection.svelte:323`, `src/lib/components/driver/CancelShiftModal.svelte:49`.
- Impact: On 390px/coarse-pointer devices, critical form actions are harder to tap reliably, violating the stated audit bar and increasing input errors.
- Recommendation: Add coarse-pointer media rules to raise interactive control heights to >=44px (same pattern already present in `Button`/`IconButton`).

### MEDIUM - `CancelShiftModal` is not the production cancel flow (orphaned component)

- Evidence:
  - No imports/usages of `CancelShiftModal` were found under `src/`.
  - Active cancellation UX is implemented inline in `src/routes/(driver)/dashboard/+page.svelte:1043` and `src/routes/(driver)/schedule/+page.svelte:475`.
- Impact: Improvements to `CancelShiftModal` do not affect live driver cancellation behavior, increasing drift between "audited" component and real user path.
- Recommendation: Either wire `CancelShiftModal` into dashboard/schedule flows or remove it to prevent stale parallel implementations.

### MEDIUM - Driver preferences failure mode lacks a persistent error state in the section UI

- Evidence:
  - `src/lib/stores/preferencesStore.svelte.ts:95`-`src/lib/stores/preferencesStore.svelte.ts:98` records load failure and shows toast.
  - `src/lib/components/settings/DriverPreferencesSection.svelte:166`-`src/lib/components/settings/DriverPreferencesSection.svelte:172` switches from loading directly to editable grid; no branch for `preferencesStore.error`.
- Impact: Failed initial load is visually ambiguous, and users can interact with controls without seeing that baseline preference data did not load.
- Recommendation: Add an inline failure state with retry and gate write controls until initial load succeeds.

### MEDIUM - HealthCard onboarding edge case lacks explicit onboarding UX treatment

- Evidence:
  - `src/routes/api/driver-health/+server.ts:55` returns onboarding payload with `score: null` and `isOnboarding: true` for new drivers.
  - `src/lib/components/driver/HealthCard.svelte:73`-`src/lib/components/driver/HealthCard.svelte:75` treats any non-null `health` payload as normal render path.
  - `src/lib/components/driver/HealthCard.svelte` does not branch on `health.isOnboarding`.
- Impact: New drivers see a normal score/stars layout with zero values but no explicit onboarding explanation, which can be misread as poor performance rather than uninitialized state.
- Recommendation: Introduce onboarding-specific copy/state block (and optional reduced visual emphasis) when `health.isOnboarding` is true.

### MEDIUM - Long notification text can overflow because wrapping guards are missing

- Evidence:
  - `src/lib/components/notifications/NotificationItem.svelte:275`-`src/lib/components/notifications/NotificationItem.svelte:280` styles `.notification-body` without `overflow-wrap`/`word-break`.
  - `src/lib/components/notifications/NotificationItem.svelte:223`-`src/lib/components/notifications/NotificationItem.svelte:227` styles `.notification-title` without explicit long-token wrapping behavior.
- Impact: Unbroken long tokens (IDs, URLs, localized strings) can force overflow or clipping on narrow viewports.
- Recommendation: Add `overflow-wrap: anywhere` (or `word-break: break-word`) to title/body text blocks.

### LOW - `SettingsNav` appears stale/unused relative to current settings page architecture

- Evidence:
  - `src/lib/components/settings/SettingsNav.svelte` has no in-repo consumers.
  - `src/routes/(app)/settings/+page.svelte:103`-`src/routes/(app)/settings/+page.svelte:106` renders settings sections directly without nav integration.
- Impact: Unused UI code increases maintenance surface and can drift from current accessibility/layout standards.
- Recommendation: Remove unused component or reintegrate it with the current settings route if sidebar nav is still desired.

## Checks Completed (No Immediate Defect Found)

- HealthCard star/streak and contribution rendering paths are internally consistent with the current `HealthResponse` contract and helper derivations (`src/lib/components/driver/healthCardState.ts`).
- `CancelShiftModal` implements required reason validation before submit and late-cancellation warning visibility via `isLateCancel`.
- Account/password settings include schema-backed validation, inline field errors, and explicit cancel/reset for password form.
- Notification read/unread styling and optimistic read transitions align with `notificationsStore.markRead` update behavior.
- Settings row/grid primitives provide responsive control wrapping at narrow container widths (`@container (max-width: 620px)` in `SettingsRow`).

## Priority Fix Order

1. Fix notification interactive semantics (`NotificationItem` button/link nesting).
2. Add persistent failed-data UI states for onboarding and preferences sections.
3. Enforce >=44px touch targets for select/combobox/inline editor controls in coarse-pointer contexts.
4. Resolve cancel-flow component drift (either adopt `CancelShiftModal` in live routes or delete it).
5. Add onboarding-specific HealthCard state copy and long-text wrapping safeguards in notifications.
