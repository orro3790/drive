import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type AssignmentsModule = typeof import('../../src/lib/server/services/assignments');

type SelectResult = unknown;

let selectQueue: SelectResult[] = [];
let updateReturningQueue: SelectResult[] = [];

function setSelectResults(results: SelectResult[]) {
	selectQueue = [...results];
}

function setUpdateReturningResults(results: SelectResult[]) {
	updateReturningQueue = [...results];
}

function nextSelectResult() {
	if (selectQueue.length === 0) {
		throw new Error('No mocked select result available');
	}

	return selectQueue.shift();
}

function nextUpdateReturningResult() {
	if (updateReturningQueue.length === 0) {
		return [];
	}

	return updateReturningQueue.shift();
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

const selectMock = vi.fn((_shape?: unknown) => {
	return createSelectChain();
});

const txReturningMock = vi.fn(async (_shape?: unknown) => nextUpdateReturningResult());
const txWhereMock = vi.fn((_condition: unknown) => ({
	returning: txReturningMock,
	then: (onFulfilled?: (value: undefined) => unknown, onRejected?: (reason: unknown) => unknown) =>
		Promise.resolve(undefined).then(onFulfilled, onRejected)
}));
const txSetMock = vi.fn((_values: Record<string, unknown>) => ({ where: txWhereMock }));
const txUpdateMock = vi.fn((_table: unknown) => ({ set: txSetMock }));
const txSelectMock = vi.fn((_shape?: unknown) => createSelectChain());

const transactionMock = vi.fn(
	async (
		run: (tx: { update: typeof txUpdateMock; select: typeof txSelectMock }) => Promise<unknown>
	) => run({ update: txUpdateMock, select: txSelectMock })
);

const createAuditLogMock = vi.fn(
	async (_entry: Record<string, unknown>, _tx?: unknown) => undefined
);
const canManagerAccessWarehouseMock = vi.fn(
	async (_managerId: string, _warehouseId: string) => true
);
const getWeekStartForDateStringMock = vi.fn(
	(dateString: string) => new Date(`${dateString}T00:00:00.000Z`)
);
const getDriverWeeklyAssignmentCountMock = vi.fn(async (_driverId: string, _weekStart: Date) => 0);
const sendNotificationMock = vi.fn(async () => ({ inAppCreated: true, pushSent: false }));
const sendBulkNotificationsMock = vi.fn(async () => undefined);

let manualAssignDriverToAssignment: AssignmentsModule['manualAssignDriverToAssignment'];

beforeAll(async () => {
	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			transaction: transactionMock
		}
	}));

	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: createAuditLogMock
	}));

	vi.doMock('$lib/server/services/managers', () => ({
		canManagerAccessWarehouse: canManagerAccessWarehouseMock
	}));

	vi.doMock('$lib/server/services/scheduling', () => ({
		getWeekStartForDateString: getWeekStartForDateStringMock,
		getDriverWeeklyAssignmentCount: getDriverWeeklyAssignmentCountMock
	}));

	vi.doMock('$lib/server/services/notifications', () => ({
		sendNotification: sendNotificationMock,
		sendBulkNotifications: sendBulkNotificationsMock
	}));

	({ manualAssignDriverToAssignment } =
		(await import('../../src/lib/server/services/assignments')) as AssignmentsModule);
}, 20_000);

beforeEach(() => {
	setSelectResults([]);
	setUpdateReturningResults([]);
	selectMock.mockClear();
	txSelectMock.mockClear();
	txWhereMock.mockClear();
	txReturningMock.mockClear();
	txSetMock.mockClear();
	txUpdateMock.mockClear();
	transactionMock.mockClear();
	createAuditLogMock.mockClear();
	canManagerAccessWarehouseMock.mockClear();
	getWeekStartForDateStringMock.mockClear();
	getDriverWeeklyAssignmentCountMock.mockClear();
	sendNotificationMock.mockClear();
	sendBulkNotificationsMock.mockClear();

	canManagerAccessWarehouseMock.mockResolvedValue(true);
	getDriverWeeklyAssignmentCountMock.mockResolvedValue(0);
	setUpdateReturningResults([[{ id: 'assignment-updated' }], [{ id: 'window-updated' }]]);
});

afterAll(() => {
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/services/managers');
	vi.doUnmock('$lib/server/services/scheduling');
	vi.doUnmock('$lib/server/services/notifications');
	vi.clearAllMocks();
});

