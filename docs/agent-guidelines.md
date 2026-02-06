# Agent Guidelines for Driver Operations Platform

Development patterns and conventions for the Driver Operations Platform.

Deep-dive index: `documentation/agent-guidelines/index.md`.

---

## Project Organization

```
src/
├── routes/
│   ├── (auth)/              # Auth pages (sign-in/sign-up/reset)
│   ├── (app)/               # Shared authenticated pages (e.g., settings)
│   ├── (driver)/            # Driver-only pages (dashboard/schedule/bids)
│   ├── (manager)/           # Manager-only pages (warehouses/routes/admin)
│   └── api/                 # JSON endpoints (auth handled in hooks)
│       ├── assignments/     # Assignment endpoints
│       ├── bids/            # Bidding endpoints
│       ├── routes/          # Route CRUD
│       ├── warehouses/      # Warehouse CRUD
│       └── users/           # User management (FCM token)
├── lib/
│   ├── components/
│   │   ├── primitives/      # Button, Input, Modal, etc.
│   │   ├── data-table/      # TanStack table system
│   │   └── icons/           # SVG icon components
│   ├── stores/              # Svelte 5 state stores
│   ├── schemas/             # Zod schemas (source of truth for types)
│   ├── server/
│   │   ├── db/              # Drizzle schema & client
│   │   ├── auth.ts          # Better Auth config
│   │   ├── logger.ts        # Pino logger instance
│   │   └── services/        # Business logic (scheduling.ts)
│   └── utils/               # Framework-agnostic helpers
├── hooks.server.ts          # Auth guards
└── app.css                  # Design tokens
```

**Rules:**

- Flat component directories; NO barrel exports
- Import directly from owning module
- Use `lib/utils/` for non-UI logic only
- Co-locate related files

---

## Business Logic Services

Server-side business logic lives in `src/lib/server/services/`. Each service encapsulates a specific domain operation.

### Available Services

#### `scheduling.ts`

Schedule generation algorithm for automatic driver-to-route assignment.

**Key Functions:**

- `generateWeekSchedule(targetWeekStart: Date)` - Generates schedule for a target week using locked preferences
- `getDriverWeeklyAssignmentCount(userId: string, weekStart: Date)` - Gets count of non-cancelled assignments for a driver
- `canDriverTakeAssignment(userId: string, weekStart: Date)` - Checks if driver is under weekly cap and not flagged

**Usage:**

```typescript
import { generateWeekSchedule } from '$lib/server/services/scheduling';

// In cron job or API endpoint
const result = await generateWeekSchedule(mondayDate);
console.log(`Created: ${result.created}, Unfilled: ${result.unfilled}`);
```

#### `notifications.ts`

Push notification service using Firebase Cloud Messaging (FCM) for sending time-sensitive alerts to drivers.

**Key Functions:**

- `sendNotification(userId, type, options?)` - Send notification to a single user (creates in-app record + FCM push)
- `sendBulkNotifications(userIds, type, options?)` - Send same notification to multiple users with batching

**Notification Types:**

- `shift_reminder` - Morning of shift
- `bid_open` - Bid window opens
- `bid_won` / `bid_lost` - Bid results
- `shift_cancelled` - Assignment cancelled
- `warning` - Driver flagged
- `manual` - Manager message
- `schedule_locked` - Preferences locked
- `assignment_confirmed` - New shift assigned

**Usage:**

```typescript
import { sendNotification, sendBulkNotifications } from '$lib/server/services/notifications';

// Single notification
await sendNotification(userId, 'shift_reminder', {
	data: { shiftId: '123', routeName: 'Route A' }
});

// Custom message
await sendNotification(userId, 'manual', {
	customTitle: 'Schedule Change',
	customBody: 'Your route has been updated for tomorrow.'
});

// Bulk notification to eligible drivers
const driverIds = ['id1', 'id2', 'id3'];
await sendBulkNotifications(driverIds, 'bid_open', {
	data: { bidId: '456', routeName: 'Route B' }
});
```

**Behavior:**

- Always creates in-app notification record in database
- Sends FCM push if user has registered token
- Gracefully handles missing FCM credentials or invalid tokens
- Returns `{ inAppCreated, pushSent, pushError? }` for observability

