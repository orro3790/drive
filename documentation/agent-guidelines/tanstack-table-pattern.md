# TanStack Table (Svelte 5) Guidelines

This project uses **TanStack Table v8** (Headless UI) with a custom **Svelte 5 adapter**.

> **Context:** The official `@tanstack/svelte-table` adapter (as of Dec 2025) relies on Svelte 4 stores. To leverage Svelte 5's fine-grained reactivity (Runes) and avoid store-subscription overhead, we implemented a custom adapter (`createSvelteTable.svelte.ts`).

---

## 1. Architecture: The Reactivity Bridge

### Problem

TanStack Table is vanilla JS designed for React's re-render model. It uses heavy memoization - objects like `row`, `header`, `column` are **the same references** even when their internal state changes. Svelte 5's `{#each}` with keyed iteration only re-renders when the key OR object reference changes.

This creates a mismatch:

- Calling `row.getIsExpanded()` inside `{@const}` captures the value ONCE at render time
- Since the row reference never changes, Svelte doesn't re-render when expanded state changes
- The UI appears "stuck" even though TanStack's internal state updated correctly

### Solution (`createSvelteTable.svelte.ts`)

We wrap the vanilla `createTable` with a lightweight reactivity bridge:

1. **Internal State Tracking:** A `$state(tableState)` holds all table state (expanded, selection, columnVisibility, sorting, etc.)
2. **Version Signaling:** A `$state(version)` signal increments whenever state changes
3. **`table.track()`:** A method that reads `version`, allowing consumers to subscribe to changes
4. **Bi-directional Sync:** An `$effect` syncs BOTH external options AND internal state changes back to TanStack

**Performance:** This bridge is zero-cost for data operations. It adds only a single integer signal to track updates, preserving TanStack's ability to handle 10k+ rows efficiently.

---

## 2. Critical Reactivity Rules (MUST FOLLOW)

### Rule 1: Never Read State from Memoized Objects

TanStack's `row`, `header`, `column` objects are memoized. Their methods return stale data after state changes.

```svelte
<!-- ❌ BAD: Reads from memoized object -->
{@const isExpanded = row.getIsExpanded()}
{@const isVisible = column.getIsVisible()}

<!-- ✅ GOOD: Derive from table.getState() -->
const expandedState = $derived.by(() => {
  table.track?.();
  return table.getState().expanded as Record<string, boolean>;
});
// Then in template:
{@const isExpanded = expandedState[row.id] ?? false}
```

### Rule 2: Include State in Each Block Keys

Svelte's keyed `{#each}` only re-renders when keys change. Include relevant state:

```svelte
<!-- ❌ BAD: Key doesn't change when state changes -->
{#each rows as row (row.id)}

<!-- ✅ GOOD: Key includes state that affects this row -->
{#each rows as row (`${row.id}-${expandedState[row.id]}-${selectionState[row.id]}`)}
```

### Rule 3: Always Call track() in Derivations

```typescript
// ✅ GOOD: Subscribes to table updates
const rows = $derived.by(() => {
	table.track?.();
	return table.getRowModel().rows;
});

// ❌ BAD: Won't update when table state changes
const rows = $derived(table.getRowModel().rows);
```

### State Types and Their Derived Patterns

| State Type        | Derive From                         | Include in Key      |
| ----------------- | ----------------------------------- | ------------------- |
| Expanded          | `table.getState().expanded`         | Row keys            |
| Selection         | `table.getState().rowSelection`     | Row keys            |
| Column Visibility | `table.getState().columnVisibility` | Row AND header keys |
| Sorting           | `table.getState().sorting`          | Header keys         |

---

## 3. Usage Patterns

### Creating a Table

Use the `createSvelteTable` helper, passing options as a function (so it can track reactive dependencies like data).

```svelte
<script lang="ts">
	import { createSvelteTable, createColumnHelper } from '$lib/components/data-table';

	let data = $state([]); // Reactive source (your data here)

	const table = createSvelteTable(() => ({
		data,
		columns,
		getCoreRowModel: getCoreRowModel()
		// ...features
	}));
</script>
```

### Defining Columns

Use `createColumnHelper<T>()` for type safety. **Always** use the helper methods; do not write raw column objects.

```typescript
const helper = createColumnHelper<User>();

export const columns = [
	// Simple fields (2 args)
	helper.text('name', { header: 'Name', sortable: true }),

	// Computed/nested fields (3 args)
	helper.accessor('role', (user) => user.roles[0], {
		header: 'Role',
		sortable: false
	}),

	// Display only
	helper.display({ id: 'actions', header: '' })
];
```

