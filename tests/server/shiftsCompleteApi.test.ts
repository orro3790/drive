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
	routeName: string;
	routeStartTime: string;
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
	exceptedReturns: number | null;
	exceptionNotes: string | null;
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

const routesTable = {
	id: 'routes.id',
	name: 'routes.name',
	startTime: 'routes.startTime'
};

const shiftsTable = {
	id: 'shifts.id',
	assignmentId: 'shifts.assignmentId',
	arrivedAt: 'shifts.arrivedAt',
	parcelsStart: 'shifts.parcelsStart',
	parcelsDelivered: 'shifts.parcelsDelivered',
	parcelsReturned: 'shifts.parcelsReturned',
	exceptedReturns: 'shifts.exceptedReturns',
	exceptionNotes: 'shifts.exceptionNotes',
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
let selectChainMock: {
	from: ReturnType<typeof vi.fn>;
	innerJoin: ReturnType<typeof vi.fn>;
	where: typeof selectWhereMock;
};
let selectMock: ReturnType<
	typeof vi.fn<
		(shape: Record<string, unknown>) => {
			from: typeof selectChainMock.from;
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
	typeof vi.fn<(organizationId: string, payload: Record<string, unknown>) => void>
>;
let recordRouteCompletionMock: ReturnType<
	typeof vi.fn<
		(payload: {
			userId: string;
			routeId: string;
			completedAt: Date;
			organizationId: string;
		}) => Promise<void>
	>
>;
let updateDriverMetricsServiceMock: ReturnType<
	typeof vi.fn<(userId: string, organizationId: string) => Promise<void>>
>;
let sendManagerAlertMock: ReturnType<
	typeof vi.fn<
		(
			routeId: string,
			type: string,
			data: Record<string, unknown>,
			organizationId: string
		) => Promise<void>
	>
>;

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
		email: `${id}@example.test`,
		organizationId: 'org-test'
	} as App.Locals['user'];
}

function createAssignment(overrides: Partial<AssignmentRow> = {}): AssignmentRow {
	return {
		id: 'assignment-1',
		userId: 'driver-1',
		routeId: 'route-1',
		date: '2026-02-09',
		status: 'active',
		confirmedAt: new Date('2026-02-08T12:00:00.000Z'),
		routeName: 'Route Alpha',
		routeStartTime: '09:00',
		...overrides
	};
}

function createShift(overrides: Partial<ShiftRow> = {}): ShiftRow {
	return {
		id: 'shift-1',
		arrivedAt: new Date('2026-02-09T10:00:00.000Z'),
		parcelsStart: 10,
		completedAt: null,
		...overrides
	};
}