**Implementation Details:**

- Idempotent: Checks for existing assignments before creating new ones
- Time zone aware: All operations use Toronto/Eastern time
- Scoring: Routes familiarity → completion rate → attendance rate
- Creates `unfilled` assignments when no eligible driver found

#### `bidding.ts`

Bid window management for unfilled assignments. See `docs/adr/002-replacement-bidding-system.md` for full rationale.

**Key Functions:**

- `createBidWindow(assignmentId: string)` - Opens bid window for unfilled assignment (30 min or until shift start)
- `resolveBidWindow(windowId: string)` - Closes window, scores bids, assigns winner
- `getEligibleDriversForBid(assignmentId: string)` - Returns drivers eligible to bid (under weekly cap, not flagged)

**Usage:**

```typescript
import { createBidWindow, resolveBidWindow } from '$lib/server/services/bidding';

// Open bid window for unfilled assignment
const result = await createBidWindow(assignmentId);
if (result.success) {
	console.log(`Bid window opened, notified ${result.notifiedCount} drivers`);
}

// Close and resolve window (typically via cron)
const resolved = await resolveBidWindow(windowId);
if (resolved.winnerId) {
	console.log(`Bid awarded to driver ${resolved.winnerId}`);
}
```

**Behavior:**

- Automatically notifies eligible drivers when window opens
- Window closes after 30 minutes OR at shift start time (whichever comes first)
- Scores bids using: completion rate (40%), route familiarity (30%), attendance (20%), preference bonus (10%)
- Assignment remains unfilled if no bids received

#### `flagging.ts`

Driver performance flagging based on attendance thresholds.

**Key Functions:**

- `checkDriverForFlagging(userId: string)` - Evaluates driver metrics, applies flag if below threshold
- Thresholds: <80% before 10 shifts, <70% after 10 shifts
- 1-week grace period to improve before weekly cap reduction

**Usage:**

```typescript
import { checkDriverForFlagging } from '$lib/server/services/flagging';

// Run after metrics recalculation
await checkDriverForFlagging(driverId);
```

#### `metrics.ts`

Driver performance metrics calculation (denormalized for query performance).

**Key Functions:**

- `recalculateDriverMetrics(userId: string)` - Recomputes attendance rate, completion rate, shift counts
- Should be called after shift completion or cancellation

**Usage:**

```typescript
import { recalculateDriverMetrics } from '$lib/server/services/metrics';

// After shift completion
await recalculateDriverMetrics(driverId);
```

#### `managers.ts`

Manager access control helpers for warehouse scoping.

**Key Functions:**

- `getManagerWarehouseIds(userId: string)` - Returns array of warehouse IDs manager can access
- `canManagerAccessWarehouse(userId: string, warehouseId: string)` - Permission check for warehouse operations
- `getRouteManager(routeId: string)` - Returns primary manager ID for a route (if assigned)

**Usage:**

```typescript
import { canManagerAccessWarehouse, getManagerWarehouseIds } from '$lib/server/services/managers';

// Check permission before route/warehouse operation
const canAccess = await canManagerAccessWarehouse(managerId, warehouseId);
if (!canAccess) {
	throw error(403, 'Access denied');
}

// Scope query to manager's warehouses
const warehouseIds = await getManagerWarehouseIds(managerId);
const routes = await db.select().from(routes).where(inArray(routes.warehouseId, warehouseIds));
```

**Data Model:**

- Managers ↔ Warehouses: many-to-many via `warehouseManagers` junction table
- Routes → Manager: optional one-to-many via `routes.managerId` (primary manager for a route)

---

## Component Patterns

### Golden Rules

1. **Primitives over native HTML**: Never use raw `<input>`, `<button>`, `<select>`
   - Use `InlineEditor`, `Button`, `Select`, `Combobox` from primitives

2. **Fill footers**: Modal footers with two buttons use `fill={true}` on both

3. **Semantic colors**: Use `app.css` tokens by intent, not visual look
   - `--surface-*` for backgrounds
   - `--interactive-*` for clickable elements
   - `--status-*` for error/success/warning
   - `--text-*` for typography

### Page Structure

