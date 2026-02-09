# DRV-uj9 Nightly Audit - Primitive and App-Shell Components

Date: 2026-02-10
Task: DRV-uj9

## Scope

- Primitive components audited (15):
  - `src/lib/components/primitives/Avatar.svelte`
  - `src/lib/components/primitives/Button.svelte`
  - `src/lib/components/primitives/Checkbox.svelte`
  - `src/lib/components/primitives/Chip.svelte`
  - `src/lib/components/primitives/DateTimeInput.svelte`
  - `src/lib/components/primitives/Drawer.svelte`
  - `src/lib/components/primitives/Icon.svelte`
  - `src/lib/components/primitives/IconButton.svelte`
  - `src/lib/components/primitives/Modal.svelte`
  - `src/lib/components/primitives/NoticeBanner.svelte`
  - `src/lib/components/primitives/RadioGroup.svelte`
  - `src/lib/components/primitives/Spinner.svelte`
  - `src/lib/components/primitives/Textarea.svelte`
  - `src/lib/components/primitives/Toggle.svelte`
  - `src/lib/components/primitives/Tooltip.svelte`
- App-shell components audited (4):
  - `src/lib/components/app-shell/AppSidebar.svelte`
  - `src/lib/components/app-shell/SidebarItem.svelte`
  - `src/lib/components/app-shell/PageHeader.svelte`
  - `src/lib/components/app-shell/OfflineBanner.svelte`
- Supporting references:
  - `src/app.css`
  - `src/lib/components/primitives/README.md`
  - `src/lib/components/ContextMenu.svelte`
  - `src/routes/(manager)/routes/+page.svelte`

Note: DRV-uj9 describes "12 primitives + 4 app-shell". Current repository contains 15 primitive `.svelte` components in `src/lib/components/primitives/`; all 15 were audited.

## Findings Summary

- High: 3
- Medium: 3
- Low: 2

## Findings

### HIGH - Modal and Drawer miss focus trapping/restoration required by primitive accessibility contract

- Evidence:
  - `src/lib/components/primitives/Modal.svelte:85` and `src/lib/components/primitives/Drawer.svelte:86` expose `role="dialog"` + `aria-modal`, but neither component implements focus trapping.
  - `src/lib/components/primitives/Modal.svelte:58`-`src/lib/components/primitives/Modal.svelte:79` and `src/lib/components/primitives/Drawer.svelte:59`-`src/lib/components/primitives/Drawer.svelte:80` only wire Escape/backdrop close handlers.
  - No focus capture on open and no focus restore on close are implemented in either file.
  - `src/lib/components/primitives/README.md:19` requires focus management (visible focus and focus restoration).
- Impact: Keyboard users can tab to background controls while dialogs are open and do not reliably return to the launching control on close.
- Recommendation: Add a shared dialog focus utility (initial focus target, tab loop containment, restore-to-trigger on close) and apply to both Modal and Drawer.

### HIGH - Chip uses undefined design tokens, breaking size and motion consistency across production views

- Evidence:
  - `src/lib/components/primitives/Chip.svelte:128` uses `var(--spacing-half)`.
  - `src/lib/components/primitives/Chip.svelte:140` uses `var(--font-weight-normal)`.
  - `src/lib/components/primitives/Chip.svelte:270` uses `var(--transition-fast)`.
  - Token set in `src/app.css` defines spacing as `--spacing-1`, `--spacing-1-5`, etc. (`src/app.css:96`-`src/app.css:106`), font weights as medium/bold (`src/app.css:76`-`src/app.css:77`), and transitions as `--transition-duration-*`/`--transition-all` (`src/app.css:277`-`src/app.css:283`) - none of the Chip tokens above exist.
  - Chip is used in core views (`src/routes/(driver)/dashboard/+page.svelte:532`, `src/routes/(driver)/bids/+page.svelte:153`, `src/routes/(manager)/routes/+page.svelte:619`).
- Impact: Missing tokens make specific declarations invalid at runtime, causing inconsistent sizing/weight/transition behavior in heavily used UI chips.
- Recommendation: Replace undefined tokens with existing system tokens (or formally add new tokens to `app.css` and migrate all usages consistently).

### HIGH - Toggle fails 44px coarse-pointer target expectations, including active menu usage

- Evidence:
  - `src/lib/components/primitives/Toggle.svelte:95`-`src/lib/components/primitives/Toggle.svelte:110` sets base size to 36x20 and xs size to 20x12.
  - Unlike Button/IconButton, Toggle has no coarse-pointer media rule to expand touch targets.
  - Toggle is used in menu controls (`src/lib/components/ContextMenu.svelte:20`).
