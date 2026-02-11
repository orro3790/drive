/**
 * Types for the driver shift history API response.
 *
 * Used by GET /api/drivers/[id]/shifts and the DriverShiftHistoryTable component.
 */

export type DriverShiftRecord = {
	assignmentId: string;
	date: string; // YYYY-MM-DD (Toronto TZ)
	routeName: string;
	warehouseName: string;
	status: 'completed' | 'cancelled';
	parcelsStart: number | null;
	parcelsDelivered: number | null;
	parcelsReturned: number | null;
	exceptedReturns: number | null;
	exceptionNotes: string | null;
	arrivedAt: string | null;
	startedAt: string | null;
	completedAt: string | null;
	cancelType: string | null;
};

export type DriverShiftHistoryResponse = {
	driverName: string;
	shifts: DriverShiftRecord[];
};
