/**
 * Database Schema - Driver Operations Platform
 *
 * See docs/specs/data-model.md for full documentation.
 * This is a placeholder — implement based on the data model spec.
 */

import { pgTable, uuid, text, timestamp, boolean, integer, pgEnum, date, real } from 'drizzle-orm/pg-core';

// Enums
export const roleEnum = pgEnum('role', ['driver', 'manager']);
export const assignmentStatusEnum = pgEnum('assignment_status', ['scheduled', 'active', 'completed', 'cancelled', 'unfilled']);
export const assignedByEnum = pgEnum('assigned_by', ['algorithm', 'manager', 'bid']);
export const bidStatusEnum = pgEnum('bid_status', ['pending', 'won', 'lost']);
export const bidWindowStatusEnum = pgEnum('bid_window_status', ['open', 'closed', 'resolved']);
export const cancelReasonEnum = pgEnum('cancel_reason', ['sick', 'emergency', 'vehicle_issue', 'no_show', 'other']);
export const notificationTypeEnum = pgEnum('notification_type', ['shift_reminder', 'bid_open', 'bid_won', 'bid_lost', 'shift_cancelled', 'warning', 'manual']);
export const actorTypeEnum = pgEnum('actor_type', ['user', 'system']);

// Tables - implement based on docs/specs/data-model.md
// This is scaffolding only — full implementation will be done in beads

export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	firstName: text('first_name').notNull(),
	lastName: text('last_name').notNull(),
	phone: text('phone'),
	role: roleEnum('role').notNull().default('driver'),
	weeklyCap: integer('weekly_cap').notNull().default(4),
	isFlagged: boolean('is_flagged').notNull().default(false),
	flagWarningDate: timestamp('flag_warning_date', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
