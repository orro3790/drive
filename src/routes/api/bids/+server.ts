/**
 * Bids API
 *
 * POST /api/bids - Submit a bid on an assignment
 *
 * Supports three modes:
 * - competitive: creates a pending bid, scored at window close
 * - instant: immediately assigns the driver (FCFS)
 * - emergency: same as instant, with bonus tracking
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bids, bidWindows, assignments, user, warehouses } from '$lib/server/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { parseISO, set, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { getWeekStart, canDriverTakeAssignment } from '$lib/server/services/scheduling';
import { instantAssign } from '$lib/server/services/bidding';
import {
	broadcastAssignmentUpdated,
	broadcastBidWindowClosed
} from '$lib/server/realtime/managerSse';
import { sendNotification } from '$lib/server/services/notifications';
import { bidSubmissionSchema } from '$lib/schemas/api/bidding';
import logger from '$lib/server/logger';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';

const INSTANT_MODE_CUTOFF_MS = dispatchPolicy.bidding.instantModeCutoffHours * 60 * 60 * 1000;
const PG_UNIQUE_VIOLATION = '23505';
const WINDOW_USER_UNIQUE_CONSTRAINT = 'uq_bids_window_user';

function isWindowScopedDuplicateBidError(err: unknown): boolean {
	if (typeof err !== 'object' || err === null) {
		return false;
	}

	const code = 'code' in err ? (err as { code?: unknown }).code : undefined;
	const constraint = 'constraint' in err ? (err as { constraint?: unknown }).constraint : undefined;

	return code === PG_UNIQUE_VIOLATION && constraint === WINDOW_USER_UNIQUE_CONSTRAINT;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can submit bids');
	}

	const driverId = locals.user.id;
	const organizationId = locals.organizationId ?? locals.user.organizationId ?? '';

	const log = logger.child({ operation: 'submitBid' });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsedBody = bidSubmissionSchema.safeParse(body);
	if (!parsedBody.success) {
		throw error(400, 'assignmentId must be a valid assignment ID');
	}

	const { assignmentId } = parsedBody.data;

	// Check if driver is flagged
	const [driverInfo] = await db
		.select({ isFlagged: user.isFlagged })
		.from(user)
		.where(and(eq(user.id, driverId), eq(user.organizationId, organizationId)));

	if (driverInfo?.isFlagged) {
		log.warn('Flagged driver attempted to bid');
		throw error(403, 'Flagged drivers cannot submit bids');
	}

	// Get the OPEN bid window for this assignment
	const [window] = await db
		.select({
			id: bidWindows.id,
			status: bidWindows.status,
			mode: bidWindows.mode,
			payBonusPercent: bidWindows.payBonusPercent,
			closesAt: bidWindows.closesAt,
			assignmentDate: assignments.date,
			routeId: assignments.routeId
		})
		.from(bidWindows)
		.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(
			and(
				eq(bidWindows.assignmentId, assignmentId),
				eq(bidWindows.status, 'open'),
				eq(warehouses.organizationId, organizationId)
			)
		)
		.orderBy(desc(bidWindows.opensAt), desc(bidWindows.id))
		.limit(1);

	if (!window) {
		throw error(404, 'No open bid window found for this assignment');
	}

	const now = new Date();
	if (window.closesAt <= now) {
		throw error(400, 'Bid window has closed');
	}

	// Check if driver already bid on this assignment
	const [existingBid] = await db
		.select({ id: bids.id })
		.from(bids)
		.where(and(eq(bids.bidWindowId, window.id), eq(bids.userId, driverId)));

	if (existingBid) {
		throw error(400, 'You have already bid on this assignment');
	}

	// Check weekly cap for the assignment's week
	const assignmentWeekStart = getWeekStart(parseISO(window.assignmentDate));
	const canTake = await canDriverTakeAssignment(driverId, assignmentWeekStart, organizationId);
	if (!canTake) {
		throw error(400, 'You have reached your weekly cap for that week');
	}

	// Belt-and-suspenders: if < 24h to shift, treat as instant regardless of stored mode
	const parsedAssignmentDate = parseISO(window.assignmentDate);
	const toronto = toZonedTime(parsedAssignmentDate, dispatchPolicy.timezone.toronto);
	const shiftStart = set(startOfDay(toronto), {
		hours: dispatchPolicy.shifts.startHourLocal,
		minutes: 0,
		seconds: 0,
		milliseconds: 0
	});
	const timeUntilShiftMs = shiftStart.getTime() - now.getTime();
	const effectiveMode =
		timeUntilShiftMs <= INSTANT_MODE_CUTOFF_MS && window.mode === 'competitive'
			? 'instant'
			: window.mode;

	// Instant or emergency mode: assign immediately
	if (effectiveMode === 'instant' || effectiveMode === 'emergency') {
		const result = await instantAssign(assignmentId, driverId, window.id, organizationId);

		if (!result.instantlyAssigned) {
			throw error(400, result.error ?? 'Route already assigned');
		}

		try {
			broadcastBidWindowClosed({
				assignmentId,
				bidWindowId: window.id,
				winnerId: driverId
			});
		} catch (err) {
			log.warn(
				{
					errorName: err instanceof Error ? err.name : 'UnknownError',
					errorMessage: err instanceof Error ? err.message : 'UnknownError'
				},
				'Bid window close broadcast failed'
			);
		}

		try {
			broadcastAssignmentUpdated({
				assignmentId,
				status: 'scheduled',
				driverId,
				routeId: window.routeId
			});
		} catch (err) {
			log.warn(
				{
					errorName: err instanceof Error ? err.name : 'UnknownError',
					errorMessage: err instanceof Error ? err.message : 'UnknownError'
				},
				'Assignment update broadcast failed'
			);
		}

		try {
			await sendNotification(driverId, 'bid_won', {
				data: { assignmentId, bidWindowId: window.id },
				organizationId
			});
		} catch (err) {
			log.warn(
				{
					errorName: err instanceof Error ? err.name : 'UnknownError',
					errorMessage: err instanceof Error ? err.message : 'UnknownError'
				},
				'Bid won notification failed'
			);
		}

		log.info({ mode: effectiveMode }, 'Instant assignment');

		return json({
			success: true,
			status: 'won',
			assignmentId,
			bonusPercent: window.payBonusPercent
		});
	}

	// Competitive mode: lock active window and submit pending bid atomically
	const competitiveResult = await db
		.transaction(async (tx) => {
			const lockResult = await tx.execute(
				sql`SELECT id, status, closes_at FROM bid_windows WHERE id = ${window.id} FOR UPDATE`
			);
			const lockedWindow = (lockResult as { rows?: Array<Record<string, unknown>> }).rows?.[0];

			if (!lockedWindow || lockedWindow.status !== 'open') {
				return { outcome: 'window_closed' as const };
			}

			const closesAtRaw = lockedWindow.closes_at;
			const closesAt =
				closesAtRaw instanceof Date ? closesAtRaw : new Date(String(closesAtRaw ?? ''));
			if (
				!(closesAt instanceof Date) ||
				Number.isNaN(closesAt.getTime()) ||
				closesAt <= new Date()
			) {
				return { outcome: 'window_closed' as const };
			}

			const [lockedExistingBid] = await tx
				.select({ id: bids.id })
				.from(bids)
				.where(and(eq(bids.bidWindowId, window.id), eq(bids.userId, driverId)));

			if (lockedExistingBid) {
				return { outcome: 'duplicate' as const };
			}

			const [createdBid] = await tx
				.insert(bids)
				.values({
					assignmentId,
					bidWindowId: window.id,
					userId: driverId,
					status: 'pending',
					windowClosesAt: closesAt
				})
				.returning({
					id: bids.id,
					assignmentId: bids.assignmentId,
					status: bids.status,
					bidAt: bids.bidAt,
					windowClosesAt: bids.windowClosesAt
				});

			if (!createdBid) {
				return { outcome: 'failed' as const };
			}

			return { outcome: 'created' as const, bid: createdBid };
		})
		.catch((err) => {
			if (isWindowScopedDuplicateBidError(err)) {
				return { outcome: 'duplicate' as const };
			}

			throw err;
		});

	if (competitiveResult.outcome === 'window_closed') {
		throw error(400, 'Bid window has closed');
	}

	if (competitiveResult.outcome === 'duplicate') {
		throw error(400, 'You have already bid on this assignment');
	}

	if (competitiveResult.outcome !== 'created') {
		throw error(500, 'Failed to submit bid');
	}

	const newBid = competitiveResult.bid;

	log.info('Bid submitted');

	return json({
		success: true,
		status: 'pending',
		bid: {
			id: newBid.id,
			assignmentId: newBid.assignmentId,
			status: newBid.status,
			bidAt: newBid.bidAt.toISOString(),
			windowClosesAt: newBid.windowClosesAt.toISOString()
		}
	});
};
