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
	routeStartTime: string;
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
	completedAt: 'shifts.completedAt'
};

const driverMetricsTable = {
	userId: 'driver_metrics.userId',
	arrivedOnTimeCount: 'driver_metrics.arrivedOnTimeCount',
	updatedAt: 'driver_metrics.updatedAt'
};

let POST: ArriveRouteModule['POST'];

let selectWhereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<unknown[]>>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let selectChainMock: any;
let selectMock: ReturnType<
	typeof vi.fn<
		(shape: Record<string, unknown>) => {
			from: typeof selectChainMock.from;
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
let calculateArrivalDeadlineMock: ReturnType<
	typeof vi.fn<(date: string, tz?: string, startTime?: string | null) => Date>
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
		email: `${id}@example.test`,
		organizationId: 'org-test'
	} as App.Locals['user'];
}

beforeEach(async () => {
	vi.resetModules();

	selectWhereMock = vi.fn<(whereClause: unknown) => Promise<unknown[]>>(async () => []);
	const createSelectChain = () => {
		const chain: Record<string, unknown> = {
			from: vi.fn(() => chain),
			innerJoin: vi.fn((_table: unknown, _on: unknown) => chain),
			where: vi.fn((whereClause: unknown) => {
				const promise = selectWhereMock(whereClause);
				const thenableChain: Record<string, unknown> = {
					limit: vi.fn(() => thenableChain),
					then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
						promise.then(resolve, reject),
					catch: (reject: (e: unknown) => void) => promise.catch(reject)
				};
				return thenableChain;
			}),
			limit: vi.fn(() => chain)
		};
		return chain;
	};
	selectChainMock = createSelectChain();
	selectMock = vi.fn<
		(shape: Record<string, unknown>) => {
			from: typeof selectChainMock.from;
		}
	>(() => selectChainMock);

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
	calculateArrivalDeadlineMock = vi.fn((date: string, _tz?: string, startTime?: string | null) => {
		// Default 9 AM Toronto (UTC-5) = 14:00 UTC
		const st = startTime ?? '09:00';
		const [h, m] = st.split(':').map(Number);
		// Approximate: Toronto is UTC-5 in winter
		return new Date(
			`${date}T${String(h + 5).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
		);
	});
	createAuditLogMock = vi.fn(async () => undefined);
	broadcastAssignmentUpdatedMock = vi.fn();
	freezeTime('2026-02-09T13:00:00.000Z');

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			insert: insertMock,
			update: updateMock,
			transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
				callback({ select: selectMock, insert: insertMock, update: updateMock })
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
		inArray: (left: unknown, values: unknown[]) => ({ left, values }),
		isNotNull: (left: unknown) => ({ operator: 'isNotNull', left }),
		isNull: (left: unknown) => ({ operator: 'isNull', left }),
		sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
			strings: Array.from(strings),
			values
		})
	}));

	vi.doMock('$lib/server/services/assignmentLifecycle', () => ({
		createAssignmentLifecycleContext: createAssignmentLifecycleContextMock,
		deriveAssignmentLifecycle: deriveAssignmentLifecycleMock,
		calculateArrivalDeadline: calculateArrivalDeadlineMock
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
			confirmedAt: new Date('2026-02-08T12:00:00.000Z'),
			routeStartTime: '09:00'
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
			confirmedAt: new Date('2026-02-08T12:00:00.000Z'),
			routeStartTime: '09:00'
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
			confirmedAt: null,
			routeStartTime: '09:00'
		};

		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
	});

	it('returns 400 when current time is at/after route start time cutoff', async () => {
		freezeTime('2026-02-09T14:00:00.000Z');
		calculateArrivalDeadlineMock.mockReturnValue(new Date('2026-02-09T14:00:00.000Z'));

		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			date: '2026-02-09',
			status: 'scheduled',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z'),
			routeStartTime: '09:00'
		};

		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
	});

	it('enforces per-route start time cutoff (early 07:30 route)', async () => {
		// 07:30 Toronto = 12:30 UTC
		freezeTime('2026-02-09T12:30:00.000Z');
		calculateArrivalDeadlineMock.mockReturnValue(new Date('2026-02-09T12:30:00.000Z'));

		const assignment: AssignmentRow = {
			id: 'assignment-early',
			userId: 'driver-1',
			date: '2026-02-09',
			status: 'scheduled',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z'),
			routeStartTime: '07:30'
		};

		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
		expect(calculateArrivalDeadlineMock).toHaveBeenCalledWith('2026-02-09', undefined, '07:30');
	});

	it('allows arrival before per-route start time (late 11:00 route)', async () => {
		// 10:59 Toronto = 15:59 UTC, route starts 11:00
		freezeTime('2026-02-09T15:59:00.000Z');
		calculateArrivalDeadlineMock.mockReturnValue(new Date('2026-02-09T16:00:00.000Z'));

		createAssignmentLifecycleContextMock.mockReturnValue({ torontoToday: '2026-02-09' });

		const assignment: AssignmentRow = {
			id: 'assignment-late',
			userId: 'driver-1',
			date: '2026-02-09',
			status: 'scheduled',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z'),
			routeStartTime: '11:00'
		};

		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);
		insertReturningMock.mockResolvedValueOnce([
			{
				id: 'shift-late',
				arrivedAt: new Date('2026-02-09T15:59:00.000Z')
			}
		]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
	});

	it('enforces the route start time cutoff across DST spring-forward boundaries', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-dst',
			userId: 'driver-1',
			date: '2026-03-08',
			status: 'scheduled',
			confirmedAt: new Date('2026-03-07T12:00:00.000Z'),
			routeStartTime: '09:00'
		};

		createAssignmentLifecycleContextMock
			.mockReturnValueOnce({ torontoToday: '2026-03-08' })
			.mockReturnValueOnce({ torontoToday: '2026-03-08' });

		// Before cutoff: 09:00 EDT = 13:00 UTC on spring-forward day
		freezeTime('2026-03-08T12:59:59.000Z');
		calculateArrivalDeadlineMock.mockReturnValue(new Date('2026-03-08T13:00:00.000Z'));
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

		// At cutoff
		freezeTime('2026-03-08T13:00:00.000Z');
		calculateArrivalDeadlineMock.mockReturnValue(new Date('2026-03-08T13:00:00.000Z'));
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

	it('enforces the route start time cutoff across DST fall-back boundaries', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-dst-fall',
			userId: 'driver-1',
			date: '2026-11-01',
			status: 'scheduled',
			confirmedAt: new Date('2026-10-31T12:00:00.000Z'),
			routeStartTime: '09:00'
		};

		createAssignmentLifecycleContextMock
			.mockReturnValueOnce({ torontoToday: '2026-11-01' })
			.mockReturnValueOnce({ torontoToday: '2026-11-01' });

		// Before cutoff: 09:00 EST = 14:00 UTC on fall-back day
		freezeTime('2026-11-01T13:59:59.000Z');
		calculateArrivalDeadlineMock.mockReturnValue(new Date('2026-11-01T14:00:00.000Z'));
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
		calculateArrivalDeadlineMock.mockReturnValue(new Date('2026-11-01T14:00:00.000Z'));
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
			confirmedAt: new Date('2026-02-08T12:00:00.000Z'),
			routeStartTime: '09:00'
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
			confirmedAt: new Date('2026-02-08T12:00:00.000Z'),
			routeStartTime: '09:00'
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
			confirmedAt: new Date('2026-02-08T12:00:00.000Z'),
			routeStartTime: '09:00'
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
			'org-test',
			expect.objectContaining({
				assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb',
				status: 'active',
				driverId: 'driver-1'
			})
		);
	});

	it('passes routeStartTime through to lifecycle derivation', async () => {
		// 07:30 Toronto = 12:30 UTC; freeze time before that deadline
		freezeTime('2026-02-09T12:00:00.000Z');

		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1',
			date: '2026-02-09',
			status: 'scheduled',
			confirmedAt: new Date('2026-02-08T12:00:00.000Z'),
			routeStartTime: '07:30'
		};

		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);
		insertReturningMock.mockResolvedValueOnce([
			{ id: 'shift-1', arrivedAt: new Date('2026-02-09T12:00:00.000Z') }
		]);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver', 'driver-1') },
			body: { assignmentId: '10cfac3e-c728-4dbb-b41f-7c5d7a71c2cb' }
		});

		await POST(event as Parameters<typeof POST>[0]);

		expect(deriveAssignmentLifecycleMock).toHaveBeenCalledWith(
			expect.objectContaining({ routeStartTime: '07:30' }),
			expect.any(Object)
		);
		expect(calculateArrivalDeadlineMock).toHaveBeenCalledWith('2026-02-09', undefined, '07:30');
	});
});
