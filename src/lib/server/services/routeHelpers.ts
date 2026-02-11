/**
 * Route Helpers
 *
 * Shared utilities for route API endpoints.
 * Centralizes status resolution and shift progress derivation.
 */

import { parseRouteStartTime } from '$lib/config/dispatchPolicy';
import type { RouteStatus, ShiftProgress } from '$lib/schemas/route';
import { getTorontoDateTimeInstant } from '$lib/server/time/toronto';

export type ShiftLifecycleFields = {
	confirmedAt: Date | null;
	arrivedAt: Date | null;
	startedAt: Date | null;
	completedAt: Date | null;
	cancelledAt: Date | null;
};

export function toLocalYmd(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function isValidDate(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isShiftStarted(date: string, routeStartTime: string): boolean {
	const { hours, minutes } = parseRouteStartTime(routeStartTime);
	const shiftStart = getTorontoDateTimeInstant(date, { hours, minutes });
	return new Date() >= shiftStart;
}

/**
 * Derive the shift progress state from assignment + shift lifecycle data.
 *
 * Uses a waterfall: terminal states (cancelled, completed) take priority,
 * then intermediate states (started, arrived), then no-show detection
 * (past start time with no arrival), then confirmation status.
 *
 * Returns null for non-assigned routes (unfilled/bidding).
 */
export function deriveShiftProgress(
	lifecycle: ShiftLifecycleFields & { status: string },
	routeStatus: RouteStatus,
	date: string,
	routeStartTime: string
): ShiftProgress | null {
	if (routeStatus !== 'assigned') return null;

	if (lifecycle.status === 'cancelled' || lifecycle.cancelledAt) return 'cancelled';
	if (lifecycle.completedAt) return 'completed';
	if (lifecycle.startedAt) return 'started';
	if (lifecycle.arrivedAt) return 'arrived';

	// No-show: past start time, assigned but no arrival
	if (isShiftStarted(date, routeStartTime) && !lifecycle.arrivedAt) {
		return 'no_show';
	}

	if (lifecycle.confirmedAt) return 'confirmed';
	return 'unconfirmed';
}
