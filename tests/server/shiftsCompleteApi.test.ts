import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type CompleteRouteModule = typeof import('../../src/routes/api/shifts/complete/+server');

interface AssignmentRow {
	id: string;
	userId: string | null;
	routeId: string;
	date: string;
	status: 'scheduled' | 'active' | 'completed' | 'cancelled' | 'unfilled';
	confirmedAt: Date | null;
}

interface ShiftRow {
	id: string;
	arrivedAt: Date | null;
	parcelsStart: number | null;
	completedAt: Date | null;
}

interface UpdatedShiftRow {
	id: string;
	parcelsStart: number | null;
	parcelsDelivered: number | null;
	parcelsReturned: number | null;
	startedAt: Date | null;
	completedAt: Date | null;
	editableUntil: Date | null;
}

interface LifecycleOutput {
	confirmationOpensAt: Date;
	confirmationDeadline: Date;
	isCancelable: boolean;
	isLateCancel: boolean;
	isConfirmable: boolean;
	isArrivable: boolean;
	isStartable: boolean;
	isCompletable: boolean;
}

const assignmentsTable = {
	id: 'assignments.id',
	userId: 'assignments.userId',
	routeId: 'assignments.routeId',
	date: 'assignments.date',
	status: 'assignments.status',
	confirmedAt: 'assignments.confirmedAt',
	updatedAt: 'assignments.updatedAt'
};

const shiftsTable = {
	id: 'shifts.id',
	assignmentId: 'shifts.assignmentId',
	arrivedAt: 'shifts.arrivedAt',
	parcelsStart: 'shifts.parcelsStart',
	parcelsDelivered: 'shifts.parcelsDelivered',
	parcelsReturned: 'shifts.parcelsReturned',
	startedAt: 'shifts.startedAt',
	completedAt: 'shifts.completedAt',
	editableUntil: 'shifts.editableUntil'
};

const driverMetricsTable = {
	userId: 'driver_metrics.userId',
	highDeliveryCount: 'driver_metrics.highDeliveryCount',
	updatedAt: 'driver_metrics.updatedAt'
};

let POST: CompleteRouteModule['POST'];

let selectWhereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<unknown[]>>>;
let selectFromMock: ReturnType<
	typeof vi.fn<
		(table: unknown) => {
			where: typeof selectWhereMock;
		}
	>
>;
let selectMock: ReturnType<
	typeof vi.fn<
		(shape: Record<string, unknown>) => {
			from: typeof selectFromMock;
		}
	>
>;

let shiftUpdateReturningMock: ReturnType<
	typeof vi.fn<(shape: Record<string, unknown>) => Promise<UpdatedShiftRow[]>>
>;
let shiftUpdateWhereMock: ReturnType<
	typeof vi.fn<
		(whereClause: unknown) => {
			returning: typeof shiftUpdateReturningMock;
		}
	>
>;
let shiftUpdateSetMock: ReturnType<
	typeof vi.fn<
		(values: Record<string, unknown>) => {
			where: typeof shiftUpdateWhereMock;
		}
	>
>;

let nonReturningUpdateWhereMock: ReturnType<
	typeof vi.fn<(whereClause: unknown) => Promise<unknown[]>>
>;
let nonReturningUpdateSetMock: ReturnType<
	typeof vi.fn<
		(values: Record<string, unknown>) => {
			where: typeof nonReturningUpdateWhereMock;
		}
	>
>;

let updateMock: ReturnType<
	typeof vi.fn<
		(table: unknown) =>
			| {
					set: typeof shiftUpdateSetMock;
			  }
			| {
					set: typeof nonReturningUpdateSetMock;
			  }
	>
>;

let createAssignmentLifecycleContextMock: ReturnType<typeof vi.fn<() => Record<string, unknown>>>;
let deriveAssignmentLifecycleMock: ReturnType<
	typeof vi.fn<(input: unknown, context: unknown) => LifecycleOutput>
>;
let createAuditLogMock: ReturnType<typeof vi.fn<(entry: Record<string, unknown>) => Promise<void>>>;
let broadcastAssignmentUpdatedMock: ReturnType<
	typeof vi.fn<(payload: Record<string, unknown>) => void>
>;
let recordRouteCompletionMock: ReturnType<
	typeof vi.fn<(payload: { userId: string; routeId: string; completedAt: Date }) => Promise<void>>
