# Data Model: Driver Operations Platform

## Overview

PostgreSQL database hosted on Neon, accessed via Drizzle ORM. All timestamps in Toronto/Eastern timezone.

---

## Drizzle Schema

```typescript
// src/lib/server/db/schema.ts

import {
	pgTable,
	uuid,
	text,
	timestamp,
	boolean,
	integer,
	pgEnum,
	jsonb,
	date,
	real,
	primaryKey
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['driver', 'manager']);
export const assignmentStatusEnum = pgEnum('assignment_status', [
	'scheduled',
	'active',
	'completed',
	'cancelled',
	'unfilled'
]);
export const assignedByEnum = pgEnum('assigned_by', ['algorithm', 'manager', 'bid']);
export const bidStatusEnum = pgEnum('bid_status', ['pending', 'won', 'lost']);
export const bidWindowStatusEnum = pgEnum('bid_window_status', ['open', 'closed', 'resolved']);
export const cancelReasonEnum = pgEnum('cancel_reason', [
	'vehicle_breakdown',
	'medical_emergency',
	'family_emergency',
	'traffic_accident',
	'weather_conditions',
	'personal_emergency',
	'other'
]);
export const bidWindowModeEnum = pgEnum('bid_window_mode', ['competitive', 'instant', 'emergency']);
export const notificationTypeEnum = pgEnum('notification_type', [
	'shift_reminder',
	'bid_open',
	'bid_won',
	'bid_lost',
	'shift_cancelled',
	'warning',
	'manual',
	'schedule_locked',
	'assignment_confirmed',
	'route_unfilled',
	'route_cancelled',
	'driver_no_show',
	'confirmation_reminder',
	'shift_auto_dropped',
	'emergency_route_available',
	'streak_advanced',
	'streak_reset',
	'bonus_eligible',
	'corrective_warning'
]);
export const actorTypeEnum = pgEnum('actor_type', ['user', 'system']);

// Users
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	firstName: text('first_name').notNull(),
	lastName: text('last_name').notNull(),
	phone: text('phone').notNull(),
	role: userRoleEnum('role').notNull().default('driver'),
	weeklyCap: integer('weekly_cap').notNull().default(4),
	isFlagged: boolean('is_flagged').notNull().default(false),
	flagWarningDate: timestamp('flag_warning_date', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Warehouses
export const warehouses = pgTable('warehouses', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	address: text('address').notNull(),
	createdBy: uuid('created_by').references(() => users.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Routes (one-to-one with warehouse)
export const routes = pgTable('routes', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	warehouseId: uuid('warehouse_id')
		.notNull()
		.references(() => warehouses.id),
	managerId: uuid('manager_id').references(() => users.id, { onDelete: 'set null' }),
	createdBy: uuid('created_by').references(() => users.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Warehouse Managers (many-to-many junction table)
export const warehouseManagers = pgTable(
	'warehouse_managers',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		warehouseId: uuid('warehouse_id')
			.notNull()
			.references(() => warehouses.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		uniqWarehouseUser: unique('uniq_warehouse_user').on(table.warehouseId, table.userId)
	})
);

// Driver Preferences
export const driverPreferences = pgTable('driver_preferences', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' })
		.unique(),
	preferredDays: integer('preferred_days').array().notNull().default([]), // 0-6, Sunday=0
	preferredRoutes: uuid('preferred_routes').array().notNull().default([]), // Top 3 route IDs
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	lockedAt: timestamp('locked_at', { withTimezone: true })
});

// Assignments
export const assignments = pgTable('assignments', {
	id: uuid('id').primaryKey().defaultRandom(),
	routeId: uuid('route_id')
		.notNull()
		.references(() => routes.id),
	userId: uuid('user_id').references(() => users.id), // null = unfilled
	warehouseId: uuid('warehouse_id')
		.notNull()
		.references(() => warehouses.id),
	date: date('date').notNull(),
	status: assignmentStatusEnum('status').notNull().default('scheduled'),
	assignedBy: assignedByEnum('assigned_by'),
	assignedAt: timestamp('assigned_at', { withTimezone: true }),
	confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Shifts (when assignment becomes active)
export const shifts = pgTable('shifts', {
	id: uuid('id').primaryKey().defaultRandom(),
	assignmentId: uuid('assignment_id')
		.notNull()
		.references(() => assignments.id, { onDelete: 'cascade' })
		.unique(),
	arrivedAt: timestamp('arrived_at', { withTimezone: true }),
	parcelsStart: integer('parcels_start'),
	parcelsDelivered: integer('parcels_delivered'),
	parcelsReturned: integer('parcels_returned'),
	startedAt: timestamp('started_at', { withTimezone: true }),
	completedAt: timestamp('completed_at', { withTimezone: true }),
	editableUntil: timestamp('editable_until', { withTimezone: true }),
	cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
	cancelReason: cancelReasonEnum('cancel_reason'),
	cancelNotes: text('cancel_notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Bids
export const bids = pgTable('bids', {
	id: uuid('id').primaryKey().defaultRandom(),
	assignmentId: uuid('assignment_id')
		.notNull()
		.references(() => assignments.id, { onDelete: 'cascade' }),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id),
	score: real('score'), // Calculated score
	status: bidStatusEnum('status').notNull().default('pending'),
	bidAt: timestamp('bid_at', { withTimezone: true }).notNull().defaultNow(),
	windowClosesAt: timestamp('window_closes_at', { withTimezone: true }).notNull(),
	resolvedAt: timestamp('resolved_at', { withTimezone: true })
});

// Bid Windows
export const bidWindows = pgTable('bid_windows', {
	id: uuid('id').primaryKey().defaultRandom(),
	assignmentId: uuid('assignment_id')
		.notNull()
		.references(() => assignments.id, { onDelete: 'cascade' }),
	mode: bidWindowModeEnum('mode').notNull().default('competitive'),
	trigger: text('trigger'),
	payBonusPercent: integer('pay_bonus_percent').notNull().default(0),
	opensAt: timestamp('opens_at', { withTimezone: true }).notNull().defaultNow(),
	closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
	status: bidWindowStatusEnum('status').notNull().default('open'),
	winnerId: uuid('winner_id').references(() => users.id)
});

// Driver Metrics (denormalized for performance)
export const driverMetrics = pgTable('driver_metrics', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	totalShifts: integer('total_shifts').notNull().default(0),
	completedShifts: integer('completed_shifts').notNull().default(0),
	attendanceRate: real('attendance_rate').notNull().default(0), // 0-1
	completionRate: real('completion_rate').notNull().default(0), // 0-1
	avgParcelsDelivered: real('avg_parcels_delivered').notNull().default(0),
	totalAssigned: integer('total_assigned').notNull().default(0),
	confirmedShifts: integer('confirmed_shifts').notNull().default(0),
	autoDroppedShifts: integer('auto_dropped_shifts').notNull().default(0),
	lateCancellations: integer('late_cancellations').notNull().default(0),
	noShows: integer('no_shows').notNull().default(0),
	bidPickups: integer('bid_pickups').notNull().default(0),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Route Completions (for familiarity tracking)
export const routeCompletions = pgTable(
	'route_completions',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		routeId: uuid('route_id')
			.notNull()
			.references(() => routes.id, { onDelete: 'cascade' }),
		completionCount: integer('completion_count').notNull().default(0),
		lastCompletedAt: timestamp('last_completed_at', { withTimezone: true })
	},
	(table) => ({
		pk: primaryKey({ columns: [table.userId, table.routeId] })
	})
);

// Notifications
export const notifications = pgTable('notifications', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	type: notificationTypeEnum('type').notNull(),
	title: text('title').notNull(),
	body: text('body').notNull(),
	data: jsonb('data'), // Additional payload
	read: boolean('read').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Audit Log
export const auditLogs = pgTable('audit_logs', {
	id: uuid('id').primaryKey().defaultRandom(),
	entityType: text('entity_type').notNull(), // 'assignment', 'user', 'route', etc.
	entityId: uuid('entity_id').notNull(),
	action: text('action').notNull(), // 'created', 'updated', 'assigned', etc.
	actorId: uuid('actor_id').references(() => users.id),
	actorType: actorTypeEnum('actor_type').notNull(),
	changes: jsonb('changes'), // { before: {...}, after: {...} }
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Driver Health Snapshots (daily score records)
export const driverHealthSnapshots = pgTable(
	'driver_health_snapshots',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		evaluatedAt: date('evaluated_at').notNull(),
		score: integer('score').notNull(),
		attendanceRate: real('attendance_rate').notNull(),
		completionRate: real('completion_rate').notNull(),
		lateCancellationCount30d: integer('late_cancellation_count_30d').notNull().default(0),
		noShowCount30d: integer('no_show_count_30d').notNull().default(0),
		hardStopTriggered: boolean('hard_stop_triggered').notNull().default(false),
		reasons: jsonb('reasons').$type<string[]>().notNull().default([]),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		uniqueUserDate: unique().on(table.userId, table.evaluatedAt)
	})
);

// Driver Health State (current state per driver)
export const driverHealthState = pgTable('driver_health_state', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	currentScore: integer('current_score').notNull().default(0),
	streakWeeks: integer('streak_weeks').notNull().default(0),
	stars: integer('stars').notNull().default(0),
	lastQualifiedWeekStart: date('last_qualified_week_start'),
	assignmentPoolEligible: boolean('assignment_pool_eligible').notNull().default(true),
	requiresManagerIntervention: boolean('requires_manager_intervention').notNull().default(false),
	nextMilestoneStars: integer('next_milestone_stars').notNull().default(1),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
	preferences: one(driverPreferences, {
		fields: [users.id],
		references: [driverPreferences.userId]
	}),
	metrics: one(driverMetrics, {
		fields: [users.id],
		references: [driverMetrics.userId]
	}),
	healthState: one(driverHealthState, {
		fields: [users.id],
		references: [driverHealthState.userId]
	}),
	assignments: many(assignments),
	bids: many(bids),
	notifications: many(notifications),
	routeCompletions: many(routeCompletions),
	healthSnapshots: many(driverHealthSnapshots),
	managedWarehouses: many(warehouseManagers)
}));

export const routesRelations = relations(routes, ({ one, many }) => ({
	warehouse: one(warehouses, {
		fields: [routes.warehouseId],
		references: [warehouses.id]
	}),
	manager: one(users, {
		fields: [routes.managerId],
		references: [users.id]
	}),
	assignments: many(assignments),
	completions: many(routeCompletions)
}));

export const warehousesRelations = relations(warehouses, ({ many }) => ({
	routes: many(routes),
	assignments: many(assignments),
	managers: many(warehouseManagers)
}));

export const warehouseManagersRelations = relations(warehouseManagers, ({ one }) => ({
	warehouse: one(warehouses, {
		fields: [warehouseManagers.warehouseId],
		references: [warehouses.id]
	}),
	user: one(users, {
		fields: [warehouseManagers.userId],
		references: [users.id]
	})
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
	route: one(routes, {
		fields: [assignments.routeId],
		references: [routes.id]
	}),
	user: one(users, {
		fields: [assignments.userId],
		references: [users.id]
	}),
	warehouse: one(warehouses, {
		fields: [assignments.warehouseId],
		references: [warehouses.id]
	}),
	shift: one(shifts, {
		fields: [assignments.id],
		references: [shifts.assignmentId]
	}),
	bidWindow: one(bidWindows, {
		fields: [assignments.id],
		references: [bidWindows.assignmentId]
	}),
	bids: many(bids)
}));
```

