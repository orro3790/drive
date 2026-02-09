import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';
import { freezeTime, resetTime } from '../harness/time';

type LockPreferencesRouteModule =
	typeof import('../../src/routes/api/cron/lock-preferences/+server');

interface LockedPreferenceRow {
	id: string;
}

interface AssignmentUserRow {
	userId: string | null;
}

interface ExistingNotificationRow {
	userId: string;
}

interface ScheduleResult {
	created: number;
	skipped: number;
	unfilled: number;
	errors: string[];
}

const CRON_TOKEN = 'cron-secret-test-token';

const driverPreferencesTable = {
	id: 'driver_preferences.id',
	lockedAt: 'driver_preferences.lockedAt'
};

const assignmentsTable = {
	userId: 'assignments.userId',
	status: 'assignments.status',
	date: 'assignments.date'
};

const notificationsTable = {
	userId: 'notifications.userId',
	type: 'notifications.type',
	data: 'notifications.data'
};

let GET: LockPreferencesRouteModule['GET'];

let updateReturningMock: ReturnType<
	typeof vi.fn<(shape: Record<string, unknown>) => Promise<LockedPreferenceRow[]>>
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

let sendBulkNotificationsMock: ReturnType<
	typeof vi.fn<
		(
			userIds: string[],
			type: 'assignment_confirmed',
			payload: {
				data: {
					weekStart: string;
				};
			}
		) => Promise<Map<string, unknown>>
	>
>;
let generateWeekScheduleMock: ReturnType<
	typeof vi.fn<(targetWeekStart: Date) => Promise<ScheduleResult>>
>;
let getWeekStartMock: ReturnType<typeof vi.fn<(date: Date) => Date>>;

function createAuthorizedEvent(token: string = CRON_TOKEN) {
	return createRequestEvent({
		method: 'GET',
		headers: {
			authorization: `Bearer ${token}`
		}
	});
}

beforeEach(async () => {
	vi.resetModules();

	updateReturningMock = vi.fn<(shape: Record<string, unknown>) => Promise<LockedPreferenceRow[]>>(
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

	selectWhereMock = vi.fn<(whereClause: unknown) => Promise<unknown[]>>(async () => []);
	selectFromMock = vi.fn<(table: unknown) => { where: typeof selectWhereMock }>(() => ({
		where: selectWhereMock
	}));
	selectMock = vi.fn<(shape: Record<string, unknown>) => { from: typeof selectFromMock }>(() => ({
		from: selectFromMock
	}));

	sendBulkNotificationsMock = vi.fn(async () => new Map<string, unknown>());
	generateWeekScheduleMock = vi.fn(async () => ({
		created: 0,
		skipped: 0,
		unfilled: 0,
		errors: []
	}));
	getWeekStartMock = vi.fn(() => new Date('2026-02-09T00:00:00.000Z'));

	const childLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	};

	vi.doMock('$env/static/private', () => ({ CRON_SECRET: CRON_TOKEN }));
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));

	vi.doMock('$lib/server/db', () => ({
		db: {
			update: updateMock,
			select: selectMock
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		driverPreferences: driverPreferencesTable,
		assignments: assignmentsTable,
		notifications: notificationsTable
	}));

	vi.doMock('drizzle-orm', () => ({
		and: (...conditions: unknown[]) => ({ conditions }),
		eq: (left: unknown, right: unknown) => ({ left, right }),
		gte: (left: unknown, right: unknown) => ({ left, right }),
		isNotNull: (column: unknown) => ({ column }),
		isNull: (column: unknown) => ({ column }),
		lt: (left: unknown, right: unknown) => ({ left, right }),
		ne: (left: unknown, right: unknown) => ({ left, right }),
		or: (...conditions: unknown[]) => ({ conditions }),
		sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
			strings: Array.from(strings),
			values
		})
	}));

	vi.doMock('$lib/server/services/notifications', () => ({
		sendBulkNotifications: sendBulkNotificationsMock
	}));

	vi.doMock('$lib/server/services/scheduling', () => ({
		generateWeekSchedule: generateWeekScheduleMock,
		getWeekStart: getWeekStartMock
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => childLogger)
		}
	}));

	({ GET } = await import('../../src/routes/api/cron/lock-preferences/+server'));
});

