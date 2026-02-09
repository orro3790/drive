/**
 * Metrics Generator
 *
 * Derives all driverMetrics columns from actual assignment and shift data.
 * No random generation — everything is computed from real seed records.
 */

import type { GeneratedUser } from './users';
import type { GeneratedAssignment, GeneratedShift } from './assignments';

export interface GeneratedMetric {
	userId: string;
	totalShifts: number;
	completedShifts: number;
	attendanceRate: number;
	completionRate: number;
	avgParcelsDelivered: number;
	totalAssigned: number;
	confirmedShifts: number;
	autoDroppedShifts: number;
	lateCancellations: number;
	noShows: number;
	bidPickups: number;
	arrivedOnTimeCount: number;
	highDeliveryCount: number;
	urgentPickups: number;
}

/**
 * Compute metrics for each driver from their actual assignments and shifts.
 */
export function generateMetrics(
	drivers: GeneratedUser[],
	assignments: GeneratedAssignment[],
	shifts: GeneratedShift[]
): GeneratedMetric[] {
	// Build shift lookup by assignment index (index into assignments array)
	const shiftByAssignmentIndex = new Map<number, GeneratedShift>();
	for (const shift of shifts) {
		shiftByAssignmentIndex.set(shift.assignmentIndex, shift);
	}

	// Group assignment indices by userId
	const assignmentIndicesByUser = new Map<string, number[]>();
	for (let i = 0; i < assignments.length; i++) {
		const a = assignments[i];
		if (!a.userId) continue;
		if (!assignmentIndicesByUser.has(a.userId)) {
			assignmentIndicesByUser.set(a.userId, []);
		}
		assignmentIndicesByUser.get(a.userId)!.push(i);
	}

	const metrics: GeneratedMetric[] = [];

	for (const driver of drivers) {
		if (driver.role !== 'driver') continue;

		const indices = assignmentIndicesByUser.get(driver.id) ?? [];
		const driverAssignments = indices.map((i) => ({ assignment: assignments[i], index: i }));

		// totalAssigned: all assignments where driver was assigned (not unfilled)
		const totalAssigned = driverAssignments.filter(
			(d) => d.assignment.status !== 'unfilled'
		).length;

		// completedShifts: assignments with status === 'completed'
		const completedShifts = driverAssignments.filter(
			(d) => d.assignment.status === 'completed'
		).length;

		// totalShifts: same as completedShifts
		const totalShifts = completedShifts;

		// attendanceRate: completedShifts / totalAssigned
		const attendanceRate =
			totalAssigned > 0 ? Math.round((completedShifts / totalAssigned) * 100) / 100 : 0;

		// completionRate: parcelsDelivered / parcelsStart for completed shifts
		let totalParcelsStart = 0;
		let totalParcelsDelivered = 0;
		for (const { assignment, index } of driverAssignments) {
			if (assignment.status !== 'completed') continue;
			const shift = shiftByAssignmentIndex.get(index);
			if (shift?.parcelsStart && shift?.parcelsDelivered) {
				totalParcelsStart += shift.parcelsStart;
				totalParcelsDelivered += shift.parcelsDelivered;
			}
		}
		const completionRate =
			totalParcelsStart > 0
				? Math.round((totalParcelsDelivered / totalParcelsStart) * 100) / 100
				: 0;

		// avgParcelsDelivered
		const avgParcelsDelivered =
			completedShifts > 0 ? Math.round((totalParcelsDelivered / completedShifts) * 100) / 100 : 0;

		// confirmedShifts: assignments where confirmedAt is set
		const confirmedShifts = driverAssignments.filter(
			(d) => d.assignment.confirmedAt !== null
		).length;

		// lateCancellations: cancelled + confirmedAt (confirmed then cancelled)
		const lateCancellations = driverAssignments.filter(
			(d) => d.assignment.status === 'cancelled' && d.assignment.confirmedAt !== null
		).length;

		// autoDroppedShifts: assignments with cancelType = 'auto_drop'
		const autoDroppedShifts = driverAssignments.filter(
			(d) => d.assignment.cancelType === 'auto_drop'
		).length;

		// bidPickups: assigned via bid
		const bidPickups = driverAssignments.filter((d) => d.assignment.assignedBy === 'bid').length;

		// arrivedOnTimeCount: completed/active shifts with arrivedAt before 9 AM
		let arrivedOnTimeCount = 0;
		for (const { assignment, index } of driverAssignments) {
			if (assignment.status !== 'completed' && assignment.status !== 'active') continue;
			const shift = shiftByAssignmentIndex.get(index);
			if (shift?.arrivedAt) {
				const hours = shift.arrivedAt.getHours();
				if (hours < 9) {
					arrivedOnTimeCount++;
				}
			}
		}

		// highDeliveryCount: completed shifts where delivery rate >= 95%
		let highDeliveryCount = 0;
		for (const { assignment, index } of driverAssignments) {
			if (assignment.status !== 'completed') continue;
			const shift = shiftByAssignmentIndex.get(index);
			if (shift?.parcelsStart && shift.parcelsStart > 0 && shift.parcelsDelivered) {
				if (shift.parcelsDelivered / shift.parcelsStart >= 0.95) {
					highDeliveryCount++;
				}
			}
		}

		metrics.push({
			userId: driver.id,
			totalShifts,
			completedShifts,
			attendanceRate,
			completionRate,
			avgParcelsDelivered,
			totalAssigned,
			confirmedShifts,
			autoDroppedShifts,
			lateCancellations,
			noShows: 0,
			bidPickups,
			arrivedOnTimeCount,
			highDeliveryCount,
			urgentPickups: 0
		});
	}

	return metrics;
}