```svelte
<div class="page-surface">
	<div class="page-stage">
		<div class="page-layout">
			<aside class="page-card page-sidebar">
				<!-- Sidebar content -->
			</aside>
			<main class="page-content">
				<div class="page-card">
					<!-- Main content -->
				</div>
			</main>
		</div>
	</div>
</div>
```

---

## Schema-First Types

**CRITICAL**: All shared/persisted types come from Zod schemas.

```typescript
// src/lib/schemas/user.ts
import { z } from 'zod';

export const userSchema = z.object({
	id: z.string().uuid(),
	email: z.string().email(),
	role: z.enum(['driver', 'manager']),
	weeklyCap: z.number().int().min(1).max(6).default(4)
});

export type User = z.infer<typeof userSchema>;
```

**Never** define standalone TypeScript interfaces for domain objects.

---

## API Endpoint Pattern

```typescript
// src/routes/api/assignments/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	// 1. Auth check (fail fast)
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// 2. Parse query params
	const date = url.searchParams.get('date');

	try {
		// 3. Fetch data via service
		const assignments = await assignmentService.getByDate(date);

		// 4. Return JSON
		return json({ assignments });
	} catch (e) {
		console.error('[GET /api/assignments] Error:', e);
		throw error(500, 'Internal server error');
	}
};
```

**Status codes:**

- `400` - Invalid input
- `401` - Not authenticated
- `403` - Not authorized
- `404` - Not found
- `500` - Server error

### Available API Endpoints

#### `GET /api/dashboard`

Get driver dashboard overview data.

**Response:**

```typescript
{
	todayShift: DashboardAssignment | null;
	thisWeek: { weekStart: string; assignedDays: number; assignments: DashboardAssignment[] };
	nextWeek: { weekStart: string; assignedDays: number; assignments: DashboardAssignment[] };
	metrics: { totalShifts: number; completedShifts: number; attendanceRate: number; completionRate: number };
	pendingBids: PendingBid[];
	isNewDriver: boolean;
}
```

**Auth:** Required (driver role only)

#### `GET /api/metrics`

Get driver performance metrics (cached separately for offline use).

**Response:**

```typescript
{
	metrics: {
		totalShifts: number;
		completedShifts: number;
		attendanceRate: number;
		completionRate: number;
	};
}
```

**Auth:** Required (driver role only)

#### `POST /api/users/fcm-token`

Register or update user's FCM token for push notifications.

**Request:**

```typescript
{
	token: string;
}
```

**Response:**

```typescript
{
	success: true;
}
```

**Auth:** Required

#### `DELETE /api/users/fcm-token`

Remove user's FCM token (e.g., on logout or app uninstall).

**Response:**

```typescript
{
	success: true;
}
```

**Auth:** Required

---

## State Management (Smart Store Pattern)

```typescript
// src/lib/stores/scheduleStore.svelte.ts
const scheduleState = $state({
	// Data
	assignments: [] as Assignment[],
	selectedDate: new Date(),

	// UI
	isLoading: false,
	view: 'week' as 'week' | 'day'
});

export const scheduleStore = {
	get assignments() {
		return scheduleState.assignments;
	},
	get isLoading() {
		return scheduleState.isLoading;
	},

	async loadAssignments(userId: string, date: Date) {
		scheduleState.isLoading = true;
		try {
			const res = await fetch(`/api/assignments?date=${date.toISOString()}`);
			scheduleState.assignments = await res.json();
		} finally {
			scheduleState.isLoading = false;
		}
	}
};
```

**Rules:**

- Single `$state` object per store
- Components only call store methods, never mutate directly
- All API calls owned by store

### Connectivity Guards

All write operations MUST use `ensureOnlineForWrite()` before mutating server state.

```typescript
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';

export const scheduleStore = {
	async cancel(assignmentId: string, reason: CancelReason) {
		// Guard: prevent write when offline
		if (!ensureOnlineForWrite()) {
			return false; // Toast shown automatically
		}

		state.isCancelling = true;

		try {
			const res = await fetch(`/api/assignments/${assignmentId}/cancel`, {
				method: 'PATCH',
				body: JSON.stringify({ reason })
			});

			if (!res.ok) throw new Error('Failed to cancel');

			// Update local state
			state.assignments = state.assignments.map((a) =>
				a.id === assignmentId ? { ...a, status: 'cancelled' } : a
			);

			toastStore.success('Assignment cancelled');
			return true;
		} catch (err) {
			toastStore.error('Failed to cancel assignment');
			return false;
		} finally {
			state.isCancelling = false;
		}
	}
};
```