>;
let updateDriverMetricsServiceMock: ReturnType<typeof vi.fn<(userId: string) => Promise<void>>>;

function createLifecycleOutput(overrides: Partial<LifecycleOutput> = {}): LifecycleOutput {
	return {
		confirmationOpensAt: new Date('2026-02-01T00:00:00.000Z'),
		confirmationDeadline: new Date('2026-02-08T00:00:00.000Z'),
		isCancelable: false,
		isLateCancel: false,
		isConfirmable: false,
		isArrivable: false,
		isStartable: false,
		isCompletable: true,
		...overrides
	};
}

function createUser(role: 'driver' | 'manager', id: string): App.Locals['user'] {
	return {
		id,
		role,
		name: `${role}-${id}`,
		email: `${id}@example.test`
	} as App.Locals['user'];
}

beforeEach(async () => {
	vi.resetModules();

	selectWhereMock = vi.fn<(whereClause: unknown) => Promise<unknown[]>>(async () => []);
	selectFromMock = vi.fn<(table: unknown) => { where: typeof selectWhereMock }>(() => ({
		where: selectWhereMock
	}));
	selectMock = vi.fn<(shape: Record<string, unknown>) => { from: typeof selectFromMock }>(() => ({
		from: selectFromMock
	}));

	shiftUpdateReturningMock = vi.fn<(shape: Record<string, unknown>) => Promise<UpdatedShiftRow[]>>(
		async () => []
	);
	shiftUpdateWhereMock = vi.fn<
		(whereClause: unknown) => { returning: typeof shiftUpdateReturningMock }
	>(() => ({ returning: shiftUpdateReturningMock }));
	shiftUpdateSetMock = vi.fn<
		(values: Record<string, unknown>) => { where: typeof shiftUpdateWhereMock }
	>(() => ({ where: shiftUpdateWhereMock }));

	nonReturningUpdateWhereMock = vi.fn<(whereClause: unknown) => Promise<unknown[]>>(async () => []);
	nonReturningUpdateSetMock = vi.fn<
		(values: Record<string, unknown>) => { where: typeof nonReturningUpdateWhereMock }
	>(() => ({ where: nonReturningUpdateWhereMock }));

	updateMock = vi.fn((table: unknown) => {
		if (table === shiftsTable) {
			return { set: shiftUpdateSetMock };
		}

		return { set: nonReturningUpdateSetMock };
	});

	createAssignmentLifecycleContextMock = vi.fn(() => ({ torontoToday: '2026-02-09' }));
	deriveAssignmentLifecycleMock = vi.fn(() => createLifecycleOutput());
	createAuditLogMock = vi.fn(async () => undefined);
	broadcastAssignmentUpdatedMock = vi.fn();
	recordRouteCompletionMock = vi.fn(async () => undefined);
	updateDriverMetricsServiceMock = vi.fn(async () => undefined);

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			update: updateMock
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		assignments: assignmentsTable,
		driverMetrics: driverMetricsTable,
		shifts: shiftsTable
	}));

	vi.doMock('drizzle-orm', () => ({
		eq: (left: unknown, right: unknown) => ({ left, right }),
		sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
			strings: Array.from(strings),
			values
		})
	}));

	vi.doMock('$lib/server/services/assignmentLifecycle', () => ({
		createAssignmentLifecycleContext: createAssignmentLifecycleContextMock,
		deriveAssignmentLifecycle: deriveAssignmentLifecycleMock
	}));

	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: createAuditLogMock
	}));

	vi.doMock('$lib/server/realtime/managerSse', () => ({
		broadcastAssignmentUpdated: broadcastAssignmentUpdatedMock
	}));

	vi.doMock('$lib/server/services/metrics', () => ({
		recordRouteCompletion: recordRouteCompletionMock,
		updateDriverMetrics: updateDriverMetricsServiceMock
	}));

	({ POST } = await import('../../src/routes/api/shifts/complete/+server'));
});

afterEach(() => {
	vi.clearAllMocks();
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/services/assignmentLifecycle');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/realtime/managerSse');
	vi.doUnmock('$lib/server/services/metrics');
});