---

## Key Queries

### Get driver's current week schedule

```typescript
const schedule = await db
	.select()
	.from(assignments)
	.innerJoin(routes, eq(assignments.routeId, routes.id))
	.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
	.where(
		and(
			eq(assignments.userId, driverId),
			gte(assignments.date, startOfWeek),
			lte(assignments.date, endOfWeek)
		)
	)
	.orderBy(assignments.date);
```

### Get unfilled routes for manager

```typescript
const unfilled = await db
	.select()
	.from(assignments)
	.innerJoin(routes, eq(assignments.routeId, routes.id))
	.where(and(eq(assignments.status, 'unfilled'), gte(assignments.date, today)));
```

### Calculate bid score

```typescript
async function calculateBidScore(userId: string, routeId: string): Promise<number> {
	const [metrics] = await db.select().from(driverMetrics).where(eq(driverMetrics.userId, userId));

	const [routeFamiliarity] = await db
		.select()
		.from(routeCompletions)
		.where(and(eq(routeCompletions.userId, userId), eq(routeCompletions.routeId, routeId)));

	const [preferences] = await db
		.select()
		.from(driverPreferences)
		.where(eq(driverPreferences.userId, userId));

	const completionRate = metrics?.completionRate ?? 0;
	const attendanceRate = metrics?.attendanceRate ?? 0;
	const familiarityNormalized = Math.min((routeFamiliarity?.completionCount ?? 0) / 20, 1);
	const preferenceBonus = preferences?.preferredRoutes.includes(routeId) ? 1 : 0;

	return (
		completionRate * 0.4 +
		familiarityNormalized * 0.3 +
		attendanceRate * 0.2 +
		preferenceBonus * 0.1
	);
}
```