**When to use:**
- POST/PATCH/DELETE operations
- Any state mutation that requires server persistence
- Before optimistic updates that depend on server state

**Do NOT use for:**
- Read operations (GET requests) - these are cached offline
- Local-only state changes (UI toggles, form state)

---

## Error Handling

### API/Server Errors → Toast

```typescript
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';

try {
	await fetch('/api/...');
} catch (err) {
	toastStore.error('Failed to save', err.message);
}
```

### Form Validation → Inline

```svelte
<InlineEditor value={email} errors={emailErrors} />
```

```typescript
const result = schema.safeParse(data);
if (!result.success) {
	emailErrors = result.error.flatten().fieldErrors.email ?? [];
}
```

---

## Svelte 5 Patterns

```svelte
<script lang="ts">
	// Local state
	let count = $state(0);

	// Computed
	let doubled = $derived(count * 2);

	// Side effects
	$effect(() => {
		console.log('Count changed:', count);
	});
</script>
```

**Rules:**

- Use `$state` for local component state
- Use `$derived` for computed values
- Use `$effect` for side effects
- Shared state belongs in stores

---

## Auth Guards (hooks.server.ts)

```typescript
const publicPaths = new Set(['/', '/sign-in', '/sign-up']);
const publicPrefixes = ['/api/auth', '/_app', '/static'];

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Let Better Auth handle its routes
	if (pathname.startsWith('/api/auth')) {
		return resolve(event);
	}

	// Fetch session
	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	// Check if public
	const isPublic = publicPaths.has(pathname) || publicPrefixes.some((p) => pathname.startsWith(p));

	// Redirect unauthenticated users
	if (!session && !isPublic) {
		if (pathname.startsWith('/api')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		throw redirect(302, `/sign-in?redirect=${encodeURIComponent(pathname)}`);
	}

	return resolve(event);
};
```

---

## Testing Standards

Current state:

- Vitest is the standardized unit/integration test runner (`pnpm test`).
- `@playwright/test` is installed for future E2E coverage.

If you add tests:

- Prefer Vitest for unit/integration tests.
- Use a single `tests/` folder.
- Naming: `{name}.test.ts`.

**Test:**

- Business logic and services
- Utility functions
- Store actions

**Don't test:**

- UI primitives
- Presentational components
- Third-party library behavior

**No `any` types in tests** - use `unknown` with type guards.

---

## Git Workflow

```bash
# Feature branch
git checkout -b feature/my-feature

# Commit (conventional)
git commit -m "feat(assignments): add bidding system"

# Push
git push -u origin HEAD
```

**Commit types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

---

---

## TanStack Table (Svelte 5 Adapter)

We use TanStack Table v8 with a custom Svelte 5 adapter (`createSvelteTable.svelte.ts`).

### Critical Reactivity Rules

**Rule 1: Never read state from memoized objects**

```svelte
<!-- BAD: Reads from memoized object -->
{@const isExpanded = row.getIsExpanded()}

<!-- GOOD: Derive from table.getState() -->
const expandedState = $derived.by(() => {
  table.track?.();
  return table.getState().expanded;
});
{@const isExpanded = expandedState[row.id] ?? false}
```

**Rule 2: Include state in each block keys**

```svelte
<!-- BAD: Key doesn't change when state changes -->
{#each rows as row (row.id)}

<!-- GOOD: Key includes state -->
{#each rows as row (`${row.id}-${expandedState[row.id]}`)}
```

**Rule 3: Always call track() in derivations**

```typescript
// GOOD: Subscribes to table updates
const rows = $derived.by(() => {
	table.track?.();
	return table.getRowModel().rows;
});
```

### Creating a Table

