import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type ShiftRemindersRouteModule = typeof import('../../src/routes/api/cron/shift-reminders/+server');

interface TodayAssignment {
	assignmentId: string;
	userId: string | null;
	routeName: string;
	warehouseName: string;
	routeStartTime?: string;
}

interface StartedShiftRow {
	assignmentId: string;
}

interface OrganizationRow {
	id: string;
}

const CRON_TOKEN = 'cron-secret-test-token';

const assignmentsTable = {
	id: 'assignments.id',
	userId: 'assignments.userId',
	routeId: 'assignments.routeId',
	warehouseId: 'assignments.warehouseId',
	date: 'assignments.date',
	status: 'assignments.status'
};

const routesTable = {
	id: 'routes.id',
	name: 'routes.name',
	startTime: 'routes.startTime'
};

const shiftsTable = {
	assignmentId: 'shifts.assignmentId',
	startedAt: 'shifts.startedAt'
};

const warehousesTable = {
	id: 'warehouses.id',
	name: 'warehouses.name'
};

let GET: ShiftRemindersRouteModule['GET'];

let selectWhereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<unknown[]>>>;
let selectInnerJoinMock: ReturnType<typeof vi.fn>;
let selectFromMock: ReturnType<typeof vi.fn>;
let selectOrgFromMock: ReturnType<typeof vi.fn<(fromTable: unknown) => Promise<OrganizationRow[]>>>;
let selectMock: ReturnType<typeof vi.fn>;

let sendNotificationMock: ReturnType<
	typeof vi.fn<
		(
			userId: string,
			type: 'shift_reminder',
			payload: {
				customBody: string;
				organizationId: string;
				data: {
					assignmentId: string;
					routeName: string;
					warehouseName: string;
					date: string;
					dedupeKey: string;
				};
			}
		) => Promise<unknown>
	>
>;

let formatMock: ReturnType<typeof vi.fn<(date: Date, pattern: string) => string>>;
let toZonedTimeMock: ReturnType<typeof vi.fn<(date: Date, timeZone: string) => Date>>;

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

	selectWhereMock = vi.fn<(whereClause: unknown) => Promise<unknown[]>>(async () => []);
	selectInnerJoinMock = vi.fn((table: unknown, condition: unknown) => ({
		innerJoin: selectInnerJoinMock,
		where: selectWhereMock
	}));
	selectOrgFromMock = vi.fn<(fromTable: unknown) => Promise<OrganizationRow[]>>(async () => [
		{ id: 'org-1' }
	]);
	selectFromMock = vi.fn((table: unknown) => ({
		innerJoin: selectInnerJoinMock,
		where: selectWhereMock
	}));
	selectMock = vi.fn((shape: Record<string, unknown>) => {
		if (Object.keys(shape).length === 1 && 'id' in shape) {
			return { from: selectOrgFromMock };
		}

		return { from: selectFromMock };
	});

	sendNotificationMock = vi.fn(async () => ({ inAppCreated: true, pushSent: true }));
	formatMock = vi.fn(() => '2026-02-09');
	toZonedTimeMock = vi.fn((date: Date) => date);

	const childLogger = {
		child: vi.fn(),
		info: vi.fn(),
		error: vi.fn()
	};
	childLogger.child.mockReturnValue(childLogger);

	vi.doMock('$env/static/private', () => ({ CRON_SECRET: CRON_TOKEN }));
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		assignments: assignmentsTable,
		organizations: {
			id: 'organizations.id'
		},
		notifications: {
			organizationId: 'notifications.organizationId',
			type: 'notifications.type',
			userId: 'notifications.userId',
			data: 'notifications.data'
		},
		routes: routesTable,
		shifts: shiftsTable,
		warehouses: warehousesTable
	}));

	vi.doMock('drizzle-orm', () => ({
		and: (...conditions: unknown[]) => ({ conditions }),
		eq: (left: unknown, right: unknown) => ({ left, right }),
		inArray: (left: unknown, right: unknown[]) => ({ left, right }),
		isNotNull: (column: unknown) => ({ column }),
		sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })
	}));

	vi.doMock('$lib/server/services/notifications', () => ({
		sendNotification: sendNotificationMock
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => childLogger)
		}
	}));

	vi.doMock('date-fns-tz', () => ({
		format: formatMock,
		toZonedTime: toZonedTimeMock
	}));

	({ GET } = await import('../../src/routes/api/cron/shift-reminders/+server'));
});

afterEach(() => {
	vi.clearAllMocks();
	vi.doUnmock('$env/static/private');
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/logger');
	vi.doUnmock('date-fns-tz');
});

