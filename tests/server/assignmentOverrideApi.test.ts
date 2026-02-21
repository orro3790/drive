import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';
import { freezeTime, resetTime } from '../harness/time';

type OverrideRouteModule = typeof import('../../src/routes/api/assignments/[id]/override/+server');

type SelectResult = unknown;

const ASSIGNMENT_ID = '11111111-1111-4111-8111-111111111111';

const assignmentsTable = {
	id: 'assignments.id',
	status: 'assignments.status',
	userId: 'assignments.userId',
	routeId: 'assignments.routeId',
	warehouseId: 'assignments.warehouseId',
	date: 'assignments.date'
};

const routesTable = {
	id: 'routes.id',
	name: 'routes.name',
	startTime: 'routes.startTime'
};

const warehousesTable = {
	id: 'warehouses.id',
	name: 'warehouses.name'
};

const userTable = {
	id: 'user.id',
	name: 'user.name'
};

const bidWindowsTable = {
	id: 'bid_windows.id',
	assignmentId: 'bid_windows.assignmentId',
	mode: 'bid_windows.mode',
	status: 'bid_windows.status',
	closesAt: 'bid_windows.closesAt',
	opensAt: 'bid_windows.opensAt',
	winnerId: 'bid_windows.winnerId',
	payBonusPercent: 'bid_windows.payBonusPercent'
};

const bidsTable = {
	id: 'bids.id',
	bidWindowId: 'bids.bidWindowId',
	status: 'bids.status',
	resolvedAt: 'bids.resolvedAt'
};

let POST: OverrideRouteModule['POST'];

let selectQueue: SelectResult[] = [];
let txBidWindowReturningQueue: SelectResult[] = [];

function setSelectResults(results: SelectResult[]) {
	selectQueue = [...results];
}

function setTxBidWindowReturning(results: SelectResult[]) {
	txBidWindowReturningQueue = [...results];
}

function nextSelectResult() {
	if (selectQueue.length === 0) {
		throw new Error('No mocked select result available');
	}

	return selectQueue.shift();
}

function nextTxBidWindowReturningResult() {
	if (txBidWindowReturningQueue.length === 0) {
		return [];
	}

	return txBidWindowReturningQueue.shift();
}

function createSelectChain() {
	let whereResult: SelectResult | undefined;

	const chain = {
		from: vi.fn(() => chain),
		innerJoin: vi.fn((_table: unknown, _on: unknown) => chain),
		leftJoin: vi.fn((_table: unknown, _on: unknown) => chain),
		where: vi.fn((_condition: unknown) => {
			whereResult = nextSelectResult();
			return chain;
		}),
		orderBy: vi.fn((_order: unknown) => chain),
		limit: vi.fn(async (_count: number) => whereResult ?? nextSelectResult()),
		then: (
			onFulfilled?: (value: SelectResult) => unknown,
			onRejected?: (reason: unknown) => unknown
		) => Promise.resolve(whereResult ?? nextSelectResult()).then(onFulfilled, onRejected)
	};

	return chain;
}

const selectMock = vi.fn((_shape?: unknown) => createSelectChain());

const txBidWindowsReturningMock = vi.fn(async (_shape?: unknown) =>
	nextTxBidWindowReturningResult()
);
const txBidWindowsWhereMock = vi.fn((_condition: unknown) => ({
	returning: txBidWindowsReturningMock
}));
const txBidWindowsSetMock = vi.fn((_values: Record<string, unknown>) => ({
	where: txBidWindowsWhereMock
}));

const txBidsWhereMock = vi.fn(async (_condition: unknown) => undefined);
const txBidsSetMock = vi.fn((_values: Record<string, unknown>) => ({
	where: txBidsWhereMock
}));

const txUpdateMock = vi.fn((table: unknown) => {
	if (table === bidWindowsTable) {
		return { set: txBidWindowsSetMock };
	}

	return { set: txBidsSetMock };
});

const transactionMock = vi.fn(
	async (run: (tx: { update: typeof txUpdateMock }) => Promise<unknown>) =>
		run({ update: txUpdateMock })
);

