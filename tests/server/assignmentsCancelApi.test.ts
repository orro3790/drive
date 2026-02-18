import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';
import { freezeTime, resetTime } from '../harness/time';

type CancelRouteModule = typeof import('../../src/routes/api/assignments/[id]/cancel/+server');

type AssignmentStatus = 'scheduled' | 'active' | 'completed' | 'cancelled' | 'unfilled';

interface AssignmentRow {
	id: string;
	userId: string | null;
	routeId: string;
	date: string;
	status: AssignmentStatus;
	confirmedAt: Date | null;
	routeStartTime: string | null;
}

interface UpdatedAssignmentRow {
	id: string;
	status: AssignmentStatus;
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
	cancelType: 'assignments.cancelType',
	updatedAt: 'assignments.updatedAt'
};

const routesTable = {
	id: 'routes.id',
	startTime: 'routes.startTime'
};

const driverMetricsTable = {
	userId: 'driver_metrics.userId',
	lateCancellations: 'driver_metrics.lateCancellations',
	updatedAt: 'driver_metrics.updatedAt'
};

let POST: CancelRouteModule['POST'];

let selectWhereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<AssignmentRow[]>>>;
let selectFromMock: ReturnType<
	typeof vi.fn<
		(table: unknown) => {
			leftJoin: typeof selectLeftJoinMock;
		}
	>
>;
let selectLeftJoinMock: ReturnType<
	typeof vi.fn<
		(
			joinTable: unknown,
			onClause: unknown
		) => {
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

let assignmentUpdateReturningMock: ReturnType<
	typeof vi.fn<(shape: Record<string, unknown>) => Promise<UpdatedAssignmentRow[]>>
>;
let assignmentUpdateWhereMock: ReturnType<
	typeof vi.fn<
		(whereClause: unknown) => {
			returning: typeof assignmentUpdateReturningMock;
		}
	>
>;
let assignmentUpdateSetMock: ReturnType<
	typeof vi.fn<
		(values: Record<string, unknown>) => {
			where: typeof assignmentUpdateWhereMock;
		}
	>
>;

let metricsUpdateWhereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<unknown[]>>>;
let metricsUpdateSetMock: ReturnType<
	typeof vi.fn<
		(values: Record<string, unknown>) => {
			where: typeof metricsUpdateWhereMock;
		}
	>
>;

let updateMock: ReturnType<
	typeof vi.fn<
		(table: unknown) =>
			| {
					set: typeof assignmentUpdateSetMock;
			  }
			| {
					set: typeof metricsUpdateSetMock;
			  }
	>
>;

let createAssignmentLifecycleContextMock: ReturnType<typeof vi.fn<() => { torontoToday: string }>>;
let deriveAssignmentLifecycleMock: ReturnType<
	typeof vi.fn<(input: unknown, context: unknown) => LifecycleOutput>
>;
let sendManagerAlertMock: ReturnType<
	typeof vi.fn<(routeId: string, type: string, payload: unknown) => Promise<void>>
>;
let createAuditLogMock: ReturnType<typeof vi.fn<(entry: Record<string, unknown>) => Promise<void>>>;
let createBidWindowMock: ReturnType<
	typeof vi.fn<
		(
			assignmentId: string,
			options: {
				organizationId: string;
				trigger: 'cancellation';
			}
		) => Promise<unknown>
	>
>;
let broadcastAssignmentUpdatedMock: ReturnType<
	typeof vi.fn<(organizationId: string, payload: Record<string, unknown>) => void>
>;

function createLifecycleOutput(overrides: Partial<LifecycleOutput> = {}): LifecycleOutput {
	return {
		confirmationOpensAt: new Date('2026-02-01T00:00:00.000Z'),
		confirmationDeadline: new Date('2026-02-08T00:00:00.000Z'),
		isCancelable: true,
		isLateCancel: false,
		isConfirmable: false,
		isArrivable: false,
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

	selectWhereMock = vi.fn<(whereClause: unknown) => Promise<AssignmentRow[]>>(async () => []);
	selectLeftJoinMock = vi.fn<
		(joinTable: unknown, onClause: unknown) => { where: typeof selectWhereMock }
	>(() => ({
		where: selectWhereMock
	}));
	selectFromMock = vi.fn<(table: unknown) => { leftJoin: typeof selectLeftJoinMock }>(() => ({
		leftJoin: selectLeftJoinMock
	}));
	selectMock = vi.fn<(shape: Record<string, unknown>) => { from: typeof selectFromMock }>(() => ({
		from: selectFromMock
	}));

	assignmentUpdateReturningMock = vi.fn<
		(shape: Record<string, unknown>) => Promise<UpdatedAssignmentRow[]>
	>(async () => []);
	assignmentUpdateWhereMock = vi.fn<
		(whereClause: unknown) => { returning: typeof assignmentUpdateReturningMock }
	>(() => ({ returning: assignmentUpdateReturningMock }));
	assignmentUpdateSetMock = vi.fn<
		(values: Record<string, unknown>) => { where: typeof assignmentUpdateWhereMock }
	>(() => ({ where: assignmentUpdateWhereMock }));

	metricsUpdateWhereMock = vi.fn<(whereClause: unknown) => Promise<unknown[]>>(async () => []);
	metricsUpdateSetMock = vi.fn<
		(values: Record<string, unknown>) => { where: typeof metricsUpdateWhereMock }
	>(() => ({ where: metricsUpdateWhereMock }));

	updateMock = vi.fn((table: unknown) => {
		if (table === assignmentsTable) {
			return {
				set: assignmentUpdateSetMock
			};
		}

		return {
			set: metricsUpdateSetMock
		};
	});

	createAssignmentLifecycleContextMock = vi.fn(() => ({ torontoToday: '2026-02-09' }));
	deriveAssignmentLifecycleMock = vi.fn(() => createLifecycleOutput());
	createBidWindowMock = vi.fn(async () => ({ success: true, bidWindowId: 'bid-window-1' }));
	sendManagerAlertMock = vi.fn(async () => undefined);
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
		driverMetrics: driverMetricsTable,
		routes: routesTable
	}));

	vi.doMock('drizzle-orm', () => ({
		eq: (left: unknown, right: unknown) => ({ left, right }),
		and: (...conditions: unknown[]) => ({ conditions }),
		ne: (left: unknown, right: unknown) => ({ operator: 'ne', left, right }),
		sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
			strings: Array.from(strings),
			values
		})
	}));

	vi.doMock('$lib/server/services/assignmentLifecycle', () => ({
		createAssignmentLifecycleContext: createAssignmentLifecycleContextMock,
		deriveAssignmentLifecycle: deriveAssignmentLifecycleMock
	}));

	vi.doMock('$lib/server/services/notifications', () => ({
		sendManagerAlert: sendManagerAlertMock
	}));

	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: createAuditLogMock
	}));

	vi.doMock('$lib/server/services/bidding', () => ({
		createBidWindow: createBidWindowMock
	}));

	vi.doMock('$lib/server/realtime/managerSse', () => ({
		broadcastAssignmentUpdated: broadcastAssignmentUpdatedMock
	}));

	({ POST } = await import('../../src/routes/api/assignments/[id]/cancel/+server'));
});

