import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatInTimeZone } from 'date-fns-tz';

import { freezeTime, resetTime } from '../harness/time';

type ConfirmationsModule = typeof import('../../src/lib/server/services/confirmations');

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
		where: vi.fn(async (_condition: unknown) => nextSelectResult())
	};

	return chain;
});

const updateReturningMock = vi.fn(async (_shape?: unknown) => [{ id: 'assignment-2' }]);
const updateWhereMock = vi.fn((_condition: unknown) => {
	const result = Promise.resolve(undefined);
	(result as unknown as Record<string, unknown>).returning = updateReturningMock;
	return result;
});
const updateSetMock = vi.fn((_values: Record<string, unknown>) => ({
	where: updateWhereMock
}));
const updateMock = vi.fn((_table: unknown) => ({
	set: updateSetMock
}));

const createAuditLogMock = vi.fn(async (_entry: Record<string, unknown>) => undefined);
const broadcastAssignmentUpdatedMock = vi.fn();

let calculateConfirmationDeadline: ConfirmationsModule['calculateConfirmationDeadline'];
let confirmShift: ConfirmationsModule['confirmShift'];
let getUnconfirmedAssignments: ConfirmationsModule['getUnconfirmedAssignments'];

beforeAll(async () => {
	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			update: updateMock,
			transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
				callback({ select: selectMock, update: updateMock })
			)
		}
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

	({ calculateConfirmationDeadline, confirmShift, getUnconfirmedAssignments } =
		(await import('../../src/lib/server/services/confirmations')) as ConfirmationsModule);
}, 20_000);

beforeEach(() => {
	setSelectResults([]);
	selectMock.mockClear();
	updateMock.mockClear();
	updateSetMock.mockClear();
	updateWhereMock.mockClear();
	updateReturningMock.mockClear();
	createAuditLogMock.mockClear();
	broadcastAssignmentUpdatedMock.mockClear();
});

afterEach(() => {
	resetTime();
});

afterAll(() => {
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/realtime/managerSse');
	vi.doUnmock('$lib/server/logger');
	vi.clearAllMocks();
});

describe('confirmation service boundaries', () => {
	it('calculates the expected confirmation open/deadline window', () => {
		const { opensAt, deadline } = calculateConfirmationDeadline('2026-02-20');

		expect(deadline.getTime()).toBeGreaterThan(opensAt.getTime());
		expect(deadline.getTime() - opensAt.getTime()).toBe(120 * 60 * 60 * 1000);
	});

	it('keeps confirmation windows anchored to exact 48h/7d durations across DST boundaries', () => {
		const springForward = calculateConfirmationDeadline('2026-03-08');
		const fallBack = calculateConfirmationDeadline('2026-11-01');
		const springForwardShiftStart = new Date('2026-03-08T11:00:00.000Z');
		const fallBackShiftStart = new Date('2026-11-01T12:00:00.000Z');

		expect(springForwardShiftStart.getTime() - springForward.opensAt.getTime()).toBe(
			168 * 60 * 60 * 1000
		);
		expect(springForwardShiftStart.getTime() - springForward.deadline.getTime()).toBe(
			48 * 60 * 60 * 1000
		);

		expect(formatInTimeZone(springForward.opensAt, 'America/Toronto', 'yyyy-MM-dd HH:mm')).toBe(
			'2026-03-01 06:00'
		);
		expect(formatInTimeZone(springForward.deadline, 'America/Toronto', 'yyyy-MM-dd HH:mm')).toBe(
			'2026-03-06 06:00'
		);

		expect(fallBackShiftStart.getTime() - fallBack.opensAt.getTime()).toBe(168 * 60 * 60 * 1000);
		expect(fallBackShiftStart.getTime() - fallBack.deadline.getTime()).toBe(48 * 60 * 60 * 1000);

		expect(formatInTimeZone(fallBack.opensAt, 'America/Toronto', 'yyyy-MM-dd HH:mm')).toBe(
			'2026-10-25 08:00'
		);
		expect(formatInTimeZone(fallBack.deadline, 'America/Toronto', 'yyyy-MM-dd HH:mm')).toBe(
			'2026-10-30 08:00'
		);
	});

	it('returns assignment_not_found when the assignment does not exist', async () => {
		setSelectResults([[]]);

		await expect(confirmShift('missing-assignment', 'driver-1')).resolves.toEqual({
			success: false,
			error: 'Assignment not found'
		});

		expect(updateMock).not.toHaveBeenCalled();
		expect(createAuditLogMock).not.toHaveBeenCalled();
	});

	it('rejects confirmations after the deadline boundary', async () => {
		freezeTime('2026-02-19T12:01:00.000Z');
		setSelectResults([
			[
				{
					id: 'assignment-1',
					userId: 'driver-1',
					date: '2026-02-20',
					status: 'scheduled',
					confirmedAt: null,
					organizationId: 'org-a'
				}
			]
		]);

		await expect(confirmShift('assignment-1', 'driver-1')).resolves.toEqual({
			success: false,
			error: 'Confirmation deadline has passed'
		});

		expect(updateMock).not.toHaveBeenCalled();
	});

	it('confirms scheduled assignments inside the window and writes audit state', async () => {
		freezeTime('2026-02-15T12:00:00.000Z');
		setSelectResults([
			[
				{
					id: 'assignment-2',
					userId: 'driver-2',
					date: '2026-02-20',
					status: 'scheduled',
					confirmedAt: null,
					organizationId: 'org-a'
				}
			]
		]);

		const result = await confirmShift('assignment-2', 'driver-2');

		expect(result.success).toBe(true);
		expect(result.confirmedAt).toBeInstanceOf(Date);
		expect(updateMock).toHaveBeenCalledTimes(2);
		expect(createAuditLogMock).toHaveBeenCalledTimes(1);
		expect(broadcastAssignmentUpdatedMock).toHaveBeenCalledWith(
			'org-a',
			expect.objectContaining({
				assignmentId: 'assignment-2',
				status: 'scheduled',
				driverId: 'driver-2',
				shiftProgress: 'confirmed'
			})
		);
	});

	it('filters unconfirmed assignments to ones still before deadline', async () => {
		freezeTime('2026-02-15T12:00:00.000Z');
		setSelectResults([
			[
				{
					id: 'assignment-upcoming',
					date: '2026-02-18',
					routeName: 'Downtown',
					warehouseName: 'North',
					confirmedAt: null
				},
				{
					id: 'assignment-expired',
					date: '2026-02-15',
					routeName: 'Harbor',
					warehouseName: 'South',
					confirmedAt: null
				}
			]
		]);

		const rows = await getUnconfirmedAssignments('driver-3');

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: 'assignment-upcoming',
			isConfirmable: true,
			routeName: 'Downtown',
			warehouseName: 'North'
		});
	});
});