const manualAssignDriverToAssignmentMock = vi.fn();
const createBidWindowMock = vi.fn();
const canManagerAccessWarehouseMock = vi.fn(async () => true);
const getEmergencyBonusPercentMock = vi.fn(async () => 20);
const createAuditLogMock = vi.fn(async () => undefined);
const broadcastAssignmentUpdatedMock = vi.fn();
const broadcastBidWindowClosedMock = vi.fn();
const sendNotificationMock = vi.fn(async () => ({
	inAppCreated: true,
	pushSent: false
}));

function createManagerUser(id = 'manager-1'): App.Locals['user'] {
	return {
		id,
		role: 'manager',
		name: `manager-${id}`,
		email: `${id}@example.test`,
		organizationId: 'org-test'
	} as App.Locals['user'];
}

function createDriverUser(id = 'driver-1'): App.Locals['user'] {
	return {
		id,
		role: 'driver',
		name: `driver-${id}`,
		email: `${id}@example.test`,
		organizationId: 'org-test'
	} as App.Locals['user'];
}

beforeEach(async () => {
	vi.resetModules();
	setSelectResults([]);
	setTxBidWindowReturning([]);

	selectMock.mockClear();
	txUpdateMock.mockClear();
	txBidWindowsSetMock.mockClear();
	txBidWindowsWhereMock.mockClear();
	txBidWindowsReturningMock.mockClear();
	txBidsSetMock.mockClear();
	txBidsWhereMock.mockClear();
	transactionMock.mockClear();

	manualAssignDriverToAssignmentMock.mockReset();
	createBidWindowMock.mockReset();
	canManagerAccessWarehouseMock.mockReset();
	getEmergencyBonusPercentMock.mockReset();
	createAuditLogMock.mockReset();
	broadcastAssignmentUpdatedMock.mockReset();
	broadcastBidWindowClosedMock.mockReset();
	sendNotificationMock.mockReset();

	canManagerAccessWarehouseMock.mockResolvedValue(true);
	sendNotificationMock.mockResolvedValue({ inAppCreated: true, pushSent: false });
	getEmergencyBonusPercentMock.mockResolvedValue(20);

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			transaction: transactionMock
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		assignments: assignmentsTable,
		bids: bidsTable,
		bidWindows: bidWindowsTable,
		routes: routesTable,
		user: userTable,
		warehouses: warehousesTable
	}));

	vi.doMock('drizzle-orm', () => ({
		and: (...conditions: unknown[]) => ({ conditions }),
		desc: (value: unknown) => value,
		eq: (left: unknown, right: unknown) => ({ left, right })
	}));

	vi.doMock('$lib/server/services/assignments', () => ({
		manualAssignDriverToAssignment: manualAssignDriverToAssignmentMock
	}));

	vi.doMock('$lib/server/services/bidding', () => ({
		createBidWindow: createBidWindowMock
	}));

	vi.doMock('$lib/server/services/managers', () => ({
		canManagerAccessWarehouse: canManagerAccessWarehouseMock
	}));

	vi.doMock('$lib/server/services/dispatchSettings', () => ({
		getEmergencyBonusPercent: getEmergencyBonusPercentMock
	}));

	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: createAuditLogMock
	}));

	vi.doMock('$lib/server/realtime/managerSse', () => ({
		broadcastAssignmentUpdated: broadcastAssignmentUpdatedMock,
		broadcastBidWindowClosed: broadcastBidWindowClosedMock
	}));

	vi.doMock('$lib/server/services/notifications', () => ({
		sendNotification: sendNotificationMock
	}));

	({ POST } = await import('../../src/routes/api/assignments/[id]/override/+server'));
}, 20_000);

afterEach(() => {
	resetTime();
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/services/assignments');
	vi.doUnmock('$lib/server/services/bidding');
	vi.doUnmock('$lib/server/services/managers');
	vi.doUnmock('$lib/server/services/dispatchSettings');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/realtime/managerSse');
	vi.doUnmock('$lib/server/services/notifications');
	vi.clearAllMocks();
});

