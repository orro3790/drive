import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type StartRouteModule = typeof import('../../src/routes/api/shifts/start/+server');

interface AssignmentRow {
	id: string;
	userId: string | null;
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

interface StartShiftResponse {
	id: string;
	parcelsStart: number;
	startedAt: Date;
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
	date: 'assignments.date',
	status: 'assignments.status',
	confirmedAt: 'assignments.confirmedAt'
};

const shiftsTable = {
	id: 'shifts.id',
	assignmentId: 'shifts.assignmentId',
	arrivedAt: 'shifts.arrivedAt',
	parcelsStart: 'shifts.parcelsStart',
	completedAt: 'shifts.completedAt',
	startedAt: 'shifts.startedAt',
	cancelledAt: 'shifts.cancelledAt'
};

let POST: StartRouteModule['POST'];

let selectWhereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<unknown[]>>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let selectChainMock: any;
let selectMock: ReturnType<typeof vi.fn>;

let updateReturningMock: ReturnType<
	typeof vi.fn<(shape: Record<string, unknown>) => Promise<StartShiftResponse[]>>
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

let createAssignmentLifecycleContextMock: ReturnType<typeof vi.fn<() => Record<string, unknown>>>;
let deriveAssignmentLifecycleMock: ReturnType<
	typeof vi.fn<(input: unknown, context: unknown) => LifecycleOutput>
>;
let createAuditLogMock: ReturnType<typeof vi.fn<(entry: Record<string, unknown>) => Promise<void>>>;
let broadcastAssignmentUpdatedMock: ReturnType<
	typeof vi.fn<(organizationId: string, payload: Record<string, unknown>) => void>
>;

function createLifecycleOutput(overrides: Partial<LifecycleOutput> = {}): LifecycleOutput {
	return {
		confirmationOpensAt: new Date('2026-02-01T00:00:00.000Z'),
		confirmationDeadline: new Date('2026-02-08T00:00:00.000Z'),
		isCancelable: false,
		isLateCancel: false,
		isConfirmable: false,
		isArrivable: false,
		isStartable: true,
		isCompletable: false,
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

beforeEach(async () => {
	vi.resetModules();

	selectWhereMock = vi.fn<(whereClause: unknown) => Promise<unknown[]>>(async () => []);
	selectChainMock = {
		from: vi.fn(() => selectChainMock),
		innerJoin: vi.fn((_table: unknown, _on: unknown) => selectChainMock),
		where: vi.fn((whereClause: unknown) => {
			const promise = selectWhereMock(whereClause);
			return Object.assign(promise, {
				limit: vi.fn(() => promise)
			});
		})
	};
	selectMock = vi.fn(() => selectChainMock);

	updateReturningMock = vi.fn<(shape: Record<string, unknown>) => Promise<StartShiftResponse[]>>(
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

	createAssignmentLifecycleContextMock = vi.fn(() => ({ torontoToday: '2026-02-09' }));
	deriveAssignmentLifecycleMock = vi.fn(() => createLifecycleOutput());
	createAuditLogMock = vi.fn(async () => undefined);
	broadcastAssignmentUpdatedMock = vi.fn();

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
		shifts: shiftsTable,
		user: {
			id: 'user.id',
			organizationId: 'user.organizationId'
		},
		warehouses: {
			id: 'warehouses.id',
			organizationId: 'warehouses.organizationId'
		}
	}));

	vi.doMock('drizzle-orm', () => ({
		eq: (left: unknown, right: unknown) => ({ left, right }),
		and: (...conditions: unknown[]) => ({ conditions }),
		inArray: (field: unknown, values: unknown[]) => ({ operator: 'inArray', field, values }),
		isNotNull: (field: unknown) => ({ operator: 'isNotNull', field }),
		isNull: (field: unknown) => ({ operator: 'isNull', field })
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

	({ POST } = await import('../../src/routes/api/shifts/start/+server'));
});

afterEach(() => {
	vi.clearAllMocks();
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/services/assignmentLifecycle');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/realtime/managerSse');
	vi.doUnmock('$lib/server/logger');
});

describe('POST /api/shifts/start contract', () => {
	it('returns 401 when no user is present', async () => {
		const event = createRequestEvent({
			method: 'POST',
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsStart: 10 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 401 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-driver role', async () => {
		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('manager', 'manager-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsStart: 10 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 403 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it.each([
		{ assignmentId: 'not-a-uuid', parcelsStart: 5 },
		{ assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsStart: 1000 }
	])('returns 400 for invalid payload %j', async (body) => {
		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 404 when assignment does not exist', async () => {
		selectWhereMock.mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsStart: 10 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 404 });
	});

	it('returns 403 when assignment ownership does not match', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-2',
			date: '2026-02-09',
			status: 'active',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsStart: 10 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 403 });
		expect(selectWhereMock).toHaveBeenCalledTimes(1);
	});

	it('returns 409 when assignment status is not active', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			date: '2026-02-09',
			status: 'scheduled',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsStart: 10 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
		expect(selectWhereMock).toHaveBeenCalledTimes(2);
	});

	it('returns 404 when shift is missing', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			date: '2026-02-09',
			status: 'active',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsStart: 10 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 404 });
	});

	it('returns 409 when lifecycle says shift is not startable', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
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
		selectWhereMock
			.mockResolvedValueOnce([assignment])
			.mockResolvedValueOnce([]) // incomplete shift check
			.mockResolvedValueOnce([shift]);
		deriveAssignmentLifecycleMock.mockReturnValue(createLifecycleOutput({ isStartable: false }));

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsStart: 10 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 409 when parcel inventory already exists', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			date: '2026-02-09',
			status: 'active',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		const shift: ShiftRow = {
			id: 'shift-1',
			arrivedAt: new Date('2026-02-09T10:00:00.000Z'),
			parcelsStart: 5,
			completedAt: null
		};
		selectWhereMock
			.mockResolvedValueOnce([assignment])
			.mockResolvedValueOnce([]) // incomplete shift check
			.mockResolvedValueOnce([shift]);
		deriveAssignmentLifecycleMock.mockReturnValue(createLifecycleOutput({ isStartable: true }));

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsStart: 10 }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 200 with shift payload and active assignment status', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
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
		selectWhereMock
			.mockResolvedValueOnce([assignment])
			.mockResolvedValueOnce([]) // incomplete shift check
			.mockResolvedValueOnce([shift]);
		updateReturningMock.mockResolvedValueOnce([
			{
				id: 'shift-1',
				parcelsStart: 10,
				startedAt: new Date('2026-02-09T10:15:00.000Z')
			}
		]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb', parcelsStart: 10 }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			shift: {
				id: 'shift-1',
				parcelsStart: 10,
				startedAt: '2026-02-09T10:15:00.000Z'
			},
			assignmentStatus: 'active'
		});
		expect(createAuditLogMock).toHaveBeenCalledTimes(1);
		expect(broadcastAssignmentUpdatedMock).toHaveBeenCalledWith(
			'org-test',
			expect.objectContaining({
				assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb',
				status: 'active',
				driverId: 'driver-1'
			})
		);
	});
});