beforeEach(async () => {
	vi.resetModules();

	selectWhereMock = vi.fn<(whereClause: unknown) => Promise<unknown[]>>(async () => []);
	selectChainMock = {
		from: vi.fn(() => selectChainMock),
		innerJoin: vi.fn((_table: unknown, _on: unknown) => selectChainMock),
		where: selectWhereMock
	};
	selectMock = vi.fn<
		(shape: Record<string, unknown>) => {
			from: typeof selectChainMock.from;
		}
	>(() => selectChainMock);

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
	sendManagerAlertMock = vi.fn(async () => undefined);

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			update: updateMock,
			transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
				callback({ select: selectMock, update: updateMock })
			)
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		assignments: assignmentsTable,
		driverMetrics: driverMetricsTable,
		routes: routesTable,
		shifts: shiftsTable
	}));

	vi.doMock('drizzle-orm', () => ({
		eq: (left: unknown, right: unknown) => ({ left, right }),
		and: (...conditions: unknown[]) => ({ conditions }),
		isNull: (field: unknown) => ({ operator: 'isNull', field }),
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

	vi.doMock('$lib/server/services/notifications', () => ({
		sendManagerAlert: sendManagerAlertMock
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => ({
				info: vi.fn(),
				debug: vi.fn(),
				warn: vi.fn(),
				error: vi.fn()
			}))
		}
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
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/logger');
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

	it('returns 400 when exceptedReturns exceeds parcelsReturned', async () => {
		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: {
				assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb',
				parcelsReturned: 3,
				exceptedReturns: 4,
				exceptionNotes: 'damaged parcels'
			}
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 400 when exceptedReturns > 0 but no exceptionNotes provided', async () => {
		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: {
				assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb',
				parcelsReturned: 3,
				exceptedReturns: 2
			}
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
		selectWhereMock.mockResolvedValueOnce([createAssignment({ userId: null })]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 403 when assignment ownership does not match', async () => {
		selectWhereMock.mockResolvedValueOnce([createAssignment({ userId: 'driver-2' })]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 403 });
	});

	it('returns 409 when assignment is not active', async () => {
		selectWhereMock.mockResolvedValueOnce([createAssignment({ status: 'scheduled' })]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 404 when shift is missing', async () => {
		selectWhereMock.mockResolvedValueOnce([createAssignment()]).mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 404 });
	});

	it('returns 409 when lifecycle reports not completable', async () => {
		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift()]);
		deriveAssignmentLifecycleMock.mockReturnValue(createLifecycleOutput({ isCompletable: false }));

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 409 when shift is already completed', async () => {
		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift({ completedAt: new Date('2026-02-09T14:00:00.000Z') })]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 409 when parcels were never recorded', async () => {
		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift({ parcelsStart: null })]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 400 when parcelsReturned exceeds parcelsStart', async () => {
		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift()]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 11 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
	});

	it('returns 200 with completed shift payload and assignmentStatus completed', async () => {
		const updatedShift: UpdatedShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsDelivered: 8,
			parcelsReturned: 2,
			exceptedReturns: 0,
			exceptionNotes: null,
			startedAt: new Date('2026-02-09T10:15:00.000Z'),
			completedAt: new Date('2026-02-09T17:00:00.000Z'),
			editableUntil: new Date('2026-02-09T18:00:00.000Z')
		};

		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift()]);
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
				exceptedReturns: 0,
				exceptionNotes: null,
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
			completedAt: expect.any(Date),
			organizationId: 'org-test'
		});
		expect(updateDriverMetricsServiceMock).toHaveBeenCalledWith('driver-1', 'org-test');
		expect(updateMock).toHaveBeenCalledTimes(2);
		expect(broadcastAssignmentUpdatedMock).toHaveBeenCalledWith(
			'org-test',
			expect.objectContaining({
				assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb',
				status: 'completed',
				driverId: 'driver-1',
				routeId: 'route-1'
			})
		);
		expect(nonReturningUpdateWhereMock).toHaveBeenCalledTimes(1);
		expect(sendManagerAlertMock).not.toHaveBeenCalled();
	});

	it('passes routeStartTime through to lifecycle derivation', async () => {
		const updatedShift: UpdatedShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsDelivered: 10,
			parcelsReturned: 0,
			exceptedReturns: 0,
			exceptionNotes: null,
			startedAt: new Date('2026-02-09T10:15:00.000Z'),
			completedAt: new Date('2026-02-09T17:00:00.000Z'),
			editableUntil: new Date('2026-02-09T18:00:00.000Z')
		};

		selectWhereMock
			.mockResolvedValueOnce([createAssignment({ routeStartTime: '07:30' })])
			.mockResolvedValueOnce([createShift()]);
		shiftUpdateReturningMock.mockResolvedValueOnce([updatedShift]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 0 }
		});

		await POST(event as Parameters<typeof POST>[0]);

		expect(deriveAssignmentLifecycleMock).toHaveBeenCalledWith(
			expect.objectContaining({ routeStartTime: '07:30' }),
			expect.any(Object)
		);
	});

	it('sends manager alert when exceptedReturns > 0', async () => {
		const updatedShift: UpdatedShiftRow = {
			id: 'shift-1',
			parcelsStart: 100,
			parcelsDelivered: 95,
			parcelsReturned: 5,
			exceptedReturns: 3,
			exceptionNotes: 'Damaged parcels at depot',
			startedAt: new Date('2026-02-09T10:15:00.000Z'),
			completedAt: new Date('2026-02-09T17:00:00.000Z'),
			editableUntil: new Date('2026-02-09T18:00:00.000Z')
		};

		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift({ parcelsStart: 100 })]);
		shiftUpdateReturningMock.mockResolvedValueOnce([updatedShift]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: {
				assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb',
				parcelsReturned: 5,
				exceptedReturns: 3,
				exceptionNotes: 'Damaged parcels at depot'
			}
		});

		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(sendManagerAlertMock).toHaveBeenCalledWith(
			'route-1',
			'return_exception',
			{
				routeName: 'Route Alpha',
				driverName: 'driver-driver-1',
				date: '2026-02-09',
				routeStartTime: '09:00'
			},
			'org-test'
		);
	});

	it('includes exception data in shift audit log', async () => {
		const updatedShift: UpdatedShiftRow = {
			id: 'shift-1',
			parcelsStart: 50,
			parcelsDelivered: 45,
			parcelsReturned: 5,
			exceptedReturns: 2,
			exceptionNotes: 'Customer refused',
			startedAt: new Date('2026-02-09T10:15:00.000Z'),
			completedAt: new Date('2026-02-09T17:00:00.000Z'),
			editableUntil: new Date('2026-02-09T18:00:00.000Z')
		};

		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift({ parcelsStart: 50 })]);
		shiftUpdateReturningMock.mockResolvedValueOnce([updatedShift]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: {
				assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb',
				parcelsReturned: 5,
				exceptedReturns: 2,
				exceptionNotes: 'Customer refused'
			}
		});

		await POST(event as Parameters<typeof POST>[0]);

		// Second audit log call is for the shift
		const shiftAuditCall = createAuditLogMock.mock.calls[1][0];
		expect(shiftAuditCall).toEqual(
			expect.objectContaining({
				entityType: 'shift',
				action: 'complete',
				changes: expect.objectContaining({
					exceptedReturns: 2,
					exceptionNotes: 'Customer refused'
				})
			})
		);
	});

	it('counts adjusted delivery rate for high delivery metric (excepted returns included)', async () => {
		// 100 start, 5 returned, 3 excepted → adjusted = (95 + 3) / 100 = 0.98 ≥ 0.95 → high delivery
		const updatedShift: UpdatedShiftRow = {
			id: 'shift-1',
			parcelsStart: 100,
			parcelsDelivered: 95,
			parcelsReturned: 5,
			exceptedReturns: 3,
			exceptionNotes: 'Damaged in transit',
			startedAt: new Date('2026-02-09T10:15:00.000Z'),
			completedAt: new Date('2026-02-09T17:00:00.000Z'),
			editableUntil: new Date('2026-02-09T18:00:00.000Z')
		};

		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift({ parcelsStart: 100 })]);
		shiftUpdateReturningMock.mockResolvedValueOnce([updatedShift]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: {
				assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb',
				parcelsReturned: 5,
				exceptedReturns: 3,
				exceptionNotes: 'Damaged in transit'
			}
		});

		await POST(event as Parameters<typeof POST>[0]);

		// Should trigger high delivery metric update (shifts + driverMetrics + assignments = 3 updates)
		expect(updateMock).toHaveBeenCalledTimes(3);
		// nonReturningUpdateWhereMock is called for both driverMetrics and assignments
		expect(nonReturningUpdateWhereMock).toHaveBeenCalledTimes(2);
	});

	it('does not bump high delivery metric when adjusted rate is below 95%', async () => {
		// 10 start, 2 returned, 0 excepted → adjusted = (8 + 0) / 10 = 0.80 < 0.95 → no high delivery
		const updatedShift: UpdatedShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsDelivered: 8,
			parcelsReturned: 2,
			exceptedReturns: 0,
			exceptionNotes: null,
			startedAt: new Date('2026-02-09T10:15:00.000Z'),
			completedAt: new Date('2026-02-09T17:00:00.000Z'),
			editableUntil: new Date('2026-02-09T18:00:00.000Z')
		};

		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift()]);
		shiftUpdateReturningMock.mockResolvedValueOnce([updatedShift]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsReturned: 2 }
		});

		await POST(event as Parameters<typeof POST>[0]);

		// Only shifts + assignments = 2 updates (no driverMetrics)
		expect(updateMock).toHaveBeenCalledTimes(2);
		expect(nonReturningUpdateWhereMock).toHaveBeenCalledTimes(1);
	});
});