describe('POST /api/assignments/[id]/override', () => {
	it('returns 401 when user is missing', async () => {
		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			body: { action: 'open_bidding' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 401 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns forbidden for non-manager users', async () => {
		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createDriverUser() },
			body: { action: 'open_bidding' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 403 });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns validation_failed for invalid request body', async () => {
		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser() },
			body: { action: 'reassign' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ code: 'validation_failed' });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns assignment_not_found when assignment snapshot is missing', async () => {
		setSelectResults([[]]);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser() },
			body: { action: 'open_bidding' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({ code: 'assignment_not_found' });
	});

	it('returns forbidden when manager lacks warehouse access', async () => {
		setSelectResults([
			[
				{
					id: ASSIGNMENT_ID,
					status: 'unfilled',
					userId: null,
					driverName: null,
					routeId: 'route-1',
					routeName: 'Route One',
					warehouseId: 'warehouse-1',
					warehouseName: 'Warehouse One',
					date: '2026-02-12',
					routeStartTime: '09:00'
				}
			]
		]);
		canManagerAccessWarehouseMock.mockResolvedValueOnce(false);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser() },
			body: { action: 'open_bidding' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ code: 'forbidden' });
		expect(createBidWindowMock).not.toHaveBeenCalled();
	});

	it('opens standard bidding for eligible unfilled assignments', async () => {
		freezeTime('2026-02-12T13:00:00.000Z');
		setSelectResults([
			[
				{
					id: ASSIGNMENT_ID,
					status: 'unfilled',
					userId: null,
					driverName: null,
					routeId: 'route-1',
					routeName: 'Route One',
					warehouseId: 'warehouse-1',
					warehouseName: 'Warehouse One',
					date: '2026-02-12',
					routeStartTime: '09:00'
				}
			],
			[],
			[
				{
					id: 'window-open-standard',
					mode: 'competitive',
					status: 'open',
					closesAt: new Date('2026-02-12T14:00:00.000Z'),
					payBonusPercent: 0
				}
			]
		]);

		createBidWindowMock.mockResolvedValueOnce({
			success: true,
			bidWindowId: 'window-open-standard',
			notifiedCount: 3
		});

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser('manager-open') },
			body: { action: 'open_bidding' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			action: 'open_bidding',
			assignment: {
				id: ASSIGNMENT_ID,
				status: 'unfilled',
				userId: null,
				driverName: null,
				routeId: 'route-1'
			},
			bidWindow: {
				id: 'window-open-standard',
				mode: 'competitive',
				status: 'open',
				closesAt: '2026-02-12T14:00:00.000Z',
				payBonusPercent: 0
			},
			notifiedCount: 3
		});

		expect(createBidWindowMock).toHaveBeenCalledWith(ASSIGNMENT_ID, {
			organizationId: 'org-test',
			trigger: 'manager'
		});
		expect(getEmergencyBonusPercentMock).not.toHaveBeenCalled();
	});

	it('returns normalized reassign payload for scheduled assignments', async () => {
		setSelectResults([
			[
				{
					id: ASSIGNMENT_ID,
					status: 'scheduled',
					userId: 'driver-1',
					driverName: 'Driver One',
					routeId: 'route-1',
					routeName: 'Route One',
					warehouseId: 'warehouse-1',
					warehouseName: 'Warehouse One',
					date: '2026-02-12',
					routeStartTime: '09:00'
				}
			],
			[]
		]);

		manualAssignDriverToAssignmentMock.mockResolvedValue({
			ok: true,
			assignmentId: ASSIGNMENT_ID,
			routeId: 'route-1',
			routeName: 'Route One',
			assignmentDate: '2026-02-12',
			driverId: 'driver-2',
			driverName: 'Driver Two',
			bidWindowId: null
		});

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser('manager-2') },
			body: { action: 'reassign', driverId: 'driver-2' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			action: 'reassign',
			assignment: {
				id: ASSIGNMENT_ID,
				status: 'scheduled',
				userId: 'driver-2',
				driverName: 'Driver Two',
				routeId: 'route-1'
			},
			bidWindow: null,
			notifiedCount: null
		});

		expect(manualAssignDriverToAssignmentMock).toHaveBeenCalledWith(
			expect.objectContaining({
				assignmentId: ASSIGNMENT_ID,
				driverId: 'driver-2',
				actorId: 'manager-2',
				organizationId: 'org-test',
				allowedStatuses: ['scheduled', 'unfilled']
			})
		);
		expect(broadcastAssignmentUpdatedMock).toHaveBeenCalledTimes(1);
	});

	it('returns open_window_exists for open_bidding when a window is already open', async () => {
		setSelectResults([
			[
				{
					id: ASSIGNMENT_ID,
					status: 'unfilled',
					userId: null,
					driverName: null,
					routeId: 'route-1',
					routeName: 'Route One',
					warehouseId: 'warehouse-1',
					warehouseName: 'Warehouse One',
					date: '2026-02-12',
					routeStartTime: '09:00'
				}
			],
			[
				{
					id: 'window-open',
					mode: 'competitive',
					status: 'open',
					closesAt: new Date('2026-02-12T10:00:00.000Z'),
					payBonusPercent: 0
				}
			]
		]);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser() },
			body: { action: 'open_bidding' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({ code: 'open_window_exists' });
		expect(createBidWindowMock).not.toHaveBeenCalled();
	});

	it('returns invalid_assignment_state for open_bidding when shift already started', async () => {
		freezeTime('2026-02-12T15:30:00.000Z');
		setSelectResults([
			[
				{
					id: ASSIGNMENT_ID,
					status: 'unfilled',
					userId: null,
					driverName: null,
					routeId: 'route-1',
					routeName: 'Route One',
					warehouseId: 'warehouse-1',
					warehouseName: 'Warehouse One',
					date: '2026-02-12',
					routeStartTime: '09:00'
				}
			],
			[]
		]);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser() },
			body: { action: 'open_bidding' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({ code: 'invalid_assignment_state' });
		expect(createBidWindowMock).not.toHaveBeenCalled();
	});

	it('returns idempotent success when urgent bidding is already open in emergency mode', async () => {
		setSelectResults([
			[
				{
					id: ASSIGNMENT_ID,
					status: 'unfilled',
					userId: null,
					driverName: null,
					routeId: 'route-1',
					routeName: 'Route One',
					warehouseId: 'warehouse-1',
					warehouseName: 'Warehouse One',
					date: '2026-02-12',
					routeStartTime: '09:00'
				}
			],
			[
				{
					id: 'window-emergency',
					mode: 'emergency',
					status: 'open',
					closesAt: new Date('2026-02-12T12:00:00.000Z'),
					payBonusPercent: 25
				}
			]
		]);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser() },
			body: { action: 'open_urgent_bidding' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			action: 'open_urgent_bidding',
			assignment: {
				id: ASSIGNMENT_ID,
				status: 'unfilled',
				userId: null,
				driverName: null,
				routeId: 'route-1'
			},
			bidWindow: {
				id: 'window-emergency',
				mode: 'emergency',
				status: 'open',
				closesAt: '2026-02-12T12:00:00.000Z',
				payBonusPercent: 25
			},
			notifiedCount: null
		});
		expect(createBidWindowMock).not.toHaveBeenCalled();
	});

	it('closes non-emergency window and opens urgent bidding with runtime bonus', async () => {
		setSelectResults([
			[
				{
					id: ASSIGNMENT_ID,
					status: 'scheduled',
					userId: 'driver-current',
					driverName: 'Current Driver',
					routeId: 'route-1',
					routeName: 'Route One',
					warehouseId: 'warehouse-1',
					warehouseName: 'Warehouse One',
					date: '2026-02-12',
					routeStartTime: '09:00'
				}
			],
			[
				{
					id: 'window-competitive',
					mode: 'competitive',
					status: 'open',
					closesAt: new Date('2026-02-12T08:00:00.000Z'),
					payBonusPercent: 0
				}
			],
			[
				{
					id: 'window-urgent',
					mode: 'emergency',
					status: 'open',
					closesAt: new Date('2026-02-12T14:00:00.000Z'),
					payBonusPercent: 35
				}
			]
		]);
		setTxBidWindowReturning([[{ id: 'window-competitive' }]]);

		getEmergencyBonusPercentMock.mockResolvedValueOnce(35);
		createBidWindowMock.mockResolvedValue({
			success: true,
			bidWindowId: 'window-urgent',
			notifiedCount: 6
		});

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser('manager-urgent') },
			body: { action: 'open_urgent_bidding' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			action: 'open_urgent_bidding',
			assignment: {
				id: ASSIGNMENT_ID,
				status: 'unfilled',
				userId: null,
				driverName: null,
				routeId: 'route-1'
			},
			bidWindow: {
				id: 'window-urgent',
				mode: 'emergency',
				status: 'open',
				closesAt: '2026-02-12T14:00:00.000Z',
				payBonusPercent: 35
			},
			notifiedCount: 6
		});

		expect(txUpdateMock).toHaveBeenCalled();
		expect(createAuditLogMock).toHaveBeenCalledTimes(1);
		expect(broadcastBidWindowClosedMock).toHaveBeenCalledWith(
			'org-test',
			expect.objectContaining({ bidWindowId: 'window-competitive' })
		);
		expect(createBidWindowMock).toHaveBeenCalledWith(
			ASSIGNMENT_ID,
			expect.objectContaining({
				mode: 'emergency',
				trigger: 'manager',
				payBonusPercent: 35
			})
		);
	});

	it('suspends a route, closes open bidding, and unassigns the driver', async () => {
		setSelectResults([
			[
				{
					id: ASSIGNMENT_ID,
					status: 'scheduled',
					userId: 'driver-current',
					driverName: 'Current Driver',
					routeId: 'route-1',
					routeName: 'Route One',
					warehouseId: 'warehouse-1',
					warehouseName: 'Warehouse One',
					date: '2026-02-12',
					routeStartTime: '09:00'
				}
			],
			[
				{
					id: 'window-suspend',
					mode: 'competitive',
					status: 'open',
					closesAt: new Date('2026-02-12T08:00:00.000Z'),
					payBonusPercent: 0
				}
			]
		]);
		setTxBidWindowReturning([[{ id: 'window-suspend' }]]);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser('manager-suspend') },
			body: { action: 'suspend_route' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			action: 'suspend_route',
			assignment: {
				id: ASSIGNMENT_ID,
				status: 'cancelled',
				userId: null,
				driverName: null,
				routeId: 'route-1'
			},
			bidWindow: null,
			notifiedCount: null
		});

		expect(txUpdateMock).toHaveBeenCalled();
		expect(broadcastBidWindowClosedMock).toHaveBeenCalledWith(
			'org-test',
			expect.objectContaining({ bidWindowId: 'window-suspend', assignmentId: ASSIGNMENT_ID })
		);
		expect(broadcastAssignmentUpdatedMock).toHaveBeenCalledWith(
			'org-test',
			expect.objectContaining({
				assignmentId: ASSIGNMENT_ID,
				status: 'cancelled',
				routeId: 'route-1'
			})
		);
	});

	it('resumes a suspended route back to unfilled without opening bidding', async () => {
		setSelectResults([
			[
				{
					id: ASSIGNMENT_ID,
					status: 'cancelled',
					userId: null,
					driverName: null,
					routeId: 'route-1',
					routeName: 'Route One',
					warehouseId: 'warehouse-1',
					warehouseName: 'Warehouse One',
					date: '2026-02-12',
					routeStartTime: '09:00'
				}
			],
			[]
		]);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser('manager-resume') },
			body: { action: 'resume_route' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			action: 'resume_route',
			assignment: {
				id: ASSIGNMENT_ID,
				status: 'unfilled',
				userId: null,
				driverName: null,
				routeId: 'route-1'
			},
			bidWindow: null,
			notifiedCount: null
		});

		expect(createBidWindowMock).not.toHaveBeenCalled();
		expect(broadcastAssignmentUpdatedMock).toHaveBeenCalledWith(
			'org-test',
			expect.objectContaining({
				assignmentId: ASSIGNMENT_ID,
				status: 'unfilled',
				routeId: 'route-1'
			})
		);
	});
});
