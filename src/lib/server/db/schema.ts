/**
 * Database Schema - Driver Operations Platform
 *
 * See docs/specs/data-model.md for full documentation.
 */

import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
	uuid
} from 'drizzle-orm/pg-core';
import { desc, relations } from 'drizzle-orm';

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
export const notificationTypeEnum = pgEnum('notification_type', [
	'shift_reminder',
	'bid_open',
	'bid_won',
	'bid_lost',
	'shift_cancelled',
	'warning',
	'manual',
	'schedule_locked',
	'assignment_confirmed'
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
	createdBy: uuid('created_by').references(() => users.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Driver Preferences
export const driverPreferences = pgTable('driver_preferences', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' })
		.unique(),
	preferredDays: integer('preferred_days').array().notNull().default([]),
	preferredRoutes: uuid('preferred_routes').array().notNull().default([]),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	lockedAt: timestamp('locked_at', { withTimezone: true })
});

// Assignments
export const assignments = pgTable(
	'assignments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		routeId: uuid('route_id')
			.notNull()
			.references(() => routes.id),
		userId: uuid('user_id').references(() => users.id),
		warehouseId: uuid('warehouse_id')
			.notNull()
			.references(() => warehouses.id),
		date: date('date').notNull(),
		status: assignmentStatusEnum('status').notNull().default('scheduled'),
		assignedBy: assignedByEnum('assigned_by'),
		assignedAt: timestamp('assigned_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		userDateIdx: index('idx_assignments_user_date').on(table.userId, table.date),
		statusDateIdx: index('idx_assignments_status_date').on(table.status, table.date),
		routeDateIdx: index('idx_assignments_route_date').on(table.routeId, table.date)
	})
);

// Shifts (when assignment becomes active)
export const shifts = pgTable('shifts', {
	id: uuid('id').primaryKey().defaultRandom(),
	assignmentId: uuid('assignment_id')
		.notNull()
		.references(() => assignments.id, { onDelete: 'cascade' })
		.unique(),
	parcelsStart: integer('parcels_start'),
	parcelsDelivered: integer('parcels_delivered'),
	parcelsReturned: integer('parcels_returned'),
	startedAt: timestamp('started_at', { withTimezone: true }),
	completedAt: timestamp('completed_at', { withTimezone: true }),
	cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
	cancelReason: cancelReasonEnum('cancel_reason'),
	cancelNotes: text('cancel_notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Bids
export const bids = pgTable(
	'bids',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		assignmentId: uuid('assignment_id')
			.notNull()
			.references(() => assignments.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id),
		score: real('score'),
		status: bidStatusEnum('status').notNull().default('pending'),
		bidAt: timestamp('bid_at', { withTimezone: true }).notNull().defaultNow(),
		windowClosesAt: timestamp('window_closes_at', { withTimezone: true }).notNull(),
		resolvedAt: timestamp('resolved_at', { withTimezone: true })
	},
	(table) => ({
		assignmentStatusIdx: index('idx_bids_assignment_status').on(table.assignmentId, table.status)
	})
);

// Bid Windows
export const bidWindows = pgTable(
	'bid_windows',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		assignmentId: uuid('assignment_id')
			.notNull()
			.references(() => assignments.id, { onDelete: 'cascade' })
			.unique(),
		opensAt: timestamp('opens_at', { withTimezone: true }).notNull().defaultNow(),
		closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
		status: bidWindowStatusEnum('status').notNull().default('open'),
		winnerId: uuid('winner_id').references(() => users.id)
	},
	(table) => ({
		statusClosesIdx: index('idx_bid_windows_status_closes').on(table.status, table.closesAt)
	})
);

// Driver Metrics (denormalized for performance)
export const driverMetrics = pgTable('driver_metrics', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	totalShifts: integer('total_shifts').notNull().default(0),
	completedShifts: integer('completed_shifts').notNull().default(0),
	attendanceRate: real('attendance_rate').notNull().default(0),
	completionRate: real('completion_rate').notNull().default(0),
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
		pk: primaryKey({ columns: [table.userId, table.routeId] }),
		userIdx: index('idx_route_completions_user').on(table.userId)
	})
);

// Notifications
export const notifications = pgTable(
	'notifications',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		type: notificationTypeEnum('type').notNull(),
		title: text('title').notNull(),
		body: text('body').notNull(),
		data: jsonb('data'),
		read: boolean('read').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		userReadIdx: index('idx_notifications_user_read').on(
			table.userId,
			table.read,
			desc(table.createdAt)
		)
	})
);

// Audit Log
export const auditLogs = pgTable(
	'audit_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		entityType: text('entity_type').notNull(),
		entityId: uuid('entity_id').notNull(),
		action: text('action').notNull(),
		actorId: uuid('actor_id').references(() => users.id),
		actorType: actorTypeEnum('actor_type').notNull(),
		changes: jsonb('changes'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		entityIdx: index('idx_audit_logs_entity').on(
			table.entityType,
			table.entityId,
			desc(table.createdAt)
		)
	})
);

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
	assignments: many(assignments),
	bids: many(bids),
	notifications: many(notifications),
	routeCompletions: many(routeCompletions)
}));

export const routesRelations = relations(routes, ({ one, many }) => ({
	warehouse: one(warehouses, {
		fields: [routes.warehouseId],
		references: [warehouses.id]
	}),
	assignments: many(assignments),
	completions: many(routeCompletions)
}));

export const warehousesRelations = relations(warehouses, ({ many }) => ({
	routes: many(routes),
	assignments: many(assignments)
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
