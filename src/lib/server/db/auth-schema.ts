/**
 * Better Auth Database Schema
 *
 * These tables are managed by Better Auth for authentication.
 * Keep separate from domain schema (schema.ts).
 */

import {
	bigint,
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid
} from 'drizzle-orm/pg-core';

/**
 * Better Auth User table
 *
 * Single source of truth for user data. Domain tables reference this table.
 * Includes domain fields (phone, weeklyCap, isFlagged, flagWarningDate).
 */
export const user = pgTable(
	'user',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull().unique(),
		emailVerified: boolean('email_verified').notNull().default(false),
		image: text('image'),
		role: text('role').notNull().default('driver'),
		phone: text('phone'),
		weeklyCap: integer('weekly_cap').notNull().default(4),
		isFlagged: boolean('is_flagged').notNull().default(false),
		flagWarningDate: timestamp('flag_warning_date', { withTimezone: true }),
		fcmToken: text('fcm_token'),
		// Nullable: Better Auth creates users with null org, then the after-hook sets it.
		// Application-layer guards (org-scope.ts) enforce non-null at runtime.
		organizationId: uuid('organization_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		idxUserOrg: index('idx_user_org').on(table.organizationId)
	})
);

/**
 * Better Auth Session table
 */
export const session = pgTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	token: text('token').notNull().unique(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * Better Auth Account table
 * Links users to auth providers (credential, OAuth, etc.)
 */
export const account = pgTable('account', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
	scope: text('scope'),
	idToken: text('id_token'),
	password: text('password'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * Better Auth Verification table
 * Used for email verification, password reset, etc.
 */
export const verification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * Better Auth rate limit table
 * Used when auth rate limits are persisted in PostgreSQL.
 */
export const rateLimit = pgTable('rate_limit', {
	id: text('id').primaryKey(),
	key: text('key').notNull().unique(),
	count: integer('count').notNull(),
	lastRequest: bigint('last_request', { mode: 'number' }).notNull()
});
