# Drive Design System (Agent UI Guide)

Purpose: precise rules for native-feeling UI. Use `src/app.css` tokens; do not invent new ones.
Scope: UI/UX only. Favor reuse of shared primitives over new components.

## 1) Golden Rules

- Prefer existing components over raw HTML when an equivalent exists.
- Avoid raw `<input>`, `<button>`, and `<select>` in feature code; use `InlineEditor`, `Button`, `IconButton`, `Select`, `Combobox`, `Checkbox`, `Toggle`.
- Modal footers with two primary actions should use `fill={true}` on both buttons (50/50 split).
- Wrap SVGs in `Icon` (18px) or `IconButton` (24px). Do not manually size child SVGs.
- Choose colors by intent (Surface vs Interactive vs Status) using `src/app.css` tokens.

## 2) Component Hierarchy

Primitives live in `src/lib/components/primitives/`.

Common higher-level inputs live in `src/lib/components/`:

- `InlineEditor` (text inputs)
- `Select`, `Combobox`, `DatePicker`

## 3) Page Structure (from `src/app.css`)

```
.page-surface (root)
  └─ .page-stage (padded canvas, --surface-inset)
       └─ .page-layout (desktop) OR .page-stack (mobile)
            ├─ .page-card.page-sidebar (320px sidebar)
            └─ .page-content (scrollable, centers children)
                 └─ .page-card (content container)
```

- **Modifiers**: `.wide` (no max-width), `.transparent` (remove card styling).
- **Mobile Padding**: Standard mobile layout uses `var(--spacing-3)` gutters all around. Tables are the only exception and should be full-bleed (`padding: 0`) to preserve horizontal scan-space on small screens.

## 4) Canonical Examples

### CRUD Modal (The "Standard")

- **Reference**: `src/routes/(manager)/warehouses/+page.svelte` (create/edit modals)
- **Reference**: `src/routes/(manager)/routes/+page.svelte` (create/edit modals)
- **Pattern**: `Modal` → `<form class="modal-form">` → `.form-field` (label + `InlineEditor`) → `.modal-actions` (2x `Button[fill]`).

### Detail Surface (The "Deep Form")

- **Reference**: `src/routes/(app)/settings/+page.svelte`
- **Pattern**: `.page-surface` → `.page-stage` → `.page-card` content with grouped rows.

### Mobile-Optimized Page (full-bleed tables)

- **Reference**: `src/routes/(manager)/warehouses/+page.svelte`
- **Reference**: `src/lib/components/data-table/DataTable.svelte`
- **Pattern**: `.page-surface` → `.page-stage` (mobile padding) → tables can be full-bleed on mobile.

## 5) Color Token Quick-Map

| Intent      | Root Token(s)                                   | Context                               |
| :---------- | :---------------------------------------------- | :------------------------------------ |
| Canvas      | `--surface-inset`                               | Main page background                  |
| Card        | `--surface-primary`                             | Elevated panels, modals               |
| Interactive | `--interactive-normal`                          | Resting button/row state              |
| Hover       | `--interactive-hover`                           | Hover states                          |
| Accent      | `--interactive-accent`                          | Primary CTA, links, focus             |
| Status      | `--status-[type]`                               | error, success, warning, info         |
| Text        | `--text-normal`, `--text-muted`, `--text-faint` | Hierarchy: body > label > placeholder |
| Form        | `--form-background`                             | Recessed input background             |

See `src/app.css` for full token definitions.