### Consuming Table State (Components)

If you build a custom table component, you **must** track state:

```svelte
<script>
	// CORRECT: Tracks state changes
	const rows = $derived.by(() => {
		table.track?.(); // Subscribe to updates
		return table.getRowModel().rows;
	});
</script>
```

---

## 4. Component Architecture: Wrapper vs Direct

When building a table, choose between two patterns based on complexity.

### Pattern A: Direct DataTable (Simple Tables)

Use `<DataTable>` directly in the page when the table is structurally simple:

```svelte
<!-- src/routes/(manager)/warehouses/+page.svelte -->
<script>
	const table = createSvelteTable(() => ({ data, columns }));
</script>

<DataTable {table} tabs={tabsSnippet} toolbar={toolbarSnippet} />
```

**When to use:**

- Flat data (no hierarchy/expansion)
- Single row type
- Standard cells (text, dates, numbers, chips)
- Table is single-use (not reused across pages)
- Column definitions + cells < 300 lines

### Pattern B: Wrapper Component (Complex Tables)

Encapsulate in a domain-specific component when the table has significant complexity:

```svelte
<!-- src/lib/components/<feature>/<FeatureTable>.svelte -->
<script>
	// All column definitions, custom row types, cell rendering, state management
	const table = createSvelteTable(() => ({ data, columns }));
</script>

<DataTable {table} {tabs} {toolbar} />
```

```svelte
<!-- src/routes/(manager)/<feature>/+page.svelte -->
<FeatureTable items={data} tabs={tabsSnippet} toolbar={toolbarSnippet} onRowClick={handleClick} />
```

**When to use:**

- Tree/hierarchical data (expandable rows with children)
- Multiple row types (e.g., `route`, `assignment`, `summary-row`)
- Complex domain cells (status chips, badges, action menus)
- Dual selection models (select parent vs child items)
- Table code would exceed 500 lines in the page
- Table is reused across multiple pages

### Decision Guide

```
┌─────────────────────────────────────────────────┐
│ Does the table have expandable/hierarchical rows? │
└─────────────────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
         Yes                      No
          │                       │
          ▼                       ▼
   Wrapper Component    ┌─────────────────────────┐
                        │ Multiple row types OR    │
                        │ complex domain cells?    │
                        └─────────────────────────┘
                                  │
                      ┌───────────┴───────────┐
                      ▼                       ▼
                     Yes                      No
                      │                       │
                      ▼                       ▼
               Wrapper Component       Direct DataTable
```

### Current Project Examples

| Page                    | Pattern | Rationale                       |
| ----------------------- | ------- | ------------------------------- |
| `(manager) /warehouses` | Direct  | Flat data, simple columns       |
| `(manager) /routes`     | Direct  | Flat data + joins, simple cells |

### Snippet Props for Composition

Both patterns accept `tabs`, `toolbar`, and `selection` snippets from the page, allowing the page to control chrome while the table handles data:

```svelte
<MaterialsTable tabs={tabsSnippet} toolbar={toolbarSnippet}>
```

This keeps UI composition in the page while encapsulating table internals in the component.

---

## 5. Common Pitfalls

1. **Missing Options:** `createColumnHelper` methods require an options object. Omitting it throws an error.
2. **Infinite Loops:** Do not call `table.setOptions` inside a reactive statement that depends on `table.getState()`. The adapter handles option syncing safely.
3. **Raw `accessor`:** Avoid using 2-arg `accessor(key, options)` (TanStack style) with our helper. Use `text()`/`number()` for simple keys, or 3-arg `accessor(id, fn, options)` for computed values.
4. **SSR Hydration Mismatch with Persisted State:** Never call `loadPersistedTableState()` at the top level of a component script. This causes SSR/client mismatch because the server returns `null` while the client returns stored values from localStorage.

**Correct pattern:**

```svelte
<script>
	// ✅ Initialize with defaults for SSR consistency
	let columnVisibility = $state<VisibilityState>({});
	let hasHydratedState = $state(false);

	// ✅ Load persisted state after hydration
	$effect(() => {
		if (hasHydratedState) return;
		const persisted = loadPersistedTableState(STORAGE_KEY);
		if (persisted) {
			columnVisibility = persisted.columnVisibility ?? {};
		}
		hasHydratedState = true;
	});
</script>
```

**Wrong pattern:**

```svelte
<script>
	// ❌ BAD: Causes hydration mismatch
	const persisted = loadPersistedTableState(STORAGE_KEY);
	let columnVisibility = $state(persisted?.columnVisibility ?? {});
</script>
```

---

