/**
 * Dashboard API - Driver Overview Data
 *
 * GET /api/dashboard - Get dashboard data for current driver:
 * - Today's shift (if any)
 * - This week and next week schedule summaries
 * - Driver metrics (attendance, completion rates)
 * - Pending bids with countdown
 *
 * Also performs event-driven bid resolution to ensure data is fresh.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	assignments,
	routes,
	warehouses,
	shifts,
	driverMetrics,
	bids
} from '$lib/server/db/schema';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { addDays } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';
import { getWeekStart } from '$lib/server/services/scheduling';
import { getExpiredBidWindows, resolveBidWindow } from '$lib/server/services/bidding';
import { getUnconfirmedAssignments } from '$lib/server/services/confirmations';
import {
	createAssignmentLifecycleContext,
	deriveAssignmentLifecycle
} from '$lib/server/services/assignmentLifecycle';
import logger from '$lib/server/logger';

const TORONTO_TZ = 'America/Toronto';

function toTorontoDateString(date: Date): string {
	return format(toZonedTime(date, TORONTO_TZ), 'yyyy-MM-dd');
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can access dashboard');
	}

	// Event-driven resolution: resolve any expired bid windows before fetching data
	const expiredWindows = await getExpiredBidWindows();
	if (expiredWindows.length > 0) {
		const log = logger.child({ operation: 'event-driven-resolution', userId: locals.user.id });
		for (const window of expiredWindows) {
			try {
				await resolveBidWindow(window.id);
			} catch (err) {
				log.error({ windowId: window.id, error: err }, 'Failed to resolve expired window');
			}
		}
	}

	const weekStart = getWeekStart(new Date());
	const nextWeekStart = addDays(weekStart, 7);
	const windowEnd = addDays(weekStart, 14);
	const weekStartString = toTorontoDateString(weekStart);
	const nextWeekStartString = toTorontoDateString(nextWeekStart);
	const windowEndString = toTorontoDateString(windowEnd);
	const lifecycleContext = createAssignmentLifecycleContext();
	const torontoToday = lifecycleContext.torontoToday;

	// Parallel queries for performance
	const [assignmentRows, metricsRow, pendingBidsRows] = await Promise.all([
		// Get assignments for this week and next
		db
			.select({
				id: assignments.id,
				date: assignments.date,
				status: assignments.status,
				confirmedAt: assignments.confirmedAt,
				routeName: routes.name,
				routeStartTime: routes.startTime,
				warehouseName: warehouses.name,
				shiftId: shifts.id,
				parcelsStart: shifts.parcelsStart,
				parcelsDelivered: shifts.parcelsDelivered,
				parcelsReturned: shifts.parcelsReturned,
				exceptedReturns: shifts.exceptedReturns,
				exceptionNotes: shifts.exceptionNotes,
				shiftStartedAt: shifts.startedAt,
				shiftCompletedAt: shifts.completedAt,
				shiftArrivedAt: shifts.arrivedAt,
				shiftEditableUntil: shifts.editableUntil
			})
			.from(assignments)
			.innerJoin(routes, eq(assignments.routeId, routes.id))
			.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
			.leftJoin(shifts, eq(assignments.id, shifts.assignmentId))
			.where(
				and(
					eq(assignments.userId, locals.user.id),
					gte(assignments.date, weekStartString),
					lt(assignments.date, windowEndString)
				)
			)
			.orderBy(asc(assignments.date)),

		// Get driver metrics
		db.select().from(driverMetrics).where(eq(driverMetrics.userId, locals.user.id)).limit(1),

		// Get pending bids with assignment details
		db
			.select({
				id: bids.id,
				assignmentId: bids.assignmentId,
				assignmentDate: assignments.date,
				routeName: routes.name,
				warehouseName: warehouses.name,
				status: bids.status,
				bidAt: bids.bidAt,
				windowClosesAt: bids.windowClosesAt
			})
			.from(bids)
			.innerJoin(assignments, eq(bids.assignmentId, assignments.id))
			.innerJoin(routes, eq(assignments.routeId, routes.id))
			.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
			.where(
				and(
					eq(bids.userId, locals.user.id),
					eq(bids.status, 'pending'),
					gte(bids.windowClosesAt, new Date())
				)
			)
			.orderBy(asc(bids.windowClosesAt))
	]);

	// Process assignments
	const processedAssignments = assignmentRows.map((assignment) => {
		const lifecycle = deriveAssignmentLifecycle(
			{
				assignmentDate: assignment.date,
				assignmentStatus: assignment.status,
				confirmedAt: assignment.confirmedAt,
				shiftArrivedAt: assignment.shiftArrivedAt,
				parcelsStart: assignment.parcelsStart,
				shiftCompletedAt: assignment.shiftCompletedAt,
				routeStartTime: assignment.routeStartTime
			},
			lifecycleContext
		);

		return {
			id: assignment.id,
			date: assignment.date,
			status: assignment.status,
			confirmedAt: assignment.confirmedAt?.toISOString() ?? null,
			confirmationOpensAt: lifecycle.confirmationOpensAt.toISOString(),
			confirmationDeadline: lifecycle.confirmationDeadline.toISOString(),
			isConfirmable: lifecycle.isConfirmable,
			routeName: assignment.routeName,
			routeStartTime: assignment.routeStartTime,
			warehouseName: assignment.warehouseName,
			isCancelable: lifecycle.isCancelable,
			isLateCancel: lifecycle.isLateCancel,
			isArrivable: lifecycle.isArrivable,
			isStartable: lifecycle.isStartable,
			isCompletable: lifecycle.isCompletable,
			shift: assignment.shiftId
				? {
						id: assignment.shiftId,
						arrivedAt: assignment.shiftArrivedAt,
						parcelsStart: assignment.parcelsStart,
						parcelsDelivered: assignment.parcelsDelivered,
						parcelsReturned: assignment.parcelsReturned,
						exceptedReturns: assignment.exceptedReturns,
						exceptionNotes: assignment.exceptionNotes,
						startedAt: assignment.shiftStartedAt,
						completedAt: assignment.shiftCompletedAt,
						editableUntil: assignment.shiftEditableUntil
					}
				: null
		};
	});

	// Find today's shift: either today's assignment or any currently active shift
	const todayShift = processedAssignments.find(
		(a) => a.status === 'active' || (a.date === torontoToday && a.status !== 'cancelled')
	);

	// Calculate week summaries
	const thisWeekAssignments = processedAssignments.filter(
		(a) => a.date >= weekStartString && a.date < nextWeekStartString && a.status !== 'cancelled'
	);
	const nextWeekAssignments = processedAssignments.filter(
		(a) => a.date >= nextWeekStartString && a.status !== 'cancelled'
	);

	// Process metrics
	const metrics = metricsRow[0]
		? {
				totalShifts: metricsRow[0].totalShifts,
				completedShifts: metricsRow[0].completedShifts,
				attendanceRate: metricsRow[0].attendanceRate,
				completionRate: metricsRow[0].completionRate,
				totalAssigned: metricsRow[0].totalAssigned,
				avgParcelsDelivered: metricsRow[0].avgParcelsDelivered
			}
		: {
				totalShifts: 0,
				completedShifts: 0,
				attendanceRate: 0,
				completionRate: 0,
				totalAssigned: 0,
				avgParcelsDelivered: 0
			};

	// Process pending bids
	const pendingBids = pendingBidsRows.map((bid) => ({
		id: bid.id,
		assignmentId: bid.assignmentId,
		assignmentDate: bid.assignmentDate,
		routeName: bid.routeName,
		warehouseName: bid.warehouseName,
		bidAt: bid.bidAt?.toISOString() ?? '',
		windowClosesAt: bid.windowClosesAt.toISOString()
	}));

	// Get unconfirmed shifts within confirmation window
	const unconfirmedShifts = await getUnconfirmedAssignments(locals.user.id);

	// Determine if user is a new driver (no scheduled shifts ever)
	const isNewDriver = metrics.totalShifts === 0 && processedAssignments.length === 0;

	return json({
		todayShift: todayShift ?? null,
		thisWeek: {
			weekStart: weekStartString,
			assignedDays: thisWeekAssignments.length,
			assignments: thisWeekAssignments
		},
		nextWeek: {
			weekStart: nextWeekStartString,
			assignedDays: nextWeekAssignments.length,
			assignments: nextWeekAssignments
		},
		metrics,
		pendingBids,
		unconfirmedShifts,
		isNewDriver
	});
};
