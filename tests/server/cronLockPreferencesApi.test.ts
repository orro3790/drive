import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';
import { freezeTime, resetTime } from '../harness/time';

type LockPreferencesRouteModule =
	typeof import('../../src/routes/api/cron/lock-preferences/+server');

interface LockedPreferenceRow {
	id: string;
	userId: string;
}

interface AssignmentUserRow {
	userId: string | null;
}

interface ExistingNotificationRow {
	userId: string;
}

interface DriverRow {
	id: string;
}

interface OrganizationRow {
	id: string;
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
	userId: 'driver_preferences.userId',
	lockedAt: 'driver_preferences.lockedAt'
};

const assignmentsTable = {
	userId: 'assignments.userId',
	status: 'assignments.status',
	date: 'assignments.date'
};

const notificationsTable = {
	userId: 'notifications.userId',
	organizationId: 'notifications.organizationId',
	type: 'notifications.type',
	data: 'notifications.data'
};

const organizationsTable = {
	id: 'organizations.id'
};

const userTable = {
	id: 'user.id',
	role: 'user.role',
	organizationId: 'user.organizationId'
};

const warehousesTable = {
	id: 'warehouses.id',
	organizationId: 'warehouses.organizationId'
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

let insertReturningMock: ReturnType<
	typeof vi.fn<(shape: Record<string, unknown>) => Promise<LockedPreferenceRow[]>>
>;
let insertOnConflictDoNothingMock: ReturnType<
	typeof vi.fn<
		(options: { target: unknown }) => {
			returning: typeof insertReturningMock;
		}
	>
>;
let insertValuesMock: ReturnType<
	typeof vi.fn<
		(values: Array<Record<string, unknown>>) => {
			onConflictDoNothing: typeof insertOnConflictDoNothingMock;
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

let selectWhereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<unknown[]>>>;
let selectInnerJoinMock: ReturnType<typeof vi.fn>;
let selectFromMock: ReturnType<typeof vi.fn>;
let selectOrgFromMock: ReturnType<typeof vi.fn<(table: unknown) => Promise<OrganizationRow[]>>>;
let selectMock: ReturnType<
	typeof vi.fn<
		(shape: Record<string, unknown>) => {
			from: ReturnType<typeof vi.fn>;
		}
	>
>;

let sendBulkNotificationsMock: ReturnType<
	typeof vi.fn<
		(
			userIds: string[],
			type: string,
			payload: Record<string, unknown>
		) => Promise<Map<string, unknown>>
	>
>;
let generateWeekScheduleMock: ReturnType<
	typeof vi.fn<(targetWeekStart: Date, organizationId?: string) => Promise<ScheduleResult>>
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

	insertReturningMock = vi.fn<(shape: Record<string, unknown>) => Promise<LockedPreferenceRow[]>>(
		async () => []
	);
	insertOnConflictDoNothingMock = vi.fn<
		(options: { target: unknown }) => { returning: typeof insertReturningMock }
	>(() => ({
		returning: insertReturningMock
	}));
	insertValuesMock = vi.fn<
		(values: Array<Record<string, unknown>>) => {
			onConflictDoNothing: typeof insertOnConflictDoNothingMock;
		}
	>(() => ({
		onConflictDoNothing: insertOnConflictDoNothingMock
	}));
	insertMock = vi.fn<(table: unknown) => { values: typeof insertValuesMock }>(() => ({
		values: insertValuesMock
	}));

	selectWhereMock = vi.fn<(whereClause: unknown) => Promise<unknown[]>>(async () => []);
	selectInnerJoinMock = vi.fn((_table: unknown, _condition: unknown) => ({
		innerJoin: selectInnerJoinMock,
		where: selectWhereMock
	}));
	selectOrgFromMock = vi.fn<(table: unknown) => Promise<OrganizationRow[]>>(async () => [
		{ id: 'org-1' }
	]);
	selectFromMock = vi.fn((table: unknown) => {
		if (table === organizationsTable) {
			return Promise.resolve([{ id: 'org-1' }]);
		}

		return {
			innerJoin: selectInnerJoinMock,
			where: selectWhereMock
		};
	});
	selectMock = vi.fn<(shape: Record<string, unknown>) => { from: typeof selectFromMock }>(
		(shape) => ({
			from: 'id' in shape && shape.id === organizationsTable.id ? selectOrgFromMock : selectFromMock
		})
	);

	sendBulkNotificationsMock = vi.fn(async () => new Map<string, unknown>());
	generateWeekScheduleMock = vi.fn(async (_targetWeekStart: Date, _organizationId?: string) => ({
		created: 0,
		skipped: 0,
		unfilled: 0,
		errors: []
	}));
	getWeekStartMock = vi.fn(() => new Date('2026-02-09T00:00:00.000Z'));

	const childLogger = {
		child: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	};
	childLogger.child.mockReturnValue(childLogger);

	vi.doMock('$env/static/private', () => ({ CRON_SECRET: CRON_TOKEN }));
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));

	vi.doMock('$lib/server/db', () => ({
		db: {
			update: updateMock,
			insert: insertMock,
			select: selectMock
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		driverPreferences: driverPreferencesTable,
		assignments: assignmentsTable,
		notifications: notificationsTable,
		organizations: organizationsTable,
		user: userTable,
		warehouses: warehousesTable
	}));

	vi.doMock('drizzle-orm', () => ({
		and: (...conditions: unknown[]) => ({ conditions }),
		eq: (left: unknown, right: unknown) => ({ left, right }),
		gte: (left: unknown, right: unknown) => ({ left, right }),
		inArray: (left: unknown, right: unknown[]) => ({ left, right }),
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
		await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
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

		updateReturningMock.mockResolvedValueOnce([
			{ id: 'pref-1', userId: 'driver-1' },
			{ id: 'pref-2', userId: 'driver-2' }
		]);
		generateWeekScheduleMock.mockResolvedValueOnce(schedule);
		selectWhereMock
			.mockResolvedValueOnce([{ id: 'driver-1' }, { id: 'driver-2' }] as DriverRow[])
			.mockResolvedValueOnce([
				{ userId: 'driver-1' },
				{ userId: 'driver-2' },
				{ userId: 'driver-1' }
			] as AssignmentUserRow[])
			.mockResolvedValueOnce([] as ExistingNotificationRow[]);
		// First call: schedule_locked for locked drivers
		sendBulkNotificationsMock.mockResolvedValueOnce(
			new Map<string, unknown>([
				['driver-1', { sent: true }],
				['driver-2', { sent: true }]
			])
		);
		// Second call: assignment_confirmed for assigned drivers
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
			notifiedCount: 2,
			scheduleLockNotifiedCount: 2
		});
		expect(sendBulkNotificationsMock).toHaveBeenCalledTimes(2);
	});

	it('deduplicates already-notified users from notification recipients', async () => {
		freezeTime('2026-02-10T05:00:00.000Z');
		updateReturningMock.mockResolvedValueOnce([{ id: 'pref-1', userId: 'driver-1' }]);
		generateWeekScheduleMock.mockResolvedValueOnce({
			created: 1,
			skipped: 0,
			unfilled: 0,
			errors: []
		});
		selectWhereMock
			.mockResolvedValueOnce([
				{ id: 'driver-1' },
				{ id: 'driver-2' },
				{ id: 'driver-3' }
			] as DriverRow[])
			.mockResolvedValueOnce([
				{ userId: 'driver-1' },
				{ userId: 'driver-2' },
				{ userId: 'driver-3' }
			] as AssignmentUserRow[])
			.mockResolvedValueOnce([{ userId: 'driver-2' }] as ExistingNotificationRow[]);
		// schedule_locked
		sendBulkNotificationsMock.mockResolvedValueOnce(
			new Map<string, unknown>([['driver-1', { sent: true }]])
		);
		// assignment_confirmed
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
				organizationId: 'org-1',
				data: expect.objectContaining({
					weekStart: expect.any(String)
				})
			})
		);
	});

	it('skips assignment notification when there are no recipients but sends schedule_locked', async () => {
		freezeTime('2026-02-10T05:00:00.000Z');
		updateReturningMock.mockResolvedValueOnce([{ id: 'pref-1', userId: 'driver-1' }]);
		generateWeekScheduleMock.mockResolvedValueOnce({
			created: 1,
			skipped: 0,
			unfilled: 0,
			errors: []
		});
		selectWhereMock
			.mockResolvedValueOnce([{ id: 'driver-1' }] as DriverRow[])
			.mockResolvedValueOnce([{ userId: 'driver-1' }] as AssignmentUserRow[])
			.mockResolvedValueOnce([{ userId: 'driver-1' }] as ExistingNotificationRow[]);

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			success: true,
			notifiedCount: 0,
			scheduleLockNotifiedCount: 0
		});
		// Only schedule_locked sent, no assignment_confirmed
		expect(sendBulkNotificationsMock).toHaveBeenCalledTimes(1);
		expect(sendBulkNotificationsMock).toHaveBeenCalledWith(
			['driver-1'],
			'schedule_locked',
			expect.objectContaining({ organizationId: 'org-1' })
		);
	});

	it('returns 500 when schedule generation fails', async () => {
		freezeTime('2026-02-10T05:00:00.000Z');
		updateReturningMock.mockResolvedValueOnce([{ id: 'pref-1', userId: 'driver-1' }]);
		generateWeekScheduleMock.mockRejectedValueOnce(new Error('scheduler unavailable'));

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ message: 'Internal server error' });
	});
});
