/**
 * Database Schema - Driver Operations Platform
 *
 * See documentation/specs/data-model.md for full documentation.
 *
 * Note: User data is managed by Better Auth in auth-schema.ts.
 * Domain tables reference the auth user table via text user_id columns.
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
	unique,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { desc, relations, sql } from 'drizzle-orm';
import { user } from './auth-schema';

// Re-export auth user for convenience
export { user } from './auth-schema';

// Enums
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
export const cancelTypeEnum = pgEnum('cancel_type', ['driver', 'late', 'auto_drop']);
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
	'corrective_warning',
	'return_exception',
	'stale_shift_reminder'
]);
export const actorTypeEnum = pgEnum('actor_type', ['user', 'system']);
export const signupOnboardingKindEnum = pgEnum('signup_onboarding_kind', ['approval', 'invite']);
export const signupOnboardingStatusEnum = pgEnum('signup_onboarding_status', [
	'pending',
	'reserved',
	'consumed',
	'revoked'
]);

// Organizations
export const organizations = pgTable(
	'organizations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		joinCodeHash: text('join_code_hash').notNull(),
		ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		slugUnique: uniqueIndex('uq_organizations_slug').on(table.slug),
		joinCodeHashUnique: uniqueIndex('uq_organizations_join_code_hash').on(table.joinCodeHash)
	})
);

// Warehouses
export const warehouses = pgTable(
	'warehouses',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		address: text('address').notNull(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'restrict' }),
		createdBy: text('created_by').references(() => user.id),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		idxWarehousesOrg: index('idx_warehouses_org').on(table.organizationId)
	})
);

// Routes (one-to-one with warehouse)
export const routes = pgTable(
	'routes',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		warehouseId: uuid('warehouse_id')
			.notNull()
			.references(() => warehouses.id),
		managerId: text('manager_id').references(() => user.id, { onDelete: 'set null' }),
		startTime: text('start_time').notNull().default('09:00'),
		createdBy: text('created_by').references(() => user.id),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		idxRouteManager: index('idx_routes_manager').on(table.managerId)
	})
);

// Warehouse Managers (many-to-many junction table)
export const warehouseManagers = pgTable(
	'warehouse_managers',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		warehouseId: uuid('warehouse_id')
			.notNull()
			.references(() => warehouses.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		uniquePair: unique().on(table.warehouseId, table.userId),
		idxWarehouse: index('idx_warehouse_managers_warehouse').on(table.warehouseId)
	})
);

// Driver Preferences
export const driverPreferences = pgTable('driver_preferences', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
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
		userId: text('user_id').references(() => user.id),
		warehouseId: uuid('warehouse_id')
			.notNull()
			.references(() => warehouses.id),
		date: date('date').notNull(),
		status: assignmentStatusEnum('status').notNull().default('scheduled'),
		assignedBy: assignedByEnum('assigned_by'),
		assignedAt: timestamp('assigned_at', { withTimezone: true }),
		confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
		cancelType: cancelTypeEnum('cancel_type'),
		cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		userDateIdx: index('idx_assignments_user_date').on(table.userId, table.date),
		statusDateIdx: index('idx_assignments_status_date').on(table.status, table.date),
		routeDateIdx: index('idx_assignments_route_date').on(table.routeId, table.date),
		activeUserDateUniqueIdx: uniqueIndex('uq_assignments_active_user_date')
			.on(table.userId, table.date)
			.where(sql`${table.userId} is not null and ${table.status} <> 'cancelled'`)
	})
);

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
	exceptedReturns: integer('excepted_returns').notNull().default(0),
	exceptionNotes: text('exception_notes'),
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
		bidWindowId: uuid('bid_window_id')
			.notNull()
			.references(() => bidWindows.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		score: real('score'),
		status: bidStatusEnum('status').notNull().default('pending'),
		bidAt: timestamp('bid_at', { withTimezone: true }).notNull().defaultNow(),
		windowClosesAt: timestamp('window_closes_at', { withTimezone: true }).notNull(),
		resolvedAt: timestamp('resolved_at', { withTimezone: true })
	},
	(table) => ({
		assignmentStatusIdx: index('idx_bids_assignment_status').on(table.assignmentId, table.status),
		windowStatusIdx: index('idx_bids_window_status').on(table.bidWindowId, table.status),
		windowUserUniqueIdx: uniqueIndex('uq_bids_window_user').on(table.bidWindowId, table.userId)
	})
);

// Bid Windows
export const bidWindows = pgTable(
	'bid_windows',
	{
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
		winnerId: text('winner_id').references(() => user.id)
	},
	(table) => ({
		statusClosesIdx: index('idx_bid_windows_status_closes').on(table.status, table.closesAt),
		assignmentStatusIdx: index('idx_bid_windows_assignment_status').on(
			table.assignmentId,
			table.status
		),
		openAssignmentUniqueIdx: uniqueIndex('uq_bid_windows_open_assignment')
			.on(table.assignmentId)
			.where(sql`${table.status} = 'open'`)
	})
);

// Dispatch Settings (singleton row keyed by id='global')
export const dispatchSettings = pgTable('dispatch_settings', {
	id: text('id').primaryKey(),
	emergencyBonusPercent: integer('emergency_bonus_percent').notNull().default(20),
	updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Organization dispatch settings (one row per organization)
export const organizationDispatchSettings = pgTable('organization_dispatch_settings', {
	organizationId: uuid('organization_id')
		.primaryKey()
		.references(() => organizations.id, { onDelete: 'cascade' }),
	emergencyBonusPercent: integer('emergency_bonus_percent').notNull().default(20),
	rewardMinAttendancePercent: integer('reward_min_attendance_percent').notNull().default(95),
	correctiveCompletionThresholdPercent: integer('corrective_completion_threshold_percent')
		.notNull()
		.default(98),
	updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Driver Metrics (denormalized for performance)
export const driverMetrics = pgTable('driver_metrics', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	totalShifts: integer('total_shifts').notNull().default(0),
	completedShifts: integer('completed_shifts').notNull().default(0),
	attendanceRate: real('attendance_rate').notNull().default(0),
	completionRate: real('completion_rate').notNull().default(0),
	avgParcelsDelivered: real('avg_parcels_delivered').notNull().default(0),
	totalAssigned: integer('total_assigned').notNull().default(0),
	confirmedShifts: integer('confirmed_shifts').notNull().default(0),
	autoDroppedShifts: integer('auto_dropped_shifts').notNull().default(0),
	lateCancellations: integer('late_cancellations').notNull().default(0),
	noShows: integer('no_shows').notNull().default(0),
	bidPickups: integer('bid_pickups').notNull().default(0),
	arrivedOnTimeCount: integer('arrived_on_time_count').notNull().default(0),
	highDeliveryCount: integer('high_delivery_count').notNull().default(0),
	urgentPickups: integer('urgent_pickups').notNull().default(0),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Route Completions (for familiarity tracking)
export const routeCompletions = pgTable(
	'route_completions',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
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
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		organizationId: uuid('organization_id').references(() => organizations.id),
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
		entityId: text('entity_id').notNull(),
		action: text('action').notNull(),
		actorId: text('actor_id').references(() => user.id),
		organizationId: uuid('organization_id').references(() => organizations.id),
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

// Signup Onboarding (manager approvals + one-time invites)
export const signupOnboarding = pgTable(
	'signup_onboarding',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'restrict' }),
		email: text('email').notNull(),
		kind: signupOnboardingKindEnum('kind').notNull().default('approval'),
		targetRole: text('target_role').notNull().default('driver'),
		tokenHash: text('token_hash'),
		status: signupOnboardingStatusEnum('status').notNull().default('pending'),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		consumedAt: timestamp('consumed_at', { withTimezone: true }),
		consumedByUserId: text('consumed_by_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		revokedByUserId: text('revoked_by_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		orgEmailStatusIdx: index('idx_signup_onboarding_org_email_status').on(
			table.organizationId,
			table.email,
			table.status
		),
		expiresAtIdx: index('idx_signup_onboarding_expires_at').on(table.expiresAt),
		tokenHashIdx: index('idx_signup_onboarding_token_hash').on(table.tokenHash),
		tokenHashUnique: unique('uq_signup_onboarding_token_hash').on(table.tokenHash),
		pendingOrgEmailKindRoleUniqueIdx: uniqueIndex(
			'uq_signup_onboarding_pending_org_email_kind_role'
		)
			.on(table.organizationId, table.email, table.kind, table.targetRole)
			.where(sql`${table.status} = 'pending'`)
	})
);

// Driver Health Snapshots (daily score records)
export const driverHealthSnapshots = pgTable(
	'driver_health_snapshots',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		evaluatedAt: date('evaluated_at').notNull(),
		score: integer('score').notNull(),
		attendanceRate: real('attendance_rate').notNull(),
		completionRate: real('completion_rate').notNull(),
		lateCancellationCount30d: integer('late_cancellation_count_30d').notNull().default(0),
		noShowCount30d: integer('no_show_count_30d').notNull().default(0),
		hardStopTriggered: boolean('hard_stop_triggered').notNull().default(false),
		reasons: jsonb('reasons').$type<string[]>().notNull().default([]),
		contributions: jsonb('contributions'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		uniqueUserDate: unique().on(table.userId, table.evaluatedAt)
	})
);

// Driver Health State (current state per driver)
export const driverHealthState = pgTable('driver_health_state', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	currentScore: integer('current_score').notNull().default(0),
	streakWeeks: integer('streak_weeks').notNull().default(0),
	stars: integer('stars').notNull().default(0),
	lastQualifiedWeekStart: date('last_qualified_week_start'),
	assignmentPoolEligible: boolean('assignment_pool_eligible').notNull().default(true),
	requiresManagerIntervention: boolean('requires_manager_intervention').notNull().default(false),
	reinstatedAt: timestamp('reinstated_at', { withTimezone: true }),
	lastScoreResetAt: timestamp('last_score_reset_at', { withTimezone: true }),
	nextMilestoneStars: integer('next_milestone_stars').notNull().default(1),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Relations
export const userRelations = relations(user, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [user.organizationId],
		references: [organizations.id]
	}),
	preferences: one(driverPreferences, {
		fields: [user.id],
		references: [driverPreferences.userId]
	}),
	metrics: one(driverMetrics, {
		fields: [user.id],
		references: [driverMetrics.userId]
	}),
	healthState: one(driverHealthState, {
		fields: [user.id],
		references: [driverHealthState.userId]
	}),
	assignments: many(assignments),
	bids: many(bids),
	notifications: many(notifications),
	routeCompletions: many(routeCompletions),
	healthSnapshots: many(driverHealthSnapshots)
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
	owner: one(user, {
		fields: [organizations.ownerUserId],
		references: [user.id]
	}),
	warehouses: many(warehouses),
	onboardingEntries: many(signupOnboarding),
	notifications: many(notifications),
	auditLogs: many(auditLogs),
	dispatchSettings: one(organizationDispatchSettings, {
		fields: [organizations.id],
		references: [organizationDispatchSettings.organizationId]
	})
}));

export const routesRelations = relations(routes, ({ one, many }) => ({
	warehouse: one(warehouses, {
		fields: [routes.warehouseId],
		references: [warehouses.id]
	}),
	manager: one(user, {
		fields: [routes.managerId],
		references: [user.id]
	}),
	assignments: many(assignments),
	completions: many(routeCompletions)
}));

export const warehousesRelations = relations(warehouses, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [warehouses.organizationId],
		references: [organizations.id]
	}),
	routes: many(routes),
	assignments: many(assignments),
	managers: many(warehouseManagers)
}));

export const warehouseManagersRelations = relations(warehouseManagers, ({ one }) => ({
	warehouse: one(warehouses, {
		fields: [warehouseManagers.warehouseId],
		references: [warehouses.id]
	}),
	user: one(user, {
		fields: [warehouseManagers.userId],
		references: [user.id]
	})
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
	route: one(routes, {
		fields: [assignments.routeId],
		references: [routes.id]
	}),
	user: one(user, {
		fields: [assignments.userId],
		references: [user.id]
	}),
	warehouse: one(warehouses, {
		fields: [assignments.warehouseId],
		references: [warehouses.id]
	}),
	shift: one(shifts, {
		fields: [assignments.id],
		references: [shifts.assignmentId]
	}),
	bidWindows: many(bidWindows),
	bids: many(bids)
}));

export const driverPreferencesRelations = relations(driverPreferences, ({ one }) => ({
	user: one(user, {
		fields: [driverPreferences.userId],
		references: [user.id]
	})
}));

export const bidsRelations = relations(bids, ({ one }) => ({
	assignment: one(assignments, {
		fields: [bids.assignmentId],
		references: [assignments.id]
	}),
	bidWindow: one(bidWindows, {
		fields: [bids.bidWindowId],
		references: [bidWindows.id]
	}),
	user: one(user, {
		fields: [bids.userId],
		references: [user.id]
	})
}));

export const bidWindowsRelations = relations(bidWindows, ({ one, many }) => ({
	assignment: one(assignments, {
		fields: [bidWindows.assignmentId],
		references: [assignments.id]
	}),
	winner: one(user, {
		fields: [bidWindows.winnerId],
		references: [user.id]
	}),
	bids: many(bids)
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
	user: one(user, {
		fields: [notifications.userId],
		references: [user.id]
	}),
	organization: one(organizations, {
		fields: [notifications.organizationId],
		references: [organizations.id]
	})
}));

export const organizationDispatchSettingsRelations = relations(
	organizationDispatchSettings,
	({ one }) => ({
		organization: one(organizations, {
			fields: [organizationDispatchSettings.organizationId],
			references: [organizations.id]
		}),
		updatedByUser: one(user, {
			fields: [organizationDispatchSettings.updatedBy],
			references: [user.id]
		})
	})
);

export const driverMetricsRelations = relations(driverMetrics, ({ one }) => ({
	user: one(user, {
		fields: [driverMetrics.userId],
		references: [user.id]
	})
}));

export const routeCompletionsRelations = relations(routeCompletions, ({ one }) => ({
	user: one(user, {
		fields: [routeCompletions.userId],
		references: [user.id]
	}),
	route: one(routes, {
		fields: [routeCompletions.routeId],
		references: [routes.id]
	})
}));

export const driverHealthSnapshotsRelations = relations(driverHealthSnapshots, ({ one }) => ({
	user: one(user, {
		fields: [driverHealthSnapshots.userId],
		references: [user.id]
	})
}));

export const driverHealthStateRelations = relations(driverHealthState, ({ one }) => ({
	user: one(user, {
		fields: [driverHealthState.userId],
		references: [user.id]
	})
}));