## 6. Advanced Features

| Feature                     | Status      | Notes                                                 |
| --------------------------- | ----------- | ----------------------------------------------------- |
| Column Faceting + Filtering | ✅ Complete | `DataTableFilterPanel`, dropdown/range facets         |
| Column Resizing             | ✅ Complete | Drag + keyboard resize, min/max constraints           |
| Column Pinning              | ✅ Complete | Left/right sticky columns, context menu for pin/unpin |
| Footer (pagination/counts)  | ✅ Complete | Fixed-height footer with row counts + pagination      |
| Virtualization              | ✅ Complete | Custom spacer-row solution for large datasets         |

Implementation details live in `src/lib/components/data-table/`.

---

## 7. Footer & Pagination

The `DataTableFooter` component provides a fixed-height footer with:

- Row counts (showing X of Y rows)
- Pagination controls
- Selection info (via snippet)

```svelte
<DataTable {table} showPagination totalRows={unfilteredCount}>
	{#snippet footer()}
		<!-- Custom footer content -->
	{/snippet}
</DataTable>
```

The footer always renders when `hasData && !loading` to prevent layout shifts.

---

## 8. Pagination vs Virtualization Decision Guide

Use this flowchart when implementing large-data tables:

```
┌─────────────────────────────────────────┐
│ How many rows will the table display?   │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   < 500 rows              500+ rows
        │                       │
        ▼                       ▼
┌───────────────┐    ┌──────────────────────────┐
│ Pagination    │    │ Is bordered scrolling    │
│ (default)     │    │ required (no page breaks)?│
└───────────────┘    └──────────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
                 Yes                      No
                  │                       │
                  ▼                       ▼
        ┌─────────────────┐    ┌─────────────────┐
        │ Virtualization  │    │ Pagination      │
        │ virtualize={true}│   │ (50-100/page)   │
        └─────────────────┘    └─────────────────┘
```

### When to Use Each

| Approach                        | Best For                                                | Trade-offs                                              |
| ------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| **Pagination only**             | Most tables (< 500 rows), familiar UX, server-side data | Users must click through pages                          |
| **Virtualization only**         | Seamless scrolling through 1k+ rows, infinite scroll UX | Keyboard nav limited, scroll position lost on re-render |
| **Pagination + Virtualization** | Very large pages (500+ rows/page), hybrid approach      | More complexity, rarely needed                          |

### Current Project Convention

**Default to pagination** for all tables. Enable virtualization only when:

1. Users explicitly need bordered scrolling (e.g., log viewers, timeline feeds)
2. The table will consistently have 1000+ rows AND pagination feels disruptive

---

## 9. Virtualization (When Needed)

For tables with 500+ rows where bordered scrolling is required, enable virtualization:

```svelte
<DataTable {table} virtualize />
```

### Props

| Prop         | Type      | Default | Description                          |
| ------------ | --------- | ------- | ------------------------------------ |
| `virtualize` | `boolean` | `false` | Enable row virtualization            |
| `rowHeight`  | `number`  | `40`    | Fixed row height in pixels           |
| `overscan`   | `number`  | `5`     | Extra rows rendered outside viewport |

### How It Works

1. **Scroll tracking:** Passive scroll listener on the scroll container
2. **Visible window:** Calculate `startIndex` and `endIndex` based on scroll position
3. **Spacer rows:** Empty `<tr>` elements maintain total scroll height without rendering all rows
4. **Same API:** `DataTableVirtualBody` accepts the same props as `DataTableBody`

### Example with Custom Row Height

```svelte
<!-- For rows with thumbnails (56px each) -->
<DataTable {table} virtualize rowHeight={56} />

<!-- Aggressive overscan for smoother scrolling -->
<DataTable {table} virtualize overscan={10} />
```

### Expandable Rows

Virtualization works with expandable rows. When a row expands:

- Child rows are added to `table.getRowModel().rows`
- Each child is still a fixed-height row
- The virtualizer recalculates visible window automatically

### Implementation Details

See `src/lib/components/data-table/DataTableVirtualBody.svelte` for the implementation.

**Key files:**

- `DataTableVirtualBody.svelte` — Virtualized body component
- `DataTable.svelte` — Conditional rendering based on `virtualize` prop

---

## 10. Future Path

When TanStack releases an official Svelte 5 (Runes) adapter:

1. Delete `src/lib/components/data-table/createSvelteTable.svelte.ts`.
2. Update imports to `@tanstack/svelte-table`.
3. Remove `table.track()` calls.
4. Verify if `cells` snippet prop pattern needs adjustment (unlikely, as it's our UI layer).
