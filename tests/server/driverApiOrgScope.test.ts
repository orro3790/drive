/**
 * Batch org-scope guard tests for driver-facing API endpoints.
 *
 * Verifies that requireDriverWithOrg / requireAuthenticatedWithOrg fires
 * before any business logic. These endpoints already filter by userId in
 * their queries, so the guard is defense-in-depth.
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

// Shared no-op mocks — guards fire before these are reached
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
		count: vi.fn(),
		inArray: vi.fn(),
		isNotNull: vi.fn(),
		isNull: vi.fn(),
		sql: vi.fn(),
		or: vi.fn(),
		ilike: vi.fn()
	}));
	vi.doMock('$lib/server/logger', () => ({
		default: noopLogger,
		toSafeErrorMessage: vi.fn(() => 'safe_error')
	}));
	vi.doMock('$lib/server/services/scheduling', () => ({
		getWeekStart: vi.fn(),
		canDriverTakeAssignment: vi.fn()
	}));
	vi.doMock('$lib/server/services/bidding', () => ({
		getExpiredBidWindows: vi.fn(),
		resolveBidWindow: vi.fn(),
		instantAssign: vi.fn()
	}));
	vi.doMock('$lib/server/services/confirmations', () => ({
		getUnconfirmedAssignments: vi.fn()
	}));
	vi.doMock('$lib/server/services/assignmentLifecycle', () => ({
		createAssignmentLifecycleContext: vi.fn(),
		deriveAssignmentLifecycle: vi.fn()
	}));
	vi.doMock('$lib/server/services/metrics', () => ({
		updateDriverMetrics: vi.fn()
	}));
	vi.doMock('$lib/server/services/notifications', () => ({
		sendManagerAlert: vi.fn()
	}));
	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: vi.fn()
	}));
	vi.doMock('$lib/server/realtime/managerSse', () => ({
		broadcastAssignmentUpdated: vi.fn()
	}));
	vi.doMock('$lib/schemas/api/notifications', () => ({
		notificationListParamsSchema: { safeParse: vi.fn() },
		notificationListResponseSchema: { safeParse: vi.fn() },
		notificationIdSchema: { safeParse: vi.fn() },
		notificationMarkReadResponseSchema: { safeParse: vi.fn() },
		notificationMarkAllReadResponseSchema: { safeParse: vi.fn() }
	}));
	vi.doMock('$lib/schemas/preferences', () => ({
		preferencesUpdateSchema: { safeParse: vi.fn() }
	}));
	vi.doMock('date-fns', () => ({
		addDays: vi.fn(),
		parseISO: vi.fn(),
		set: vi.fn(),
		startOfDay: vi.fn()
	}));
	vi.doMock('date-fns-tz', () => ({
		format: vi.fn(),
		toZonedTime: vi.fn()
	}));
}

function teardownMocks() {
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/logger');
	vi.doUnmock('$lib/server/services/scheduling');
	vi.doUnmock('$lib/server/services/bidding');
	vi.doUnmock('$lib/server/services/confirmations');
	vi.doUnmock('$lib/server/services/assignmentLifecycle');
	vi.doUnmock('$lib/server/services/metrics');
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/realtime/managerSse');
	vi.doUnmock('$lib/schemas/api/notifications');
	vi.doUnmock('$lib/schemas/preferences');
	vi.doUnmock('date-fns');
	vi.doUnmock('date-fns-tz');
}

/**
 * Tests for endpoints using requireDriverWithOrg:
 * - 401 when no user
 * - 403 when user has no organizationId
 * - 403 when user is a manager (wrong role)
 */
function testDriverGuard(
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
				buildOptions(method, { user: createUser('driver', 'driver-1', null) }, extra)
			);
			await expect(handler(event)).rejects.toMatchObject({ status: 403 });
		});

		it('returns 403 for non-driver role', async () => {
			const event = createRequestEvent(
				buildOptions(method, locals(createUser('manager', 'manager-1', 'org-test')), extra)
			);
			await expect(handler(event)).rejects.toMatchObject({ status: 403 });
		});
	});
}

/**
 * Tests for endpoints using requireAuthenticatedWithOrg:
 * - 401 when no user
 * - 403 when user has no organizationId
 * - No role restriction (both driver and manager can access)
 */
function testAuthenticatedGuard(
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
				buildOptions(method, { user: createUser('driver', 'driver-1', null) }, extra)
			);
			await expect(handler(event)).rejects.toMatchObject({ status: 403 });
		});
	});
}

// ─── Driver Endpoints (requireDriverWithOrg) ───

testDriverGuard('GET /api/dashboard guard', '../../src/routes/api/dashboard/+server', 'GET', 'GET');

testDriverGuard(
	'GET /api/assignments/mine guard',
	'../../src/routes/api/assignments/mine/+server',
	'GET',
	'GET'
);

testDriverGuard('POST /api/bids guard', '../../src/routes/api/bids/+server', 'POST', 'POST', {
	body: { bidWindowId: 'test-window' }
});

testDriverGuard('GET /api/bids/mine guard', '../../src/routes/api/bids/mine/+server', 'GET', 'GET');

testDriverGuard(
	'GET /api/bids/available guard',
	'../../src/routes/api/bids/available/+server',
	'GET',
	'GET'
);

testDriverGuard(
	'GET /api/preferences guard',
	'../../src/routes/api/preferences/+server',
	'GET',
	'GET'
);

testDriverGuard(
	'PUT /api/preferences guard',
	'../../src/routes/api/preferences/+server',
	'PUT',
	'PUT',
	{ body: { maxDaysPerWeek: 4 } }
);

testDriverGuard(
	'GET /api/preferences/routes guard',
	'../../src/routes/api/preferences/routes/+server',
	'GET',
	'GET'
);

testDriverGuard('GET /api/metrics guard', '../../src/routes/api/metrics/+server', 'GET', 'GET');

// ─── Authenticated Endpoints (requireAuthenticatedWithOrg — no role check) ───

testAuthenticatedGuard(
	'GET /api/notifications guard',
	'../../src/routes/api/notifications/+server',
	'GET',
	'GET'
);

testAuthenticatedGuard(
	'PATCH /api/notifications/[id]/read guard',
	'../../src/routes/api/notifications/[id]/read/+server',
	'PATCH',
	'PATCH',
	{ params: { id: 'notification-1' } }
);

testAuthenticatedGuard(
	'POST /api/notifications/mark-all-read guard',
	'../../src/routes/api/notifications/mark-all-read/+server',
	'POST',
	'POST'
);
