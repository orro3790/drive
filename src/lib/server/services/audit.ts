/**
 * Audit Logging Service
 *
 * Centralized creation and querying of audit log entries.
 */

import { db } from '$lib/server/db';
import { auditLogs } from '$lib/server/db/schema';
import { and, desc, eq } from 'drizzle-orm';

export type AuditActorType = 'user' | 'system';

export interface AuditActor {
	actorType: AuditActorType;
	actorId?: string | null;
}

export interface CreateAuditLogParams {
	entityType: string;
	entityId: string;
	action: string;
	actorType: AuditActorType;
	actorId?: string | null;
	changes?: Record<string, unknown> | null;
}

type InsertClient = Pick<typeof db, 'insert'>;
type QueryClient = Pick<typeof db, 'select'>;

/**
 * Create a single audit log entry.
 */
export async function createAuditLog(
	params: CreateAuditLogParams,
	dbClient: InsertClient = db
): Promise<void> {
	await dbClient.insert(auditLogs).values({
		entityType: params.entityType,
		entityId: params.entityId,
		action: params.action,
		actorType: params.actorType,
		actorId: params.actorId ?? null,
		changes: params.changes ?? null
	});
}

/**
 * Create multiple audit log entries in a single insert.
 */
export async function createAuditLogs(
	entries: CreateAuditLogParams[],
	dbClient: InsertClient = db
): Promise<void> {
	if (entries.length === 0) {
		return;
	}

	await dbClient.insert(auditLogs).values(
		entries.map((entry) => ({
			entityType: entry.entityType,
			entityId: entry.entityId,
			action: entry.action,
			actorType: entry.actorType,
			actorId: entry.actorId ?? null,
			changes: entry.changes ?? null
		}))
	);
}

/**
 * Fetch audit logs for a specific entity.
 */
export async function getAuditLogsForEntity(
	entityType: string,
	entityId: string,
	limit = 50,
	dbClient: QueryClient = db
) {
	return dbClient
		.select()
		.from(auditLogs)
		.where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
		.orderBy(desc(auditLogs.createdAt))
		.limit(limit);
}
