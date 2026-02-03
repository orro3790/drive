/**
 * Assignment Cancellation API
 *
 * POST /api/assignments/[id]/cancel - Cancel an assignment (driver only)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, auditLogs, bidWindows } from '$lib/server/db/schema';
import { assignmentCancelSchema } from '$lib/schemas/assignment';
import { and, eq } from 'drizzle-orm';
import { addMinutes, differenceInCalendarDays, parseISO } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';

const TORONTO_TZ = 'America/Toronto';

function getMinutesUntilShift(dateString: string, nowToronto: Date): number {
	const torontoToday = format(nowToronto, 'yyyy-MM-dd');
	const dayDiff = differenceInCalendarDays(parseISO(dateString), parseISO(torontoToday));
	const currentMinutes = nowToronto.getHours() * 60 + nowToronto.getMinutes();
	return dayDiff * 24 * 60 - currentMinutes;
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can cancel assignments');
	}

	const { id } = params;
	const body = await request.json();
	const result = assignmentCancelSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const [existing] = await db
		.select({
			id: assignments.id,
			userId: assignments.userId,
			date: assignments.date,
			status: assignments.status
		})
		.from(assignments)
		.where(eq(assignments.id, id));

	if (!existing) {
		throw error(404, 'Assignment not found');
	}

	if (existing.userId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	if (existing.status === 'cancelled') {
		throw error(409, 'Assignment already cancelled');
	}

	const torontoNow = toZonedTime(new Date(), TORONTO_TZ);
	const torontoToday = format(torontoNow, 'yyyy-MM-dd');
	if (existing.date <= torontoToday) {
		throw error(400, 'Assignments must be cancelled in advance');
	}

	const minutesUntilShift = getMinutesUntilShift(existing.date, torontoNow);
	const isLateCancel = minutesUntilShift <= 48 * 60;

	const [updated] = await db
		.update(assignments)
		.set({
			status: 'cancelled',
			updatedAt: new Date()
		})
		.where(and(eq(assignments.id, id), eq(assignments.userId, locals.user.id)))
		.returning({
			id: assignments.id,
			status: assignments.status
		});

	await db.insert(auditLogs).values({
		entityType: 'assignment',
		entityId: existing.id,
		action: 'cancel',
		actorType: 'user',
		changes: {
			reason: result.data.reason,
			lateCancel: isLateCancel
		}
	});

	const [existingWindow] = await db
		.select({ id: bidWindows.id })
		.from(bidWindows)
		.where(eq(bidWindows.assignmentId, existing.id));

	if (!existingWindow) {
		const closesAt =
			minutesUntilShift > 30
				? addMinutes(new Date(), 30)
				: addMinutes(new Date(), Math.max(1, minutesUntilShift));

		await db.insert(bidWindows).values({
			assignmentId: existing.id,
			opensAt: new Date(),
			closesAt,
			status: 'open'
		});
	}

	return json({
		assignment: updated
	});
};
