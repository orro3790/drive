# Utils Catalog

Consult this before introducing new utilities.

## src/lib/utils/

- `src/lib/utils/cn.ts`
  - Classname helper (wraps `clsx`).
- `src/lib/utils/errorDisplay.ts`
  - Shared error display helper for inputs that support `errors` (see `createErrorDisplay`).
- `src/lib/utils/index.ts`
  - Re-exports shared utilities.

## src/lib/utils/date/

- `src/lib/utils/date/formatting.ts`
  - `formatUiDate`, `formatUiDateTime`.
- `src/lib/utils/date/firestore.ts`
  - `parseLocalYMD` (name is historical; it parses local `YYYY-MM-DD` safely).

## Adding a New Utility

- Prefer adding only when the logic is reused across multiple features.
- Keep utilities framework-agnostic (no Svelte stores/components).
- Update this catalog when you add something.
