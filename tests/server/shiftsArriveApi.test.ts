import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';
import { freezeTime, resetTime } from '../harness/time';

type ArriveRouteModule = typeof import('../../src/routes/api/shifts/arrive/+server');

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
	confirmedAt: 'assignments.confirmedAt',
	updatedAt: 'assignments.updatedAt'
};

const shiftsTable = {
	id: 'shifts.id',
	assignmentId: 'shifts.assignmentId',
	arrivedAt: 'shifts.arrivedAt',
	parcelsStart: 'shifts.parcelsStart',
	completedAt: 'shifts.completedAt'
};

const driverMetricsTable = {
	userId: 'driver_metrics.userId',
	arrivedOnTimeCount: 'driver_metrics.arrivedOnTimeCount',
	updatedAt: 'driver_metrics.updatedAt'
};

let POST: ArriveRouteModule['POST'];

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

let insertReturningMock: ReturnType<
	typeof vi.fn<(shape: Record<string, unknown>) => Promise<Array<{ id: string; arrivedAt: Date }>>>
>;
let insertValuesMock: ReturnType<
	typeof vi.fn<
		(values: Record<string, unknown>) => {
			returning: typeof insertReturningMock;
		}
	>
>;
let insertMock: ReturnType<
	typeof vi.fn<
		(table: unknown) => {
			values: typeof insertValuesMock;
		}
	>
>;

let updateWhereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<unknown[]>>>;
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
	typeof vi.fn<(payload: Record<string, unknown>) => void>
>;

function createLifecycleOutput(overrides: Partial<LifecycleOutput> = {}): LifecycleOutput {
	return {
		confirmationOpensAt: new Date('2026-02-01T00:00:00.000Z'),
		confirmationDeadline: new Date('2026-02-08T00:00:00.000Z'),
		isCancelable: false,
		isLateCancel: false,
		isConfirmable: false,
		isArrivable: true,
		isStartable: false,
		isCompletable: false,
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

	insertReturningMock = vi.fn<
		(shape: Record<string, unknown>) => Promise<Array<{ id: string; arrivedAt: Date }>>
	>(async () => []);
	insertValuesMock = vi.fn<
		(values: Record<string, unknown>) => { returning: typeof insertReturningMock }
	>(() => ({ returning: insertReturningMock }));
	insertMock = vi.fn<(table: unknown) => { values: typeof insertValuesMock }>(() => ({
		values: insertValuesMock
	}));

	updateWhereMock = vi.fn<(whereClause: unknown) => Promise<unknown[]>>(async () => []);
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
	freezeTime('2026-02-09T13:00:00.000Z');

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			insert: insertMock,
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

	({ POST } = await import('../../src/routes/api/shifts/arrive/+server'));
});

afterEach(() => {
	resetTime();
	vi.clearAllMocks();
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/services/assignmentLifecycle');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/realtime/managerSse');
});

describe('POST /api/shifts/arrive contract', () => {
	it('returns 401 when no user is present', async () => {
		const event = createRequestEvent({
			method: 'POST',
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 401 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-driver role', async () => {
		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('manager', 'manager-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 403 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 400 for invalid payload', async () => {
		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: 'not-a-uuid' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 404 when assignment does not exist', async () => {
		selectWhereMock.mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 404 });
	});

	it('returns 403 when assignment belongs to another driver', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-2',
			date: '2026-02-09',
			status: 'scheduled',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 403 });
		expect(selectWhereMock).toHaveBeenCalledTimes(1);
	});

	it('returns 400 when assignment is not for today in Toronto', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			date: '2026-02-10',
			status: 'scheduled',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};

		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
	});

	it('returns 400 when assignment is unconfirmed', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			date: '2026-02-09',
			status: 'scheduled',
			confirmedAt: null
		};

		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
	});

	it('returns 400 when current time is at/after 9 AM Toronto cutoff', async () => {
		freezeTime('2026-02-09T14:00:00.000Z');

		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			date: '2026-02-09',
			status: 'scheduled',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};

		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
	});

	it('enforces the 9 AM Toronto cutoff across DST spring-forward boundaries', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-dst',
			userId: 'driver-1',
			date: '2026-03-08',
			status: 'scheduled',
			confirmedAt: new Date('2026-03-07T12:00:00.000Z')
		};

		createAssignmentLifecycleContextMock
			.mockReturnValueOnce({ torontoToday: '2026-03-08' })
			.mockReturnValueOnce({ torontoToday: '2026-03-08' });

		freezeTime('2026-03-08T12:59:59.000Z');
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);
		insertReturningMock.mockResolvedValueOnce([
			{
				id: 'shift-dst',
				arrivedAt: new Date('2026-03-08T12:59:59.000Z')
			}
		]);

		const beforeCutoffEvent = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		const beforeCutoffResponse = await POST(beforeCutoffEvent as Parameters<typeof POST>[0]);
		expect(beforeCutoffResponse.status).toBe(200);

		freezeTime('2026-03-08T13:00:00.000Z');
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);

		const atCutoffEvent = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(atCutoffEvent as Parameters<typeof POST>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('enforces the 9 AM Toronto cutoff across DST fall-back boundaries', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-dst-fall',
			userId: 'driver-1',
			date: '2026-11-01',
			status: 'scheduled',
			confirmedAt: new Date('2026-10-31T12:00:00.000Z')
		};

		createAssignmentLifecycleContextMock
			.mockReturnValueOnce({ torontoToday: '2026-11-01' })
			.mockReturnValueOnce({ torontoToday: '2026-11-01' });

		freezeTime('2026-11-01T13:59:59.000Z');
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);
		insertReturningMock.mockResolvedValueOnce([
			{
				id: 'shift-dst-fall',
				arrivedAt: new Date('2026-11-01T13:59:59.000Z')
			}
		]);

		const beforeCutoffEvent = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		const beforeCutoffResponse = await POST(beforeCutoffEvent as Parameters<typeof POST>[0]);
		expect(beforeCutoffResponse.status).toBe(200);

		freezeTime('2026-11-01T14:00:00.000Z');
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);

		const atCutoffEvent = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(atCutoffEvent as Parameters<typeof POST>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns 409 when assignment is not arrivable by lifecycle rules', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			date: '2026-02-09',
			status: 'scheduled',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);
		deriveAssignmentLifecycleMock.mockReturnValue(createLifecycleOutput({ isArrivable: false }));

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 409 when shift record already exists', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			date: '2026-02-09',
			status: 'scheduled',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};
		const existingShift: ShiftRow = {
			id: 'shift-1',
			arrivedAt: new Date('2026-02-09T11:00:00.000Z'),
			parcelsStart: null,
			completedAt: null
		};

		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([existingShift]);
		deriveAssignmentLifecycleMock.mockReturnValue(createLifecycleOutput({ isArrivable: true }));

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});

	it('returns 200 with success payload and arrived timestamp', async () => {
		freezeTime('2026-02-09T13:00:00.000Z');

		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			date: '2026-02-09',
			status: 'scheduled',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z')
		};

		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);
		insertReturningMock.mockResolvedValueOnce([
			{
				id: 'shift-1',
				arrivedAt: new Date('2026-02-09T13:00:00.000Z')
			}
		]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			arrivedAt: '2026-02-09T13:00:00.000Z'
		});
		expect(insertMock).toHaveBeenCalledWith(shiftsTable);
		expect(updateMock).toHaveBeenCalledTimes(2);
		expect(createAuditLogMock).toHaveBeenCalledTimes(1);
		expect(broadcastAssignmentUpdatedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb',
				status: 'active',
				driverId: 'driver-1'
			})
		);
	});
});