describe('manual assignment service boundaries', () => {
	it('returns assignment_not_found when assignment lookup is empty', async () => {
		setSelectResults([[]]);

		await expect(
			manualAssignDriverToAssignment({
				assignmentId: 'assignment-missing',
				driverId: 'driver-1',
				actorId: 'manager-1'
			})
		).resolves.toEqual({ ok: false, code: 'assignment_not_found' });

		expect(canManagerAccessWarehouseMock).not.toHaveBeenCalled();
	});

	it('returns forbidden when manager does not own assignment warehouse scope', async () => {
		canManagerAccessWarehouseMock.mockResolvedValue(false);
		setSelectResults([
			[
				{
					id: 'assignment-1',
					routeId: 'route-1',
					routeName: 'Downtown',
					warehouseId: 'warehouse-1',
					date: '2026-02-20',
					status: 'unfilled',
					userId: null,
					organizationId: 'org-test'
				}
			]
		]);

		await expect(
			manualAssignDriverToAssignment({
				assignmentId: 'assignment-1',
				driverId: 'driver-1',
				actorId: 'manager-1'
			})
		).resolves.toEqual({ ok: false, code: 'forbidden' });
	});

	it('returns assignment_not_assignable when assignment is not unfilled', async () => {
		setSelectResults([
			[
				{
					id: 'assignment-2',
					routeId: 'route-1',
					routeName: 'Downtown',
					warehouseId: 'warehouse-1',
					date: '2026-02-20',
					status: 'scheduled',
					userId: 'driver-existing',
					organizationId: 'org-test'
				}
			]
		]);

		await expect(
			manualAssignDriverToAssignment({
				assignmentId: 'assignment-2',
				driverId: 'driver-1',
				actorId: 'manager-1'
			})
		).resolves.toEqual({ ok: false, code: 'assignment_not_assignable' });
	});

	it('returns driver_over_weekly_cap when the candidate is already at cap', async () => {
		getDriverWeeklyAssignmentCountMock.mockResolvedValue(4);
		setSelectResults([
			[
				{
					id: 'assignment-3',
					routeId: 'route-2',
					routeName: 'Harbor',
					warehouseId: 'warehouse-2',
					date: '2026-02-21',
					status: 'unfilled',
					userId: null,
					organizationId: 'org-test'
				}
			],
			[
				{
					id: 'driver-2',
					name: 'Driver Two',
					role: 'driver',
					isFlagged: false,
					weeklyCap: 4
				}
			]
		]);

		await expect(
			manualAssignDriverToAssignment({
				assignmentId: 'assignment-3',
				driverId: 'driver-2',
				actorId: 'manager-2'
			})
		).resolves.toEqual({ ok: false, code: 'driver_over_weekly_cap' });

		expect(transactionMock).not.toHaveBeenCalled();
	});

	it('assigns driver, resolves pending bids, and notifies losers on success', async () => {
		setSelectResults([
			[
				{
					id: 'assignment-4',
					routeId: 'route-4',
					routeName: 'Uptown',
					warehouseId: 'warehouse-4',
					date: '2026-02-22',
					status: 'unfilled',
					userId: null,
					organizationId: 'org-test'
				}
			],
			[
				{
					id: 'driver-4',
					name: 'Driver Four',
					role: 'driver',
					isFlagged: false,
					weeklyCap: 4
				}
			],
			[{ id: 'window-4' }],
			[
				{ id: 'bid-1', userId: 'driver-4' },
				{ id: 'bid-2', userId: 'driver-loser' }
			]
		]);
		setUpdateReturningResults([[{ id: 'assignment-4' }], [{ id: 'window-4' }]]);

		const result = await manualAssignDriverToAssignment({
			assignmentId: 'assignment-4',
			driverId: 'driver-4',
			actorId: 'manager-4'
		});

		expect(result).toMatchObject({
			ok: true,
			assignmentId: 'assignment-4',
			driverId: 'driver-4',
			routeName: 'Uptown',
			bidWindowId: 'window-4'
		});
		expect(transactionMock).toHaveBeenCalledTimes(1);
		expect(createAuditLogMock).toHaveBeenCalledTimes(1);
		expect(sendNotificationMock).toHaveBeenCalledWith(
			'driver-4',
			'assignment_confirmed',
			expect.any(Object)
		);
		expect(sendBulkNotificationsMock).toHaveBeenCalledWith(
			['driver-loser'],
			'bid_lost',
			expect.any(Object)
		);
	});
});