```svelte
<script lang="ts">
	import { createSvelteTable, createColumnHelper } from '$lib/components/data-table';

	let data = $state([]);

	const table = createSvelteTable(() => ({
		data,
		columns,
		getCoreRowModel: getCoreRowModel()
	}));
</script>
```

### Column Definitions

```typescript
const helper = createColumnHelper<Driver>();

export const columns = [
	helper.text('name', { header: 'Name', sortable: true }),
	helper.accessor('metrics', (d) => d.metrics.completionRate, {
		header: 'Completion %',
		sortable: true
	}),
	helper.display({ id: 'actions', header: '' })
];
```

### When to Use Wrapper vs Direct

| Scenario                                           | Pattern                      |
| -------------------------------------------------- | ---------------------------- |
| Flat data, simple columns, < 300 lines             | Direct `<DataTable>` in page |
| Tree/hierarchical, multiple row types, > 500 lines | Wrapper component            |

---

## Optimistic UI Pattern

**CRITICAL**: All UI interactions with data mutation MUST use optimistic updates. Never wait for server response before updating UI.

### Pattern

```typescript
// 1. UI-Facing Action (no await)
function addItemOptimistically() {
	const tempId = `optimistic-${crypto.randomUUID()}`;
	const newItem = { id: tempId, name: 'New Item' };

	// Immediately update local state
	state.items = [...state.items, newItem];

	// Trigger background DB operation (don't await)
	createItemInDb(newItem);
}

// 2. Background DB Action
async function createItemInDb(tempItem: Item) {
	try {
		const response = await fetch('/api/items', {
			method: 'POST',
			body: JSON.stringify(tempItem)
		});
		const realItem = await response.json();

		// Replace temp item with real one
		state.items = state.items.map((item) => (item.id === tempItem.id ? realItem : item));
	} catch (error) {
		// Revert on failure
		state.items = state.items.filter((item) => item.id !== tempItem.id);
		toastStore.error('Failed to create item');
	}
}
```

### Checklist

- [ ] UI updates instantly (no `await` in UI-facing action)
- [ ] State reverted on failure
- [ ] API returns full object with real ID
- [ ] Timestamps match for ordering consistency

---

## Schema-First Types (Extended)

### Organization

```
src/lib/schemas/
├── user.ts         # User, Driver, Manager types
├── assignment.ts   # Assignment, Shift types
├── bid.ts          # Bid, BidWindow types
├── route.ts        # Route, Warehouse types
└── api/            # API-specific request/response schemas
    ├── assignments.ts
    └── bids.ts
```

### PATCH Schemas (No Defaults)

```typescript
// For partial updates - NO .default()
export const userUpdateSchema = z
	.object({
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1).optional(),
		phone: z.string().optional(),
		weeklyCap: z.number().int().min(1).max(6).optional()
	})
	.strict();

export type UserUpdate = z.infer<typeof userUpdateSchema>;
```

### Validation & Error Mapping

```typescript
// Server-side
const result = userSchema.safeParse(data);
if (!result.success) {
	const errors = toFieldErrors(result.error);
	return fail(400, { errors });
}

// Client-side
let emailErrors = $state<string[]>([]);

const result = schema.safeParse({ email });
if (!result.success) {
	emailErrors = result.error.flatten().fieldErrors.email ?? [];
}
```

### Forbidden Patterns

```typescript
// FORBIDDEN: Direct interface for domain objects
interface User {
	id: string;
	role: 'driver' | 'manager';
}

// FORBIDDEN: Direct type alias
type UserRole = 'driver' | 'manager';
```

---

## Quick Reference

| Need                 | Pattern                            |
| -------------------- | ---------------------------------- |
| Define types         | Zod schema in `lib/schemas/`       |
| Manage state         | Smart Store in `lib/stores/`       |
| Create input         | `InlineEditor` primitive           |
| Build API            | Endpoint template in `routes/api/` |
| Handle form errors   | Inline display via component       |
| Handle server errors | Toast notification                 |
| Protect routes       | `hooks.server.ts` guards           |
| Data tables          | TanStack + `createSvelteTable`     |
| Mutations            | Optimistic update pattern          |

---

## Assets

**Logo**: Placeholder needed (`static/logo.png`). Will be replaced with actual logo.
