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
import { addDays, parseISO, differenceInCalendarDays } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';
import { getWeekStart } from '$lib/server/services/scheduling';
import { getExpiredBidWindows, resolveBidWindow } from '$lib/server/services/bidding';
import {
	calculateConfirmationDeadline,
	getUnconfirmedAssignments
} from '$lib/server/services/confirmations';
import logger from '$lib/server/logger';

const TORONTO_TZ = 'America/Toronto';

function toTorontoDateString(date: Date): string {
	return format(toZonedTime(date, TORONTO_TZ), 'yyyy-MM-dd');
}

function getHoursUntilShift(dateString: string, nowToronto: Date): number {
	const torontoToday = format(nowToronto, 'yyyy-MM-dd');
	const dayDiff = differenceInCalendarDays(parseISO(dateString), parseISO(torontoToday));
	const currentMinutes = nowToronto.getHours() * 60 + nowToronto.getMinutes();
	return (dayDiff * 24 * 60 - currentMinutes) / 60;
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
	const torontoNow = toZonedTime(new Date(), TORONTO_TZ);
	const torontoToday = format(torontoNow, 'yyyy-MM-dd');

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
				warehouseName: warehouses.name,
				shiftId: shifts.id,
				parcelsStart: shifts.parcelsStart,
				parcelsDelivered: shifts.parcelsDelivered,
				parcelsReturned: shifts.parcelsReturned,
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
			.where(and(eq(bids.userId, locals.user.id), eq(bids.status, 'pending')))
			.orderBy(asc(bids.windowClosesAt))
	]);

	// Process assignments
	const processedAssignments = assignmentRows.map((assignment) => {
		const isCancelable = assignment.date > torontoToday && assignment.status !== 'cancelled';
		const hoursUntilShift = getHoursUntilShift(assignment.date, torontoNow);
		const isLateCancel = isCancelable && hoursUntilShift <= 48;
		const isToday = assignment.date === torontoToday;
		const isArrivable =
			isToday &&
			assignment.status === 'scheduled' &&
			assignment.confirmedAt !== null &&
			!assignment.shiftArrivedAt;
		const isStartable =
			assignment.status === 'active' &&
			assignment.shiftArrivedAt !== null &&
			assignment.parcelsStart === null;
		const isCompletable =
			assignment.status === 'active' &&
			assignment.parcelsStart !== null &&
			assignment.shiftCompletedAt === null;

		// Confirmation window data
		const { opensAt, deadline } = calculateConfirmationDeadline(assignment.date);
		const isConfirmable =
			!assignment.confirmedAt &&
			assignment.status === 'scheduled' &&
			torontoNow >= opensAt &&
			torontoNow <= deadline;

		return {
			id: assignment.id,
			date: assignment.date,
			status: assignment.status,
			confirmedAt: assignment.confirmedAt?.toISOString() ?? null,
			confirmationOpensAt: opensAt.toISOString(),
			confirmationDeadline: deadline.toISOString(),
			isConfirmable,
			routeName: assignment.routeName,
			warehouseName: assignment.warehouseName,
			isCancelable,
			isLateCancel,
			isArrivable,
			isStartable,
			isCompletable,
			shift: assignment.shiftId
				? {
						id: assignment.shiftId,
						arrivedAt: assignment.shiftArrivedAt,
						parcelsStart: assignment.parcelsStart,
						parcelsDelivered: assignment.parcelsDelivered,
						parcelsReturned: assignment.parcelsReturned,
						startedAt: assignment.shiftStartedAt,
						completedAt: assignment.shiftCompletedAt,
						editableUntil: assignment.shiftEditableUntil
					}
				: null
		};
	});

	// Find today's shift
	const todayShift = processedAssignments.find(
		(a) => a.date === torontoToday && a.status !== 'cancelled'
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
				completionRate: metricsRow[0].completionRate
			}
		: {
				totalShifts: 0,
				completedShifts: 0,
				attendanceRate: 0,
				completionRate: 0
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
