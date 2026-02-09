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

const transactionMock = vi.fn(async (_runner: unknown) => {
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

	({ createBidWindow, getExpiredBidWindows, instantAssign } =
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
					status: 'unfilled'
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
					status: 'unfilled'
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

	it('supports scoped and unscoped expired-window lookups', async () => {
		setSelectResults([
			[{ id: 'window-scoped', assignmentId: 'assignment-a', mode: 'competitive' }],
			[{ id: 'window-global', assignmentId: 'assignment-b', mode: 'instant' }]
		]);

		const scoped = await getExpiredBidWindows(['warehouse-1']);
		const global = await getExpiredBidWindows();

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
});
