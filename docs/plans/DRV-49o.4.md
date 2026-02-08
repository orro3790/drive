# DRV-49o.4: Primitive, Token, and i18n Remediation in Driver Nav Scope

## Summary

Replace raw numeric inputs with the `InlineEditor` primitive, fix phantom/non-canonical CSS tokens, and normalize breakpoints across driver-facing pages. i18n is already complete (all strings use Paraglide).

## Scope

Files in scope:
- `src/routes/(driver)/dashboard/+page.svelte`
- `src/routes/(driver)/schedule/+page.svelte`
- `src/routes/(driver)/bids/+page.svelte`
- `src/routes/(app)/notifications/+page.svelte`
- `src/lib/components/InlineEditor.svelte` (extend)

## Changes

### 1. Extend InlineEditor to support numeric input attributes

Add `min`, `max`, and `hasError` props to InlineEditor so it can replace raw `<input type="number">` elements.

**InlineEditor.svelte** additions:
- `min?: string | number` — passed through to `<input>`
- `max?: string | number` — passed through to `<input>`
- `hasError?: boolean` — adds `.has-error` class to the row container
- `.ie-row.has-error` style: `border-color: var(--status-error)`

### 2. Replace raw `<input type="number">` with InlineEditor

**Dashboard** (4 instances):
- `parcels-start` (line ~447): InlineEditor with inputType="number", min="1", max="999"
- `parcels-returned` (line ~507): InlineEditor with inputType="number", min="0", max dynamic
- `edit-parcels-start` (line ~569): InlineEditor with inputType="number", min="1", max="999"
- `edit-parcels-returned` (line ~584): InlineEditor with inputType="number", min="0", max dynamic

**Schedule** (2 instances):
- `parcels-start` modal (line ~431): InlineEditor with inputType="number"
- `parcels-returned` modal (line ~470): InlineEditor with inputType="number"

InlineEditor uses `value: string` (not `bind:value`), so convert from bind:value to onInput callback pattern. Use `inputmode="numeric"` for mobile keyboard.

### 3. Fix phantom CSS tokens (don't exist in app.css)

Replace across all 4 files:
- `var(--font-weight-semibold)` → `var(--font-weight-medium)` (the design system's 500 weight)
- `var(--accent-primary)` → `var(--interactive-accent)`
- `var(--shadow-sm)` → `var(--shadow-base)`

### 4. Fix non-canonical CSS values

**Transitions** (dashboard + schedule `.number-input`):
- `transition: border-color 0.15s ease` → removed (InlineEditor handles its own transitions)

**Breakpoints** (dashboard, schedule, bids):
- `@media (max-width: 600px)` → `@media (max-width: 767px)` (documented mobile breakpoint)

**Notifications**:
- `letter-spacing: 0.05em` → `letter-spacing: var(--letter-spacing-sm)` (0.02rem)
- `min-height: 200px` → keep (loading skeleton size, not a spacing token concern)
- `@media (max-width: 480px)` → `@media (max-width: 767px)` and merge with 768px block

### 5. Remove dead `.number-input` CSS rules

After replacing raw inputs with InlineEditor, delete the `.number-input` class and related styles from dashboard and schedule.

## Out of Scope

- `src/routes/(app)/settings/+page.svelte` — manager page, not driver nav
- Creating new design tokens (e.g., `--max-width-content`) — over-engineering for 3 usages
- `opacity: 0.7` on `.cancelled`/`.resolved` cards — semantically correct inline values
- `max-width: 720px` — common value but not worth tokenizing for 4 usages
- Icon `width: 16px; height: 16px` in bids — `:global(svg)` sizing for Lightning icon, acceptable

## Verification

- `pnpm check` passes (type safety)
- Visual: InlineEditor renders identically to old raw inputs (same sizing, border, focus state)