- Impact: At 390px/coarse-pointer usage, toggles are significantly below accessible target size and increase missed taps.
- Recommendation: Add pointer-coarse/hover-none overrides to enforce >=44px interactive hit area while preserving visual knob size.

### MEDIUM - Tooltip reuses a static content id and misapplies `aria-describedby`

- Evidence:
  - `src/lib/components/primitives/Tooltip.svelte:156` sets `aria-describedby="tooltip-content"` on the tooltip element itself.
  - `src/lib/components/primitives/Tooltip.svelte:168` hardcodes `id="tooltip-content"` for every instance.
- Impact: Reused ids are invalid when multiple tooltips exist in DOM, and description wiring is attached to the wrong node (trigger should reference tooltip content).
- Recommendation: Generate unique ids per tooltip instance and move descriptive linkage to the trigger element semantics.

### MEDIUM - PageHeader breadcrumb markup is semantically invalid list structure

- Evidence:
  - `src/lib/components/app-shell/PageHeader.svelte:87` defines breadcrumb as `<ol>`.
  - `src/lib/components/app-shell/PageHeader.svelte:98` inserts `<span class="sep">` directly under `<ol>` between `<li>` elements.
- Impact: Non-`li` direct children inside ordered lists create invalid list semantics and can degrade screen-reader breadcrumb announcements.
- Recommendation: Render separators via CSS pseudo-elements or include separators within list items while preserving valid `<ol><li>` structure.

### MEDIUM - Button anchor mode does not implement disabled link semantics

- Evidence:
  - `src/lib/components/primitives/Button.svelte:107`-`src/lib/components/primitives/Button.svelte:119` renders `<a href=...>` when `href` is set.
  - Disabled visual state is applied via class (`src/lib/components/primitives/Button.svelte:112` and `src/lib/components/primitives/Button.svelte:383`-`src/lib/components/primitives/Button.svelte:388`).
  - Anchor branch does not set `aria-disabled`, remove `href`, or set `tabindex=-1` when disabled/loading.
- Impact: Disabled links can remain keyboard-focusable/navigable, producing inconsistent disabled behavior versus button mode.
- Recommendation: For disabled/loading anchors, suppress navigation semantics (`href` removal + `aria-disabled` + keyboard guard) or render as `<button>` in disabled state.

### LOW - Avatar hover preview is mouse-only (no keyboard/focus trigger path)

- Evidence:
  - `src/lib/components/primitives/Avatar.svelte:120`-`src/lib/components/primitives/Avatar.svelte:121` only attaches `mouseenter`/`mouseleave` to trigger preview.
  - Wrapper is not keyboard-focusable (`src/lib/components/primitives/Avatar.svelte:117`-`src/lib/components/primitives/Avatar.svelte:123`).
- Impact: Keyboard and assistive-tech users cannot access enlarged preview behavior.
- Recommendation: Add optional focus-triggered preview behavior (or explicitly mark preview as decorative-only and document that behavior).

### LOW - DateTimeInput picker icon styling uses hardcoded filter behavior

- Evidence:
  - `src/lib/components/primitives/DateTimeInput.svelte:86`-`src/lib/components/primitives/DateTimeInput.svelte:88` applies `filter: invert(0.5)` to the picker indicator.
- Impact: Browser-native calendar icon contrast can become inconsistent across light/dark themes and platform implementations.
- Recommendation: Prefer token-aware color strategy where supported and avoid fixed invert filters unless platform-tested across themes.

## Checks Completed (No Immediate Defect Found)

- Primitive typing contracts are generally explicit and consistent (`$props` typing is present across all audited components).
- Checkbox and Textarea maintain accessible base semantics (native inputs remain in DOM, focusable, and label-capable).
- AppSidebar and SidebarItem provide keyboard-operable navigation behavior (tab focus + Enter/Space handling path).
- OfflineBanner correctly registers and cleans up online/offline listeners and avoids crashing when service worker APIs are unavailable.

## Priority Fix Order

1. Implement focus trap + focus restore in Modal/Drawer.
2. Repair Chip token drift to re-align with `app.css` design tokens.
3. Add coarse-pointer touch-target expansion for Toggle.
4. Correct Tooltip id/ARIA wiring and PageHeader breadcrumb list semantics.
5. Normalize disabled-link behavior in Button anchor mode.
