import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { freezeTime, resetTime } from '../harness/time';

type BiddingModule = typeof import('../../src/lib/server/services/bidding');

type SelectResult = unknown;

let selectQueue: SelectResult[] = [];

function setSelectResults(results: SelectResult[]) {
	selectQueue = [...results];
}

function nextSelectResult() {
	if (selectQueue.length === 0) {
		throw new Error('No mocked select result available');
	}

	return selectQueue.shift();
}

const selectMock = vi.fn((_shape?: unknown) => {
	const chain = {
		from: vi.fn(() => chain),
		innerJoin: vi.fn((_table: unknown, _on: unknown) => chain),
		leftJoin: vi.fn((_table: unknown, _on: unknown) => chain),
		where: vi.fn(async (_condition: unknown) => nextSelectResult())
	};

	return chain;
});

const insertReturningMock = vi.fn(async () => [{ id: 'window-created' }]);
const insertValuesMock = vi.fn((_values: Record<string, unknown>) => ({
	returning: insertReturningMock
}));
const insertMock = vi.fn((_table: unknown) => ({ values: insertValuesMock }));

const updateWhereMock = vi.fn(async (_condition: unknown) => undefined);
const updateSetMock = vi.fn((_values: Record<string, unknown>) => ({ where: updateWhereMock }));
const updateMock = vi.fn((_table: unknown) => ({ set: updateSetMock }));

const transactionMock = vi.fn(async (_runner: unknown): Promise<unknown> => {
	throw new Error('transaction_failed');
});

const createAuditLogMock = vi.fn(
	async (_entry: Record<string, unknown>, _tx?: unknown) => undefined
);
const sendNotificationMock = vi.fn(async () => ({ inAppCreated: true, pushSent: false }));
const sendBulkNotificationsMock = vi.fn(async () => undefined);
const sendManagerAlertMock = vi.fn(async () => true);

let createBidWindow: BiddingModule['createBidWindow'];
let getExpiredBidWindows: BiddingModule['getExpiredBidWindows'];
let instantAssign: BiddingModule['instantAssign'];
let resolveBidWindow: BiddingModule['resolveBidWindow'];

function createResolveTransactionContext() {
	const txReturningQueue: SelectResult[] = [[{ id: 'window-1' }]];

	const txWhereMock = vi.fn((_condition: unknown) => ({
		returning: vi.fn(async (_shape?: unknown) => txReturningQueue.shift() ?? []),
		then: (
			onFulfilled?: (value: undefined) => unknown,
			onRejected?: (reason: unknown) => unknown
		) => Promise.resolve(undefined).then(onFulfilled, onRejected)
	}));

	const txSetMock = vi.fn((_values: Record<string, unknown>) => ({ where: txWhereMock }));
	const txUpdateMock = vi.fn((_table: unknown) => ({ set: txSetMock }));
	const txExecuteMock = vi.fn(async () => ({ rows: [{ id: 'window-1', status: 'open' }] }));

	return {
		txExecuteMock,
		txUpdateMock
	};
}

beforeAll(async () => {
	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			insert: insertMock,
			update: updateMock,
			transaction: transactionMock
		}
	}));

	vi.doMock('$lib/server/services/notifications', () => ({
		sendNotification: sendNotificationMock,
		sendBulkNotifications: sendBulkNotificationsMock,
		sendManagerAlert: sendManagerAlertMock
	}));

	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: createAuditLogMock
	}));

	vi.doMock('$lib/server/services/scheduling', () => ({
		getWeekStart: vi.fn((date: Date) => date),
		canDriverTakeAssignment: vi.fn(async () => true)
	}));

	vi.doMock('$lib/server/realtime/managerSse', () => ({
		broadcastAssignmentUpdated: vi.fn(),
		broadcastBidWindowClosed: vi.fn(),
		broadcastBidWindowOpened: vi.fn()
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => ({
				info: vi.fn(),
				debug: vi.fn(),
				warn: vi.fn(),
				error: vi.fn()
			}))
		},
		toSafeErrorMessage: vi.fn((_error: unknown) => 'Error')
	}));

	({ createBidWindow, getExpiredBidWindows, instantAssign, resolveBidWindow } =
		(await import('../../src/lib/server/services/bidding')) as BiddingModule);
}, 20_000);

beforeEach(() => {
	setSelectResults([]);
	selectMock.mockClear();
	insertMock.mockClear();
	insertValuesMock.mockClear();
	insertReturningMock.mockClear();
	updateMock.mockClear();
	updateSetMock.mockClear();
	updateWhereMock.mockClear();
	transactionMock.mockClear();
	createAuditLogMock.mockClear();
	sendNotificationMock.mockClear();
	sendBulkNotificationsMock.mockClear();
	sendManagerAlertMock.mockClear();
});

afterEach(() => {
	resetTime();
});

