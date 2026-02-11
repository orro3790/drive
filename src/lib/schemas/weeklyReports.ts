export type WeekSummary = {
	weekStart: string; // YYYY-MM-DD (Monday)
	weekEnd: string; // YYYY-MM-DD (Sunday)
	weekLabel: string; // "Week of Feb 9, 2026"
	totalDelivered: number;
	totalReturned: number;
	totalExcepted: number;
	shiftCount: number;
};

export type WeeklyReportsResponse = { weeks: WeekSummary[] };

export type WeekShiftRecord = {
	assignmentId: string;
	date: string;
	routeName: string;
	warehouseName: string;
	driverName: string;
	parcelsStart: number | null;
	parcelsDelivered: number | null;
	parcelsReturned: number | null;
	exceptedReturns: number;
	exceptionNotes: string | null;
	completedAt: string | null;
};

export type WeekDetailResponse = {
	weekStart: string;
	weekEnd: string;
	shifts: WeekShiftRecord[];
};