afterEach(() => {
	resetTime();
	vi.clearAllMocks();
	vi.doUnmock('$env/static/private');
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/services/scheduling');
	vi.doUnmock('$lib/server/logger');
});

describe('GET /api/cron/lock-preferences contract', () => {
	it('returns 401 when authorization is missing', async () => {
		const response = await GET(createRequestEvent({ method: 'GET' }) as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
		expect(updateMock).not.toHaveBeenCalled();
	});

	it('returns 200 success payload with locked count, schedule, and notified count', async () => {
		freezeTime('2026-02-10T05:00:00.000Z');
		const schedule: ScheduleResult = {
			created: 3,
			skipped: 1,
			unfilled: 0,
			errors: []
		};

		updateReturningMock.mockResolvedValueOnce([{ id: 'pref-1' }, { id: 'pref-2' }]);
		generateWeekScheduleMock.mockResolvedValueOnce(schedule);
		selectWhereMock
			.mockResolvedValueOnce([
				{ userId: 'driver-1' },
				{ userId: 'driver-2' },
				{ userId: 'driver-1' }
			] as AssignmentUserRow[])
			.mockResolvedValueOnce([] as ExistingNotificationRow[]);
		sendBulkNotificationsMock.mockResolvedValueOnce(
			new Map<string, unknown>([
				['driver-1', { sent: true }],
				['driver-2', { sent: true }]
			])
		);

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			lockedCount: 2,
			schedule,
			notifiedCount: 2
		});
		expect(sendBulkNotificationsMock).toHaveBeenCalledTimes(1);
	});

	it('deduplicates already-notified users from notification recipients', async () => {
		freezeTime('2026-02-10T05:00:00.000Z');
		updateReturningMock.mockResolvedValueOnce([{ id: 'pref-1' }]);
		generateWeekScheduleMock.mockResolvedValueOnce({
			created: 1,
			skipped: 0,
			unfilled: 0,
			errors: []
		});
		selectWhereMock
			.mockResolvedValueOnce([
				{ userId: 'driver-1' },
				{ userId: 'driver-2' },
				{ userId: 'driver-3' }
			] as AssignmentUserRow[])
			.mockResolvedValueOnce([{ userId: 'driver-2' }] as ExistingNotificationRow[]);
		sendBulkNotificationsMock.mockResolvedValueOnce(
			new Map<string, unknown>([
				['driver-1', { sent: true }],
				['driver-3', { sent: true }]
			])
		);

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		expect(sendBulkNotificationsMock).toHaveBeenCalledWith(
			['driver-1', 'driver-3'],
			'assignment_confirmed',
			expect.objectContaining({
				data: expect.objectContaining({
					weekStart: expect.any(String)
				})
			})
		);
	});

	it('skips notification send when there are no recipients', async () => {
		freezeTime('2026-02-10T05:00:00.000Z');
		updateReturningMock.mockResolvedValueOnce([{ id: 'pref-1' }]);
		generateWeekScheduleMock.mockResolvedValueOnce({
			created: 1,
			skipped: 0,
			unfilled: 0,
			errors: []
		});
		selectWhereMock
			.mockResolvedValueOnce([{ userId: 'driver-1' }] as AssignmentUserRow[])
			.mockResolvedValueOnce([{ userId: 'driver-1' }] as ExistingNotificationRow[]);

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			success: true,
			notifiedCount: 0
		});
		expect(sendBulkNotificationsMock).not.toHaveBeenCalled();
	});

	it('returns 500 when schedule generation fails', async () => {
		freezeTime('2026-02-10T05:00:00.000Z');
		updateReturningMock.mockResolvedValueOnce([{ id: 'pref-1' }]);
		generateWeekScheduleMock.mockRejectedValueOnce(new Error('scheduler unavailable'));

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
	});
});
