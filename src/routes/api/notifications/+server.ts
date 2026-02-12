/**
 * Notifications API
 *
 * GET /api/notifications - List current user's notifications (paginated)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { notifications } from '$lib/server/db/schema';
import { and, count, desc, eq } from 'drizzle-orm';
import {
	notificationListParamsSchema,
	notificationListResponseSchema
} from '$lib/schemas/api/notifications';
import { requireAuthenticatedWithOrg } from '$lib/server/org-scope';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { user } = requireAuthenticatedWithOrg(locals);

	const paramsResult = notificationListParamsSchema.safeParse({
		page: url.searchParams.get('page') ?? undefined,
		pageSize: url.searchParams.get('pageSize') ?? undefined
	});

	if (!paramsResult.success) {
		throw error(400, 'Invalid pagination');
	}

	const { page, pageSize } = paramsResult.data;
	const offset = (page - 1) * pageSize;

	const [rows, totalResult, unreadResult] = await Promise.all([
		db
			.select({
				id: notifications.id,
				type: notifications.type,
				title: notifications.title,
				body: notifications.body,
				read: notifications.read,
				createdAt: notifications.createdAt,
				data: notifications.data
			})
			.from(notifications)
			.where(eq(notifications.userId, user.id))
			.orderBy(desc(notifications.createdAt))
			.limit(pageSize)
			.offset(offset),
		db
			.select({ count: count() })
			.from(notifications)
			.where(eq(notifications.userId, user.id)),
		db
			.select({ count: count() })
			.from(notifications)
			.where(and(eq(notifications.userId, user.id), eq(notifications.read, false)))
	]);

	const total = Number(totalResult[0]?.count ?? 0);
	const unreadCount = Number(unreadResult[0]?.count ?? 0);
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const mapped = rows.map((row) => ({
		id: row.id,
		type: row.type,
		title: row.title,
		body: row.body,
		read: row.read,
		data: row.data ? (row.data as Record<string, string>) : null,
		createdAt: row.createdAt.toISOString()
	}));

	const response = {
		notifications: mapped,
		unreadCount,
		pagination: {
			page,
			pageSize,
			total,
			totalPages
		}
	};

	const responseResult = notificationListResponseSchema.safeParse(response);
	if (!responseResult.success) {
		throw error(500, 'Failed to build notifications response');
	}

	return json(responseResult.data);
};
