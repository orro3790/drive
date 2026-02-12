import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';
import { freezeTime, resetTime } from '../harness/time';

type EditRouteModule = typeof import('../../src/routes/api/shifts/[assignmentId]/edit/+server');

interface AssignmentRow {
	id: string;
	userId: string | null;
	routeId: string;
	date: string;
	routeName: string;
}

interface ShiftRow {
	id: string;
	parcelsStart: number | null;
	parcelsReturned: number | null;
	parcelsDelivered: number | null;
	exceptedReturns: number | null;
	exceptionNotes: string | null;
	completedAt: Date | null;
	editableUntil: Date | null;
}

interface UpdatedShiftRow {
	id: string;
	parcelsStart: number;
	parcelsDelivered: number;
	parcelsReturned: number;
	exceptedReturns: number;
	exceptionNotes: string | null;
	startedAt: Date | null;
	completedAt: Date;
	editableUntil: Date;
}

const assignmentsTable = {
	id: 'assignments.id',
	userId: 'assignments.userId',
	routeId: 'assignments.routeId',
	date: 'assignments.date'
};

const routesTable = {
	id: 'routes.id',
	name: 'routes.name'
};

const shiftsTable = {
	id: 'shifts.id',
	assignmentId: 'shifts.assignmentId',
	parcelsStart: 'shifts.parcelsStart',
	parcelsReturned: 'shifts.parcelsReturned',
	parcelsDelivered: 'shifts.parcelsDelivered',
	exceptedReturns: 'shifts.exceptedReturns',
	exceptionNotes: 'shifts.exceptionNotes',
	startedAt: 'shifts.startedAt',
	completedAt: 'shifts.completedAt',
	editableUntil: 'shifts.editableUntil'
};

let PATCH: EditRouteModule['PATCH'];

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

let updateReturningMock: ReturnType<
	typeof vi.fn<(shape: Record<string, unknown>) => Promise<UpdatedShiftRow[]>>
>;
let updateWhereMock: ReturnType<
	typeof vi.fn<
		(whereClause: unknown) => {
			returning: typeof updateReturningMock;
		}
	>
>;
let updateSetMock: ReturnType<
	typeof vi.fn<
		(values: Record<string, unknown>) => {
			where: typeof updateWhereMock;
		}
	>
>;
let updateMock: ReturnType<
	typeof vi.fn<
		(table: unknown) => {
			set: typeof updateSetMock;
		}
	>
>;

let createAuditLogMock: ReturnType<typeof vi.fn<(entry: Record<string, unknown>) => Promise<void>>>;
let updateDriverMetricsMock: ReturnType<
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
		routeName: 'Route Alpha',
		...overrides
	};
}