describe('GET /api/cron/shift-reminders contract', () => {
	it('returns 401 when auth token is missing', async () => {
		const response = await GET(createRequestEvent({ method: 'GET' }) as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 401 when auth token is wrong', async () => {
		const response = await GET(createAuthorizedEvent('wrong-token') as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 200 and excludes assignments that already have started shifts', async () => {
		const todayAssignments: TodayAssignment[] = [
			{
				assignmentId: 'assignment-1',
				userId: 'driver-1',
				routeName: 'Route A',
				warehouseName: 'Warehouse A',
				routeStartTime: '09:00'
			},
			{
				assignmentId: 'assignment-2',
				userId: 'driver-2',
				routeName: 'Route B',
				warehouseName: 'Warehouse B',
				routeStartTime: '09:00'
			},
			{
				assignmentId: 'assignment-3',
				userId: 'driver-3',
				routeName: 'Route C',
				warehouseName: 'Warehouse C',
				routeStartTime: '09:00'
			}
		];
		const startedRows: StartedShiftRow[] = [{ assignmentId: 'assignment-2' }];

		selectWhereMock
			.mockResolvedValueOnce(todayAssignments)
			.mockResolvedValueOnce(startedRows)
			.mockResolvedValueOnce([]);

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);
		const payload = (await response.json()) as {
			success: boolean;
			sentCount: number;
			skippedDuplicates: number;
			errorCount: number;
			elapsedMs: number;
		};

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.sentCount).toBe(2);
		expect(payload.skippedDuplicates).toBe(0);
		expect(payload.errorCount).toBe(0);
		expect(payload.elapsedMs).toBeTypeOf('number');

		expect(sendNotificationMock).toHaveBeenCalledTimes(2);
		expect(sendNotificationMock).toHaveBeenNthCalledWith(1, 'driver-1', 'shift_reminder', {
			customBody: 'Your shift on route Route A at Warehouse A starts at 9:00 AM today.',
			organizationId: 'org-1',
			data: {
				assignmentId: 'assignment-1',
				routeName: 'Route A',
				routeStartTime: '09:00',
				warehouseName: 'Warehouse A',
				date: '2026-02-09',
				dedupeKey: 'shift_reminder:org-1:assignment-1:driver-1:2026-02-09'
			}
		});
		expect(sendNotificationMock).toHaveBeenNthCalledWith(2, 'driver-3', 'shift_reminder', {
			customBody: 'Your shift on route Route C at Warehouse C starts at 9:00 AM today.',
			organizationId: 'org-1',
			data: {
				assignmentId: 'assignment-3',
				routeName: 'Route C',
				routeStartTime: '09:00',
				warehouseName: 'Warehouse C',
				date: '2026-02-09',
				dedupeKey: 'shift_reminder:org-1:assignment-3:driver-3:2026-02-09'
			}
		});
	});

	it('returns 200 and continues when one notification send fails', async () => {
		const todayAssignments: TodayAssignment[] = [
			{
				assignmentId: 'assignment-1',
				userId: 'driver-1',
				routeName: 'Route A',
				warehouseName: 'Warehouse A'
			},
			{
				assignmentId: 'assignment-2',
				userId: 'driver-2',
				routeName: 'Route B',
				warehouseName: 'Warehouse B'
			}
		];

		selectWhereMock
			.mockResolvedValueOnce(todayAssignments)
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);
		sendNotificationMock.mockRejectedValueOnce(new Error('push failure'));
		sendNotificationMock.mockResolvedValueOnce({ inAppCreated: true, pushSent: true });

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			success: true,
			sentCount: 1,
			errorCount: 1
		});
		expect(sendNotificationMock).toHaveBeenCalledTimes(2);
	});

	it('returns 200 and skips reminders with existing dedupe keys', async () => {
		const todayAssignments: TodayAssignment[] = [
			{
				assignmentId: 'assignment-1',
				userId: 'driver-1',
				routeName: 'Route A',
				warehouseName: 'Warehouse A'
			},
			{
				assignmentId: 'assignment-2',
				userId: 'driver-2',
				routeName: 'Route B',
				warehouseName: 'Warehouse B'
			}
		];

		selectWhereMock
			.mockResolvedValueOnce(todayAssignments)
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([
				{ dedupeKey: 'shift_reminder:org-1:assignment-1:driver-1:2026-02-09' }
			]);

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			success: true,
			sentCount: 1,
			skippedDuplicates: 1,
			errorCount: 0
		});
		expect(sendNotificationMock).toHaveBeenCalledTimes(1);
		expect(sendNotificationMock).toHaveBeenCalledWith(
			'driver-2',
			'shift_reminder',
			expect.objectContaining({
				organizationId: 'org-1',
				data: expect.objectContaining({
					dedupeKey: 'shift_reminder:org-1:assignment-2:driver-2:2026-02-09'
				})
			})
		);
	});

	it('stays idempotent when executed twice for the same day', async () => {
		const todayAssignments: TodayAssignment[] = [
			{
				assignmentId: 'assignment-1',
				userId: 'driver-1',
				routeName: 'Route A',
				warehouseName: 'Warehouse A'
			}
		];

		selectWhereMock
			.mockResolvedValueOnce(todayAssignments)
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce(todayAssignments)
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([
				{ dedupeKey: 'shift_reminder:org-1:assignment-1:driver-1:2026-02-09' }
			]);

		const firstResponse = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);
		const secondResponse = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(firstResponse.status).toBe(200);
		expect(secondResponse.status).toBe(200);
		await expect(firstResponse.json()).resolves.toMatchObject({
			success: true,
			sentCount: 1,
			skippedDuplicates: 0,
			errorCount: 0
		});
		await expect(secondResponse.json()).resolves.toMatchObject({
			success: true,
			sentCount: 0,
			skippedDuplicates: 1,
			errorCount: 0
		});
		expect(sendNotificationMock).toHaveBeenCalledTimes(1);
	});

	it('returns 500 when assignment candidate query fails', async () => {
		selectWhereMock.mockRejectedValueOnce(new Error('database unavailable'));

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
		expect(sendNotificationMock).not.toHaveBeenCalled();
	});
});