describe('POST /api/shifts/complete contract', () => {
	it('returns 401 when no user is present', async () => {
		const event = createRequestEvent({
			method: 'POST',
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 401 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-driver role', async () => {
		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('manager', 'manager-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 403 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it.each([
		{ assignmentId: 'not-a-uuid', parcelsReturned: 0 },
		{ assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: -1 }
	])('returns 400 for invalid payload %j', async (body) => {
		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 404 when assignment is missing', async () => {
		selectWhereMock.mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 404 });
	});

	it('returns 409 when assignment has no assigned driver', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: null,
			routeId: 'route-1',
			date: '2026-02-09',
			status: 'active',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 403 when assignment ownership does not match', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-2',
			routeId: 'route-1',
			date: '2026-02-09',
			status: 'active',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 403 });
	});

	it('returns 409 when assignment is not active', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			routeId: 'route-1',
			date: '2026-02-09',
			status: 'scheduled',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 404 when shift is missing', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			routeId: 'route-1',
			date: '2026-02-09',
			status: 'active',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 404 });
	});

	it('returns 409 when lifecycle reports not completable', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			routeId: 'route-1',
			date: '2026-02-09',
			status: 'active',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		const shift: ShiftRow = {
			id: 'shift-1',
			arrivedAt: new Date('2026-02-09T10:00:00.000Z'),
			parcelsStart: 10,
			completedAt: null
		};
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([shift]);
		deriveAssignmentLifecycleMock.mockReturnValue(createLifecycleOutput({ isCompletable: false }));

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 409 when shift is already completed', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			routeId: 'route-1',
			date: '2026-02-09',
			status: 'active',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		const shift: ShiftRow = {
			id: 'shift-1',
			arrivedAt: new Date('2026-02-09T10:00:00.000Z'),
			parcelsStart: 10,
			completedAt: new Date('2026-02-09T14:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([shift]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 409 when parcels were never recorded', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			routeId: 'route-1',
			date: '2026-02-09',
			status: 'active',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		const shift: ShiftRow = {
			id: 'shift-1',
			arrivedAt: new Date('2026-02-09T10:00:00.000Z'),
			parcelsStart: null,
			completedAt: null
		};
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([shift]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 400 when parcelsReturned exceeds parcelsStart', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			routeId: 'route-1',
			date: '2026-02-09',
			status: 'active',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		const shift: ShiftRow = {
			id: 'shift-1',
			arrivedAt: new Date('2026-02-09T10:00:00.000Z'),
			parcelsStart: 10,
			completedAt: null
		};
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([shift]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 11 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
	});

	it('returns 200 with completed shift payload and assignmentStatus completed', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			routeId: 'route-1',
			date: '2026-02-09',
			status: 'active',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		const shift: ShiftRow = {
			id: 'shift-1',
			arrivedAt: new Date('2026-02-09T10:00:00.000Z'),
			parcelsStart: 10,
			completedAt: null
		};
		const updatedShift: UpdatedShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsDelivered: 8,
			parcelsReturned: 2,
			startedAt: new Date('2026-02-09T10:15:00.000Z'),
			completedAt: new Date('2026-02-09T17:00:00.000Z'),
			editableUntil: new Date('2026-02-09T18:00:00.000Z')
		};

		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([shift]);
		shiftUpdateReturningMock.mockResolvedValueOnce([updatedShift]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 2 }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			shift: {
				id: 'shift-1',
				parcelsStart: 10,
				parcelsDelivered: 8,
				parcelsReturned: 2,
				startedAt: '2026-02-09T10:15:00.000Z',
				completedAt: '2026-02-09T17:00:00.000Z',
				editableUntil: '2026-02-09T18:00:00.000Z'
			},
			assignmentStatus: 'completed'
		});

		expect(createAuditLogMock).toHaveBeenCalledTimes(2);
		expect(recordRouteCompletionMock).toHaveBeenCalledWith({
			userId: 'driver-1',
			routeId: 'route-1',
			completedAt: expect.any(Date)
		});
		expect(updateDriverMetricsServiceMock).toHaveBeenCalledWith('driver-1');
		expect(updateMock).toHaveBeenCalledTimes(2);
		expect(broadcastAssignmentUpdatedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb',
				status: 'completed',
				driverId: 'driver-1',
				routeId: 'route-1'
			})
		);
		expect(nonReturningUpdateWhereMock).toHaveBeenCalledTimes(1);
	});
});