afterAll(() => {
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/services/scheduling');
	vi.doUnmock('$lib/server/realtime/managerSse');
	vi.doUnmock('$lib/server/logger');
	vi.clearAllMocks();
});

describe('bidding service boundaries', () => {
	it('returns not_found when creating a bid window for missing assignments', async () => {
		setSelectResults([[]]);

		await expect(createBidWindow('assignment-missing')).resolves.toEqual({
			success: false,
			reason: 'Assignment not found'
		});
		expect(insertMock).not.toHaveBeenCalled();
	});

	it('returns duplicate-window failure when an open bid window already exists', async () => {
		setSelectResults([
			[
				{
					id: 'assignment-1',
					routeId: 'route-1',
					date: '2026-02-20',
					status: 'unfilled',
					organizationId: 'org-a'
				}
			],
			[{ id: 'window-existing' }]
		]);

		await expect(createBidWindow('assignment-1')).resolves.toEqual({
			success: false,
			reason: 'Open bid window already exists for this assignment'
		});
		expect(insertMock).not.toHaveBeenCalled();
	});

	it('does not create windows for shifts that already passed', async () => {
		freezeTime('2026-02-20T13:00:00.000Z');
		setSelectResults([
			[
				{
					id: 'assignment-2',
					routeId: 'route-2',
					date: '2026-02-20',
					status: 'unfilled',
					organizationId: 'org-a'
				}
			],
			[]
		]);

		await expect(createBidWindow('assignment-2')).resolves.toEqual({
			success: false,
			reason: 'Shift has already passed'
		});
		expect(insertMock).not.toHaveBeenCalled();
	});

	it('supports warehouse-scoped and organization-scoped expired-window lookups', async () => {
		setSelectResults([
			[{ id: 'window-scoped', assignmentId: 'assignment-a', mode: 'competitive' }],
			[{ id: 'window-global', assignmentId: 'assignment-b', mode: 'instant' }]
		]);

		const scoped = await getExpiredBidWindows(['warehouse-1'], 'org-a');
		const global = await getExpiredBidWindows(undefined, 'org-b');

		expect(scoped).toEqual([
			{ id: 'window-scoped', assignmentId: 'assignment-a', mode: 'competitive' }
		]);
		expect(global).toEqual([
			{ id: 'window-global', assignmentId: 'assignment-b', mode: 'instant' }
		]);
	});

	it('returns route-assigned conflict when instant assignment transaction fails', async () => {
		transactionMock.mockRejectedValueOnce(new Error('serialization_conflict'));

		await expect(instantAssign('assignment-3', 'driver-3', 'window-3')).resolves.toEqual({
			instantlyAssigned: false,
			error: 'Route already assigned'
		});
	});

	it('still assigns instantly when non-critical side effects fail', async () => {
		const txSelectQueue: SelectResult[] = [[{ date: '2026-02-20' }], []];
		const txSelectMock = vi.fn((_shape?: unknown) => {
			const chain = {
				from: vi.fn(() => chain),
				innerJoin: vi.fn((_table: unknown, _on: unknown) => chain),
				where: vi.fn(async (_condition: unknown) => {
					if (txSelectQueue.length === 0) {
						throw new Error('No tx select result available');
					}

					return txSelectQueue.shift();
				})
			};

			return chain;
		});

		const txInsertReturningMock = vi.fn(async () => [{ id: 'bid-3' }]);
		const txInsertValuesMock = vi.fn((_values: Record<string, unknown>) => ({
			returning: txInsertReturningMock
		}));
		const txInsertMock = vi.fn((_table: unknown) => ({ values: txInsertValuesMock }));

		const txUpdateWhereMock = vi.fn(async (_condition: unknown) => undefined);
		const txUpdateSetMock = vi.fn((_values: Record<string, unknown>) => ({
			where: txUpdateWhereMock
		}));
		const txUpdateMock = vi.fn((_table: unknown) => ({ set: txUpdateSetMock }));

		const txDeleteWhereMock = vi.fn(async (_condition: unknown) => undefined);
		const txDeleteMock = vi.fn((_table: unknown) => ({ where: txDeleteWhereMock }));

		const txExecuteMock = vi.fn(async () => ({
			rows: [{ id: 'window-3', status: 'open', mode: 'emergency', pay_bonus_percent: 20 }]
		}));

		transactionMock.mockImplementationOnce(async (runner: unknown) => {
			if (typeof runner !== 'function') {
				throw new Error('runner_missing');
			}

			return runner({
				execute: txExecuteMock,
				select: txSelectMock,
				insert: txInsertMock,
				update: txUpdateMock,
				delete: txDeleteMock
			});
		});

		updateWhereMock.mockRejectedValueOnce(new Error('urgent_pickups_missing'));
		createAuditLogMock.mockRejectedValueOnce(new Error('audit_insert_failed'));

		await expect(instantAssign('assignment-3', 'driver-3', 'window-3')).resolves.toEqual({
			instantlyAssigned: true,
			bidId: 'bid-3',
			assignmentId: 'assignment-3'
		});
	});

	it('resolves competitive windows with pending bids', async () => {
		setSelectResults([
			[
				{
					id: 'window-1',
					assignmentId: 'assignment-1',
					status: 'open',
					mode: 'competitive',
					organizationId: 'org-a'
				}
			],
			[
				{
					id: 'assignment-1',
					date: '2026-02-20',
					routeId: 'route-1',
					routeName: 'Route One',
					status: 'unfilled',
					userId: null,
					organizationId: 'org-a'
				}
			],
			[{ id: 'bid-only', userId: 'driver-only', bidAt: new Date('2026-02-10T10:01:00.000Z') }],
			[],
			[],
			[],
			[],
			[],
			[],
			[]
		]);

		transactionMock.mockImplementationOnce(async (runner: unknown) => {
			if (typeof runner !== 'function') {
				throw new Error('runner_missing');
			}

			const { txExecuteMock, txUpdateMock } = createResolveTransactionContext();
			return runner({ execute: txExecuteMock, update: txUpdateMock });
		});

		await expect(resolveBidWindow('window-1')).resolves.toMatchObject({
			resolved: true,
			bidCount: 1,
			winnerId: 'driver-only'
		});
		expect(sendNotificationMock).toHaveBeenCalledWith(
			'driver-only',
			'bid_won',
			expect.objectContaining({ data: expect.objectContaining({ bidWindowId: 'window-1' }) })
		);
	});

	it('breaks equal-score ties deterministically by bid id when bid times match', async () => {
		const sharedBidTime = new Date('2026-02-10T10:00:00.000Z');

		setSelectResults([
			[
				{
					id: 'window-1',
					assignmentId: 'assignment-1',
					status: 'open',
					mode: 'competitive',
					organizationId: 'org-a'
				}
			],
			[
				{
					id: 'assignment-1',
					date: '2026-02-20',
					routeId: 'route-1',
					routeName: 'Route One',
					status: 'unfilled',
					userId: null,
					organizationId: 'org-a'
				}
			],
			[
				{ id: 'bid-b', userId: 'driver-b', bidAt: sharedBidTime },
				{ id: 'bid-a', userId: 'driver-a', bidAt: sharedBidTime }
			],
			[],
			[],
			[],
			[],
			[],
			[],
			[],
			[],
			[],
			[]
		]);

		transactionMock.mockImplementationOnce(async (runner: unknown) => {
			if (typeof runner !== 'function') {
				throw new Error('runner_missing');
			}

			const { txExecuteMock, txUpdateMock } = createResolveTransactionContext();
			return runner({ execute: txExecuteMock, update: txUpdateMock });
		});

		await expect(resolveBidWindow('window-1')).resolves.toMatchObject({
			resolved: true,
			bidCount: 2,
			winnerId: 'driver-a'
		});
	});

	it('retries with the next bidder when first winner conflicts concurrently', async () => {
		setSelectResults([
			[
				{
					id: 'window-1',
					assignmentId: 'assignment-1',
					status: 'open',
					mode: 'competitive',
					organizationId: 'org-a'
				}
			],
			[
				{
					id: 'assignment-1',
					date: '2026-02-20',
					routeId: 'route-1',
					routeName: 'Route One',
					status: 'unfilled',
					userId: null,
					organizationId: 'org-a'
				}
			],
			[
				{ id: 'bid-first', userId: 'driver-first', bidAt: new Date('2026-02-10T10:00:00.000Z') },
				{ id: 'bid-second', userId: 'driver-second', bidAt: new Date('2026-02-10T10:01:00.000Z') }
			],
			[],
			[],
			[],
			[],
			[],
			[],
			[],
			[],
			[],
			[]
		]);

		const uniqueConflict = Object.assign(new Error('active assignment conflict'), {
			code: '23505',
			constraint: 'uq_assignments_active_user_date'
		});

		transactionMock
			.mockRejectedValueOnce(uniqueConflict)
			.mockImplementationOnce(async (runner: unknown) => {
				if (typeof runner !== 'function') {
					throw new Error('runner_missing');
				}

				const { txExecuteMock, txUpdateMock } = createResolveTransactionContext();
				return runner({ execute: txExecuteMock, update: txUpdateMock });
			});

		await expect(resolveBidWindow('window-1')).resolves.toMatchObject({
			resolved: true,
			bidCount: 2,
			winnerId: 'driver-second'
		});
		expect(transactionMock).toHaveBeenCalledTimes(2);
		expect(sendNotificationMock).toHaveBeenCalledWith(
			'driver-second',
			'bid_won',
			expect.objectContaining({ data: expect.objectContaining({ bidWindowId: 'window-1' }) })
		);
	});
});