function createShift(overrides: Partial<ShiftRow> = {}): ShiftRow {
	return {
		id: 'shift-1',
		parcelsStart: 10,
		parcelsReturned: 2,
		parcelsDelivered: 8,
		exceptedReturns: 0,
		exceptionNotes: null,
		completedAt: new Date('2026-02-09T09:00:00.000Z'),
		editableUntil: new Date('2099-01-01T00:00:00.000Z'),
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

	updateReturningMock = vi.fn<(shape: Record<string, unknown>) => Promise<UpdatedShiftRow[]>>(
		async () => []
	);
	updateWhereMock = vi.fn<(whereClause: unknown) => { returning: typeof updateReturningMock }>(
		() => ({
			returning: updateReturningMock
		})
	);
	updateSetMock = vi.fn<(values: Record<string, unknown>) => { where: typeof updateWhereMock }>(
		() => ({
			where: updateWhereMock
		})
	);
	updateMock = vi.fn<(table: unknown) => { set: typeof updateSetMock }>(() => ({
		set: updateSetMock
	}));

	createAuditLogMock = vi.fn(async () => undefined);
	updateDriverMetricsMock = vi.fn(async () => undefined);
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
		routes: routesTable,
		shifts: shiftsTable
	}));

	vi.doMock('drizzle-orm', () => ({
		eq: (left: unknown, right: unknown) => ({ left, right }),
		and: (...conditions: unknown[]) => ({ conditions }),
		gt: (left: unknown, right: unknown) => ({ operator: 'gt', left, right }),
		isNotNull: (field: unknown) => ({ operator: 'isNotNull', field })
	}));

	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: createAuditLogMock
	}));

	vi.doMock('$lib/server/services/metrics', () => ({
		updateDriverMetrics: updateDriverMetricsMock
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

	({ PATCH } = await import('../../src/routes/api/shifts/[assignmentId]/edit/+server'));
});

afterEach(() => {
	resetTime();
	vi.clearAllMocks();
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/services/metrics');
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/logger');
});

describe('PATCH /api/shifts/[assignmentId]/edit contract', () => {
	it('returns 401 when no user is present', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 401
		});
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-driver role', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('manager', 'manager-1') },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 403
		});
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 400 for invalid schema body', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsStart: 0 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 400 when no editable fields are provided', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: {}
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 404 when assignment is missing', async () => {
		selectWhereMock.mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 404
		});
	});

	it('returns 403 when assignment ownership does not match', async () => {
		selectWhereMock.mockResolvedValueOnce([createAssignment({ userId: 'driver-2' })]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 403
		});
		expect(selectWhereMock).toHaveBeenCalledTimes(1);
	});

	it('returns 404 when shift record is missing', async () => {
		selectWhereMock.mockResolvedValueOnce([createAssignment()]).mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 404
		});
	});

	it('returns 400 when shift is not completed yet', async () => {
		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift({ completedAt: null })]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns 400 when edit window has expired', async () => {
		freezeTime('2026-02-09T12:00:00.000Z');

		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([
				createShift({ editableUntil: new Date('2026-02-09T10:00:00.000Z') })
			]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns 400 when parcel data is missing on existing shift', async () => {
		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift({ parcelsStart: null })]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 2 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns 400 when returns exceed starting parcel count', async () => {
		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift()]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 11 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns 400 when excepted returns exceed total returns', async () => {
		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift({ parcelsReturned: 3 })]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { exceptedReturns: 4 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns 400 when excepted returns > 0 but notes are empty', async () => {
		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift()]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { exceptedReturns: 1, exceptionNotes: '   ' }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns 200 with success payload and updated shift', async () => {
		const updatedShift: UpdatedShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsReturned: 3,
			parcelsDelivered: 7,
			exceptedReturns: 0,
			exceptionNotes: null,
			startedAt: new Date('2026-02-09T07:00:00.000Z'),
			completedAt: new Date('2026-02-09T09:00:00.000Z'),
			editableUntil: new Date('2099-01-01T00:00:00.000Z')
		};

		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift()]);
		updateReturningMock.mockResolvedValueOnce([updatedShift]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 3 }
		});

		const response = await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			shift: {
				id: 'shift-1',
				parcelsStart: 10,
				parcelsDelivered: 7,
				parcelsReturned: 3,
				exceptedReturns: 0,
				exceptionNotes: null,
				startedAt: '2026-02-09T07:00:00.000Z',
				completedAt: '2026-02-09T09:00:00.000Z',
				editableUntil: '2099-01-01T00:00:00.000Z'
			}
		});
		expect(createAuditLogMock).toHaveBeenCalledTimes(1);
		expect(updateDriverMetricsMock).toHaveBeenCalledWith('driver-1', 'org-test');
		expect(sendManagerAlertMock).not.toHaveBeenCalled();
	});

	it('sends manager alert on 0-to->0 exception transition', async () => {
		const updatedShift: UpdatedShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsReturned: 2,
			parcelsDelivered: 8,
			exceptedReturns: 1,
			exceptionNotes: 'Damaged parcel',
			startedAt: new Date('2026-02-09T07:00:00.000Z'),
			completedAt: new Date('2026-02-09T09:00:00.000Z'),
			editableUntil: new Date('2099-01-01T00:00:00.000Z')
		};

		// Shift previously had 0 excepted returns
		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift({ exceptedReturns: 0 })]);
		updateReturningMock.mockResolvedValueOnce([updatedShift]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { exceptedReturns: 1, exceptionNotes: 'Damaged parcel' }
		});

		await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(sendManagerAlertMock).toHaveBeenCalledWith(
			'route-1',
			'return_exception',
			{
				routeName: 'Route Alpha',
				driverName: 'driver-driver-1',
				date: '2026-02-09'
			},
			'org-test'
		);
	});

	it('does not send manager alert when exceptions already existed', async () => {
		const updatedShift: UpdatedShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsReturned: 2,
			parcelsDelivered: 8,
			exceptedReturns: 2,
			exceptionNotes: 'Updated notes',
			startedAt: new Date('2026-02-09T07:00:00.000Z'),
			completedAt: new Date('2026-02-09T09:00:00.000Z'),
			editableUntil: new Date('2099-01-01T00:00:00.000Z')
		};

		// Shift previously had 1 excepted return (not a 0→>0 transition)
		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([
				createShift({ exceptedReturns: 1, exceptionNotes: 'Original notes' })
			]);
		updateReturningMock.mockResolvedValueOnce([updatedShift]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { exceptedReturns: 2, exceptionNotes: 'Updated notes' }
		});

		await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(sendManagerAlertMock).not.toHaveBeenCalled();
	});

	it('includes exception before/after in audit log', async () => {
		const updatedShift: UpdatedShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsReturned: 2,
			parcelsDelivered: 8,
			exceptedReturns: 1,
			exceptionNotes: 'Damaged parcel',
			startedAt: new Date('2026-02-09T07:00:00.000Z'),
			completedAt: new Date('2026-02-09T09:00:00.000Z'),
			editableUntil: new Date('2099-01-01T00:00:00.000Z')
		};

		selectWhereMock
			.mockResolvedValueOnce([createAssignment()])
			.mockResolvedValueOnce([createShift()]);
		updateReturningMock.mockResolvedValueOnce([updatedShift]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { exceptedReturns: 1, exceptionNotes: 'Damaged parcel' }
		});

		await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(createAuditLogMock).toHaveBeenCalledWith(
			expect.objectContaining({
				entityType: 'shift',
				action: 'edit',
				changes: {
					before: expect.objectContaining({
						exceptedReturns: 0,
						exceptionNotes: null
					}),
					after: expect.objectContaining({
						exceptedReturns: 1,
						exceptionNotes: 'Damaged parcel'
					})
				}
			}),
			expect.anything() // transaction context
		);
	});
});
