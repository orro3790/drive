/**
 * Batch org-scope guard tests for manager-facing API endpoints.
 *
 * Verifies that requireManagerWithOrg fires correctly before any
 * business logic on all manager endpoints that currently lack tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createRequestEvent,
	type RequestEventBody,
	type RequestEventOptions
} from '../harness/requestEvent';

function buildOptions(
	method: string,
	userLocals: Partial<App.Locals>,
	extra?: { body?: RequestEventBody; params?: Record<string, string> }
): RequestEventOptions {
	const opts: RequestEventOptions = { method, locals: userLocals as App.Locals };
	if (extra?.body) opts.body = extra.body;
	if (extra?.params) opts.params = extra.params;
	return opts;
}

function createUser(
	role: 'driver' | 'manager',
	id: string,
	organizationId?: string | null
): App.Locals['user'] {
	return {
		id,
		role,
		name: `${role}-${id}`,
		email: `${id}@example.test`,
		organizationId: organizationId ?? null
	} as App.Locals['user'];
}

function locals(user?: App.Locals['user']): Partial<App.Locals> {
	if (!user) return {};
	return { user, organizationId: user.organizationId ?? undefined };
}

const noopDb = {
	select: vi.fn(() => {
		throw new Error('DB should not be reached');
	}),
	insert: vi.fn(() => {
		throw new Error('DB should not be reached');
	}),
	update: vi.fn(() => {
		throw new Error('DB should not be reached');
	}),
	delete: vi.fn(() => {
		throw new Error('DB should not be reached');
	}),
	transaction: vi.fn(() => {
		throw new Error('DB should not be reached');
	})
};

const noopLogger = {
	child: vi.fn(() => noopLogger),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn()
};

function setupCommonMocks() {
	vi.doMock('$lib/server/db', () => ({ db: noopDb }));
	vi.doMock('$lib/server/db/schema', () => new Proxy({}, { get: () => ({}) }));
	vi.doMock('drizzle-orm', () => ({
		eq: vi.fn(),
		and: vi.fn(),
		asc: vi.fn(),
		desc: vi.fn(),
		gte: vi.fn(),
		gt: vi.fn(),
		lt: vi.fn(),
		lte: vi.fn(),
		ne: vi.fn(),
		or: vi.fn(),
		count: vi.fn(),
		inArray: vi.fn(),
		isNotNull: vi.fn(),
		isNull: vi.fn(),
		sql: vi.fn(),
		ilike: vi.fn()
	}));
	vi.doMock('$lib/server/logger', () => ({
		default: noopLogger,
		toSafeErrorMessage: vi.fn(() => 'safe_error')
	}));
	vi.doMock('$lib/server/services/managers', () => ({
		getManagerWarehouseIds: vi.fn(),
		canManagerAccessWarehouse: vi.fn()
	}));
	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: vi.fn()
	}));
	vi.doMock('$lib/server/services/bidding', () => ({
		getExpiredBidWindows: vi.fn(),
		resolveBidWindow: vi.fn(),
		getBidWindowDetail: vi.fn()
	}));
	vi.doMock('$lib/server/services/notifications', () => ({
		sendNotification: vi.fn(),
		sendBulkNotifications: vi.fn(),
		sendManagerAlert: vi.fn()
	}));
	vi.doMock('$lib/server/services/assignments', () => ({
		manualAssignDriverToAssignment: vi.fn()
	}));
	vi.doMock('$lib/server/services/health', () => ({
		computeContributions: vi.fn()
	}));
	vi.doMock('$lib/server/services/routeHelpers', () => ({
		toLocalYmd: vi.fn(),
		isValidDate: vi.fn(),
		isShiftStarted: vi.fn(),
		deriveShiftProgress: vi.fn()
	}));
	vi.doMock('$lib/server/time/toronto', () => ({
		getWeekStartFromDateString: vi.fn(),
		getDayOfWeekFromDateString: vi.fn(),
		addDaysToDateString: vi.fn()
	}));
	vi.doMock('$lib/server/realtime/managerSse', () => ({
		broadcastAssignmentUpdated: vi.fn(),
		broadcastBidWindowClosed: vi.fn()
	}));
	vi.doMock('$lib/config/dispatchPolicy', () => ({
		dispatchPolicy: {
			health: {},
			shifts: {},
			scheduling: {},
			confirmation: {},
			bidding: {},
			flagging: {},
			jobs: {}
		},
		getAttendanceThreshold: vi.fn(),
		isRewardEligible: vi.fn()
	}));
	// Schema mocks
	vi.doMock('$lib/schemas/driver', () => ({
		driverUpdateSchema: { safeParse: vi.fn() }
	}));
	vi.doMock('$lib/schemas/route', () => ({
		routeCreateSchema: { safeParse: vi.fn() },
		routeUpdateSchema: { safeParse: vi.fn() },
		routeIdParamsSchema: { safeParse: vi.fn() }
	}));
	vi.doMock('$lib/schemas/warehouse', () => ({
		warehouseCreateSchema: { safeParse: vi.fn() },
		warehouseUpdateSchema: { safeParse: vi.fn() }
	}));
	vi.doMock('$lib/schemas/assignment', () => ({
		assignmentIdParamsSchema: { safeParse: vi.fn() },
		assignmentManualAssignSchema: { safeParse: vi.fn() }
	}));
	vi.doMock('$lib/schemas/api/bidding', () => ({
		bidWindowListQuerySchema: { safeParse: vi.fn() },
		bidWindowIdParamsSchema: { safeParse: vi.fn() }
	}));
	vi.doMock('$lib/schemas/weeklyReports', () => ({}));
	vi.doMock('$lib/schemas/driverShiftHistory', () => ({}));
	vi.doMock('$lib/schemas/health', () => ({}));
	vi.doMock('date-fns', () => ({
		addDays: vi.fn()
	}));
	vi.doMock('date-fns-tz', () => ({
		format: vi.fn(),
		toZonedTime: vi.fn()
	}));
	// Chainable zod mock — every method returns the proxy itself
	const zodChain: unknown = new Proxy(
		{ safeParse: vi.fn(), parse: vi.fn(), _def: {} },
		{
			get(target, prop) {
				if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
				return vi.fn(() => zodChain);
			}
		}
	);
	vi.doMock('zod', () => ({
		z: new Proxy(
			{},
			{
				get() {
					return vi.fn(() => zodChain);
				}
			}
		)
	}));
}

function teardownMocks() {
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/logger');
	vi.doUnmock('$lib/server/services/managers');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/services/bidding');
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/services/assignments');
	vi.doUnmock('$lib/server/services/health');
	vi.doUnmock('$lib/server/services/routeHelpers');
	vi.doUnmock('$lib/server/time/toronto');
	vi.doUnmock('$lib/server/realtime/managerSse');
	vi.doUnmock('$lib/config/dispatchPolicy');
	vi.doUnmock('$lib/schemas/driver');
	vi.doUnmock('$lib/schemas/route');
	vi.doUnmock('$lib/schemas/warehouse');
	vi.doUnmock('$lib/schemas/assignment');
	vi.doUnmock('$lib/schemas/api/bidding');
	vi.doUnmock('$lib/schemas/weeklyReports');
	vi.doUnmock('$lib/schemas/driverShiftHistory');
	vi.doUnmock('$lib/schemas/health');
	vi.doUnmock('date-fns');
	vi.doUnmock('date-fns-tz');
	vi.doUnmock('zod');
}

function testManagerGuard(
	description: string,
	importPath: string,
	handlerName: string,
	method: string,
	extra?: { body?: RequestEventBody; params?: Record<string, string> }
) {
	describe(description, () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let handler: any;

		beforeEach(async () => {
			vi.resetModules();
			setupCommonMocks();
			const mod = await import(importPath);
			handler = mod[handlerName];
		}, 20_000);

		afterEach(() => {
			teardownMocks();
			vi.clearAllMocks();
		});

		it('returns 401 when no user is present', async () => {
			const event = createRequestEvent(buildOptions(method, locals(), extra));
			await expect(handler(event)).rejects.toMatchObject({ status: 401 });
		});

		it('returns 403 when user has no organizationId', async () => {
			const event = createRequestEvent(
				buildOptions(method, { user: createUser('manager', 'manager-1', null) }, extra)
			);
			await expect(handler(event)).rejects.toMatchObject({ status: 403 });
		});

		it('returns 403 for non-manager role', async () => {
			const event = createRequestEvent(
				buildOptions(method, locals(createUser('driver', 'driver-1', 'org-test')), extra)
			);
			await expect(handler(event)).rejects.toMatchObject({ status: 403 });
		});
	});
}

// ─── Driver Management ───

testManagerGuard('GET /api/drivers guard', '../../src/routes/api/drivers/+server', 'GET', 'GET');

testManagerGuard(
	'PATCH /api/drivers/[id] guard',
	'../../src/routes/api/drivers/[id]/+server',
	'PATCH',
	'PATCH',
	{ params: { id: 'driver-1' }, body: { weeklyCapOverride: 5 } }
);

testManagerGuard(
	'GET /api/drivers/[id]/shifts guard',
	'../../src/routes/api/drivers/[id]/shifts/+server',
	'GET',
	'GET',
	{ params: { id: 'driver-1' } }
);

testManagerGuard(
	'GET /api/drivers/[id]/health guard',
	'../../src/routes/api/drivers/[id]/health/+server',
	'GET',
	'GET',
	{ params: { id: 'driver-1' } }
);

// ─── Routes Management ───

testManagerGuard('GET /api/routes guard', '../../src/routes/api/routes/+server', 'GET', 'GET');

testManagerGuard('POST /api/routes guard', '../../src/routes/api/routes/+server', 'POST', 'POST', {
	body: { name: 'Route A', warehouseId: 'wh-1' }
});

testManagerGuard(
	'PATCH /api/routes/[id] guard',
	'../../src/routes/api/routes/[id]/+server',
	'PATCH',
	'PATCH',
	{ params: { id: 'route-1' }, body: { name: 'Updated Route' } }
);

testManagerGuard(
	'DELETE /api/routes/[id] guard',
	'../../src/routes/api/routes/[id]/+server',
	'DELETE',
	'DELETE',
	{ params: { id: 'route-1' } }
);

// ─── Warehouses Management ───

testManagerGuard(
	'GET /api/warehouses guard',
	'../../src/routes/api/warehouses/+server',
	'GET',
	'GET'
);

testManagerGuard(
	'POST /api/warehouses guard',
	'../../src/routes/api/warehouses/+server',
	'POST',
	'POST',
	{ body: { name: 'Warehouse A' } }
);

testManagerGuard(
	'GET /api/warehouses/[id] guard',
	'../../src/routes/api/warehouses/[id]/+server',
	'GET',
	'GET',
	{ params: { id: 'wh-1' } }
);

testManagerGuard(
	'PATCH /api/warehouses/[id] guard',
	'../../src/routes/api/warehouses/[id]/+server',
	'PATCH',
	'PATCH',
	{ params: { id: 'wh-1' }, body: { name: 'Updated Warehouse' } }
);

testManagerGuard(
	'DELETE /api/warehouses/[id] guard',
	'../../src/routes/api/warehouses/[id]/+server',
	'DELETE',
	'DELETE',
	{ params: { id: 'wh-1' } }
);

testManagerGuard(
	'GET /api/warehouses/[id]/managers guard',
	'../../src/routes/api/warehouses/[id]/managers/+server',
	'GET',
	'GET',
	{ params: { id: 'wh-1' } }
);

testManagerGuard(
	'POST /api/warehouses/[id]/managers guard',
	'../../src/routes/api/warehouses/[id]/managers/+server',
	'POST',
	'POST',
	{ params: { id: 'wh-1' }, body: { userId: 'manager-2' } }
);

testManagerGuard(
	'DELETE /api/warehouses/[id]/managers guard',
	'../../src/routes/api/warehouses/[id]/managers/+server',
	'DELETE',
	'DELETE',
	{ params: { id: 'wh-1' }, body: { userId: 'manager-2' } }
);

// ─── Bid Windows ───

testManagerGuard(
	'GET /api/bid-windows guard',
	'../../src/routes/api/bid-windows/+server',
	'GET',
	'GET'
);

testManagerGuard(
	'POST /api/bid-windows/[id]/assign guard',
	'../../src/routes/api/bid-windows/[id]/assign/+server',
	'POST',
	'POST',
	{ params: { id: 'bw-1' }, body: { bidId: 'bid-1' } }
);

testManagerGuard(
	'POST /api/bid-windows/[id]/close guard',
	'../../src/routes/api/bid-windows/[id]/close/+server',
	'POST',
	'POST',
	{ params: { id: 'bw-1' } }
);

// ─── Assignment Management ───

testManagerGuard(
	'POST /api/assignments/[id]/assign guard',
	'../../src/routes/api/assignments/[id]/assign/+server',
	'POST',
	'POST',
	{ params: { id: 'assignment-1' }, body: { userId: 'driver-1' } }
);

// ─── Weekly Reports ───

testManagerGuard(
	'GET /api/weekly-reports guard',
	'../../src/routes/api/weekly-reports/+server',
	'GET',
	'GET'
);

testManagerGuard(
	'GET /api/weekly-reports/[weekStart] guard',
	'../../src/routes/api/weekly-reports/[weekStart]/+server',
	'GET',
	'GET',
	{ params: { weekStart: '2026-02-09' } }
);
