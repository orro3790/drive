# Driver Route History — API + Tabbed UI

**Beads:** DRV-744 (API), DRV-6y8 (UI)
**Branch:** `DRV-6y8/implementation`

## Context

Managers need to audit a driver's full shift history — parcel counts, exceptions, timestamps — from the `/drivers` page. Currently the detail panel shows aggregate metrics but no per-shift data. This feature adds a backend endpoint and a tabbed UI so managers can open multiple driver histories simultaneously.

## Step 1: Schema types (`src/lib/schemas/driverShiftHistory.ts`)

Create shared types for the API response:

```typescript
type DriverShiftRecord = {
	assignmentId: string;
	date: string; // YYYY-MM-DD
	routeName: string;
	warehouseName: string;
	status: 'completed' | 'cancelled';
	parcelsStart: number | null;
	parcelsDelivered: number | null;
	parcelsReturned: number | null;
	exceptedReturns: number | null;
	exceptionNotes: string | null;
	arrivedAt: string | null;
	startedAt: string | null;
	completedAt: string | null;
	cancelType: string | null;
};

type DriverShiftHistoryResponse = {
	driverName: string;
	shifts: DriverShiftRecord[];
};
```

## Step 2: API endpoint (`src/routes/api/drivers/[id]/shifts/+server.ts`)

`GET /api/drivers/[id]/shifts` — returns all completed + cancelled assignments with shift data.

- Auth: require manager role (follow pattern from `/api/drivers/[id]/health/+server.ts`)
- Verify target user exists and is a driver
- Query: `assignments` INNER JOIN `routes`, `warehouses`; LEFT JOIN `shifts`
- Filter: `userId = id` AND `status IN ('completed', 'cancelled')`
- Order: `date DESC`
- No server-side pagination (bounded by driver tenure, ~300 records/year max)

## Step 3: i18n messages (`messages/en.json`, `zh.json`, `zh-Hant.json`)

Add keys for:

- `drivers_view_route_history` — button label
- `drivers_shift_history_empty` / `drivers_shift_history_empty_message`
- `drivers_shift_history_load_error`
- Column headers: date, route, warehouse, status, parcels start/delivered/returned, exceptions, arrived, completed
- Status labels: completed, cancelled

## Step 4: DriverShiftHistoryTable component (`src/lib/components/DriverShiftHistoryTable.svelte`)

New component encapsulating the shift history DataTable:

- **Props:** `driverId`, `tabs` (snippet passthrough), `isWideMode`, `onWideModeChange`
- **Fetches** `/api/drivers/{driverId}/shifts` on mount
- **Columns:** Date, Route, Warehouse, Status (badge), Parcels Start, Delivered, Returned, Exceptions, Arrived At, Completed At
- **Features:** Client-side sorting (default: date desc), pagination (20/page), column resize, export
- **State key:** `driver-shifts-{driverId}` for column persistence
- Uses `createColumnHelper<DriverShiftRecord>()` pattern from existing tables
- Status cell uses `Chip` component (completed=success, cancelled=warning)

## Step 5: Drivers page tab system (`src/routes/(manager)/drivers/+page.svelte`)

### Tab state management (local state + localStorage)

```typescript
type DriverTab = { driverId: string; driverName: string };
let openDriverTabs = $state<DriverTab[]>([]);
let activeTabId = $state<string>('drivers');
```

- Persist to `localStorage` key `drivers-page-open-tabs`
- Load on mount, save via `$effect`

### Functions

- `openDriverTab(driver)` — add tab if not duplicate, set active, close detail panel
- `closeDriverTab(driverId, event)` — remove tab, switch to 'drivers' if closing active
- `switchToTab(tabId)` — set active, close detail panel if switching to history

### "View Route History" button

Add inside `driverDetailView` snippet (below HealthCard) and `mobileDetail` snippet:

```svelte
<Button variant="secondary" size="small" fill onclick={() => openDriverTab(driver)}>
	{m.drivers_view_route_history()}
</Button>
```

### Dynamic tab bar

Replace static `tabsSnippet` with dynamic version:

- "Drivers" tab always present (not closable)
- Dynamic driver tabs with name + close (x) button
- Use `<div role="tab">` for dynamic tabs (avoids nested button issue)
- Close button uses `&times;` character, `onclick|stopPropagation`

### Content switching in `tableContent`

```svelte
{#if activeTabId === 'drivers'}
	<DataTable ...existing config... />
{:else}
	{#each openDriverTabs as tab (tab.driverId)}
		{#if activeTabId === tab.driverId}
			<DriverShiftHistoryTable driverId={tab.driverId} tabs={tabsSnippet} ... />
		{/if}
	{/each}
{/if}
```

### PageWithDetailPanel adjustments

- Set `item` to null and `open` to false when history tab is active
- Keep single PageWithDetailPanel instance (history tabs don't need detail panel)

### CSS additions

- `.tab-label` — truncate long names (max-width 140px)
- `.tab-close` — 18px close button, transparent bg, hover highlight
- `.tab` already has `display: inline-flex` — add `gap` for label + close layout

## Critical files

| File                                                | Action                                 |
| --------------------------------------------------- | -------------------------------------- |
| `src/lib/schemas/driverShiftHistory.ts`             | Create                                 |
| `src/routes/api/drivers/[id]/shifts/+server.ts`     | Create                                 |
| `messages/en.json`                                  | Edit (add keys)                        |
| `messages/zh.json`                                  | Edit (add keys)                        |
| `messages/zh-Hant.json`                             | Edit (add keys)                        |
| `src/lib/components/DriverShiftHistoryTable.svelte` | Create                                 |
| `src/routes/(manager)/drivers/+page.svelte`         | Edit (tabs, button, content switching) |

## Verification

1. Log in as manager, navigate to `/drivers`
2. Click a driver row to open detail panel
3. Click "View Route History" — new tab appears, auto-selected
4. Shift history table loads with data (or empty state for new drivers)
5. Click "Drivers" tab to go back to driver list
6. Open multiple driver history tabs
7. Close tabs with x button
8. Refresh page — tabs persist
9. Verify cancelled assignments show with cancel type