### Check if driver can bid (weekly cap)

```typescript
async function canDriverBid(userId: string, weekStart: Date): Promise<boolean> {
	const [user] = await db
		.select({ weeklyCap: users.weeklyCap, isFlagged: users.isFlagged })
		.from(users)
		.where(eq(users.id, userId));

	if (user.isFlagged) return false;

	const weekEnd = addDays(weekStart, 7);

	const [{ count }] = await db
		.select({ count: sql<number>`count(*)` })
		.from(assignments)
		.where(
			and(
				eq(assignments.userId, userId),
				gte(assignments.date, weekStart),
				lt(assignments.date, weekEnd),
				ne(assignments.status, 'cancelled')
			)
		);

	return count < user.weeklyCap;
}
```

### Manager warehouse access control

```typescript
// Get all warehouses a manager can access
async function getManagerWarehouses(managerId: string) {
	return await db
		.select({
			id: warehouses.id,
			name: warehouses.name,
			address: warehouses.address
		})
		.from(warehouses)
		.innerJoin(warehouseManagers, eq(warehouseManagers.warehouseId, warehouses.id))
		.where(eq(warehouseManagers.userId, managerId));
}

// Check if manager can access a specific warehouse
async function canManagerAccessWarehouse(managerId: string, warehouseId: string): Promise<boolean> {
	const [result] = await db
		.select({ id: warehouseManagers.id })
		.from(warehouseManagers)
		.where(
			and(eq(warehouseManagers.userId, managerId), eq(warehouseManagers.warehouseId, warehouseId))
		)
		.limit(1);

	return !!result;
}

// Get routes with manager info
async function getRoutesWithManagers(warehouseId: string) {
	return await db
		.select({
			route: routes,
			manager: {
				id: users.id,
				firstName: users.firstName,
				lastName: users.lastName
			}
		})
		.from(routes)
		.leftJoin(users, eq(routes.managerId, users.id))
		.where(eq(routes.warehouseId, warehouseId));
}
```

---

## Indexes

```sql
-- Performance-critical indexes
CREATE INDEX idx_assignments_user_date ON assignments(user_id, date);
CREATE INDEX idx_assignments_status_date ON assignments(status, date);
CREATE INDEX idx_assignments_route_date ON assignments(route_id, date);
CREATE INDEX idx_bids_assignment_status ON bids(assignment_id, status);
CREATE INDEX idx_bid_windows_status_closes ON bid_windows(status, closes_at);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read, created_at DESC);
CREATE INDEX idx_route_completions_user ON route_completions(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_routes_manager ON routes(manager_id);
CREATE INDEX idx_warehouse_managers_warehouse ON warehouse_managers(warehouse_id);
```

---

## Migrations Strategy

Using Drizzle Kit for migrations:

```bash
# Generate migration
pnpm drizzle-kit generate

# Apply migration
pnpm drizzle-kit migrate

# Push schema directly (dev only)
pnpm drizzle-kit push
```

Neon supports branching for safe migration testing.