afterEach(() => {
	resetTime();
	vi.clearAllMocks();
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/services/assignmentLifecycle');
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/services/bidding');
	vi.doUnmock('$lib/server/realtime/managerSse');
});

describe('POST /api/assignments/[id]/cancel contract', () => {
	it('returns 401 when no user is present', async () => {
		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-1' },
			body: { reason: 'other' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 401 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-driver role', async () => {
		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-1' },
			locals: { user: createUser('manager', 'manager-1') },
			body: { reason: 'other' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 403 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 400 for invalid request body', async () => {
		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { reason: 'invalid_reason' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 404 when assignment is not found', async () => {
		selectWhereMock.mockResolvedValue([]);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-missing' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { reason: 'other' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 404 });
	});

	it('returns 403 when assignment belongs to another driver', async () => {
		selectWhereMock.mockResolvedValue([
			{
				id: 'assignment-1',
				userId: 'driver-2',
				routeId: 'route-1',
				date: '2026-02-10',
				status: 'scheduled',
				confirmedAt: null,
				routeStartTime: '09:00'
			}
		]);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { reason: 'other' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 403 });
	});

	it('returns 200 for idempotent replay when assignment is already cancelled', async () => {
		selectWhereMock.mockResolvedValue([
			{
				id: 'assignment-1',
				userId: 'driver-1',
				routeId: 'route-1',
				date: '2026-02-10',
				status: 'cancelled',
				confirmedAt: null,
				routeStartTime: '09:00'
			}
		]);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { reason: 'other' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			assignment: {
				id: 'assignment-1',
				status: 'cancelled'
			},
			alreadyCancelled: true,
			replacementWindow: {
				status: 'created',
				bidWindowId: 'bid-window-1',
				reason: null
			}
		});

		expect(createBidWindowMock).toHaveBeenCalledWith('assignment-1', {
			organizationId: 'org-test',
			trigger: 'cancellation'
		});
	});

	it('returns 400 when lifecycle marks assignment as not cancelable', async () => {
		freezeTime('2026-02-09T12:00:00.000Z');
		deriveAssignmentLifecycleMock.mockReturnValue(createLifecycleOutput({ isCancelable: false }));
		selectWhereMock.mockResolvedValue([
			{
				id: 'assignment-1',
				userId: 'driver-1',
				routeId: 'route-1',
				date: '2026-02-09',
				status: 'scheduled',
				confirmedAt: new Date('2026-02-08T12:00:00.000Z'),
				routeStartTime: '09:00'
			}
		]);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { reason: 'other' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
	});

	it('returns 200 with cancelled assignment payload and opens cancellation bid window', async () => {
		freezeTime('2026-02-09T12:00:00.000Z');
		selectWhereMock.mockResolvedValue([
			{
				id: 'assignment-1',
				userId: 'driver-1',
				routeId: 'route-1',
				date: '2026-02-10',
				status: 'scheduled',
				confirmedAt: null,
				routeStartTime: '11:00'
			}
		]);
		assignmentUpdateReturningMock.mockResolvedValue([{ id: 'assignment-1', status: 'cancelled' }]);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { reason: 'other' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			assignment: {
				id: 'assignment-1',
				status: 'cancelled'
			},
			replacementWindow: {
				status: 'created',
				bidWindowId: 'bid-window-1',
				reason: null
			}
		});

		expect(createBidWindowMock).toHaveBeenCalledWith('assignment-1', {
			organizationId: 'org-test',
			trigger: 'cancellation'
		});
		expect(deriveAssignmentLifecycleMock).toHaveBeenCalledWith(
			expect.objectContaining({
				assignmentDate: '2026-02-10',
				routeStartTime: '11:00'
			}),
			expect.any(Object)
		);
		expect(createAuditLogMock).toHaveBeenCalledTimes(1);
		expect(sendManagerAlertMock).toHaveBeenCalledTimes(1);
		expect(broadcastAssignmentUpdatedMock).toHaveBeenCalledWith(
			'org-test',
			expect.objectContaining({
				assignmentId: 'assignment-1',
				status: 'cancelled',
				driverId: 'driver-1'
			})
		);
		expect(metricsUpdateWhereMock).not.toHaveBeenCalled();
	});

	it('returns 200 when replacement window already exists', async () => {
		freezeTime('2026-02-09T12:00:00.000Z');
		selectWhereMock.mockResolvedValue([
			{
				id: 'assignment-1',
				userId: 'driver-1',
				routeId: 'route-1',
				date: '2026-02-10',
				status: 'scheduled',
				confirmedAt: null,
				routeStartTime: '09:00'
			}
		]);
		assignmentUpdateReturningMock.mockResolvedValue([{ id: 'assignment-1', status: 'cancelled' }]);
		createBidWindowMock.mockResolvedValue({
			success: false,
			reason: 'Open bid window already exists for this assignment'
		});

		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { reason: 'other' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			assignment: {
				id: 'assignment-1',
				status: 'cancelled'
			},
			replacementWindow: {
				status: 'already_open',
				bidWindowId: null,
				reason: 'Open bid window already exists for this assignment'
			}
		});
	});

	it('returns 200 even when replacement window creation fails', async () => {
		freezeTime('2026-02-09T12:00:00.000Z');
		selectWhereMock.mockResolvedValue([
			{
				id: 'assignment-1',
				userId: 'driver-1',
				routeId: 'route-1',
				date: '2026-02-10',
				status: 'scheduled',
				confirmedAt: null,
				routeStartTime: '09:00'
			}
		]);
		assignmentUpdateReturningMock.mockResolvedValue([{ id: 'assignment-1', status: 'cancelled' }]);
		createBidWindowMock.mockResolvedValue({
			success: false,
			reason: 'Failed to create bid window'
		});

		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { reason: 'other' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			assignment: {
				id: 'assignment-1',
				status: 'cancelled'
			},
			replacementWindow: {
				status: 'not_created',
				bidWindowId: null,
				reason: 'Failed to create bid window'
			}
		});
	});
});
