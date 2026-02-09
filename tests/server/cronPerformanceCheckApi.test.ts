import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type PerformanceCheckRouteModule =
	typeof import('../../src/routes/api/cron/performance-check/+server');

interface DriverRow {
	id: string;
}

interface FlaggingResult {
	warningSent: boolean;
	gracePenaltyApplied: boolean;
	rewardApplied: boolean;
}

const CRON_TOKEN = 'cron-secret-test-token';

const userTable = {
	id: 'user.id',
	role: 'user.role'
};

let GET: PerformanceCheckRouteModule['GET'];

let whereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<DriverRow[]>>>;
let fromMock: ReturnType<typeof vi.fn<(table: unknown) => { where: typeof whereMock }>>;
let selectMock: ReturnType<
	typeof vi.fn<
		(shape: Record<string, unknown>) => {
			from: typeof fromMock;
		}
	>
>;

let updateDriverMetricsMock: ReturnType<typeof vi.fn<(userId: string) => Promise<void>>>;
let checkAndApplyFlagMock: ReturnType<typeof vi.fn<(userId: string) => Promise<FlaggingResult>>>;

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

	whereMock = vi.fn<(whereClause: unknown) => Promise<DriverRow[]>>(async () => []);
	fromMock = vi.fn<(table: unknown) => { where: typeof whereMock }>(() => ({
		where: whereMock
	}));
	selectMock = vi.fn<(shape: Record<string, unknown>) => { from: typeof fromMock }>(() => ({
		from: fromMock
	}));

	updateDriverMetricsMock = vi.fn(async () => undefined);
	checkAndApplyFlagMock = vi.fn(async () => ({
		warningSent: false,
		gracePenaltyApplied: false,
		rewardApplied: false
	}));

	const childLogger = {
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn()
	};

	vi.doMock('$env/static/private', () => ({ CRON_SECRET: CRON_TOKEN }));
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		user: userTable
	}));

	vi.doMock('drizzle-orm', () => ({
		eq: (left: unknown, right: unknown) => ({ left, right })
	}));

	vi.doMock('$lib/server/services/metrics', () => ({
		updateDriverMetrics: updateDriverMetricsMock
	}));

	vi.doMock('$lib/server/services/flagging', () => ({
		checkAndApplyFlag: checkAndApplyFlagMock
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => childLogger)
		}
	}));

	({ GET } = await import('../../src/routes/api/cron/performance-check/+server'));
});

afterEach(() => {
	vi.clearAllMocks();
	vi.doUnmock('$env/static/private');
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/services/metrics');
	vi.doUnmock('$lib/server/services/flagging');
	vi.doUnmock('$lib/server/logger');
});

describe('GET /api/cron/performance-check contract', () => {
	it('returns 401 when token is missing', async () => {
		const response = await GET(createRequestEvent({ method: 'GET' }) as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 200 with zeroed summary when no drivers exist', async () => {
		whereMock.mockResolvedValueOnce([]);

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			summary: {
				driversChecked: 0,
				newlyFlagged: 0,
				capsReduced: 0,
				rewardsGranted: 0,
				errors: 0
			},
			elapsedMs: expect.any(Number)
		});
		expect(updateDriverMetricsMock).not.toHaveBeenCalled();
		expect(checkAndApplyFlagMock).not.toHaveBeenCalled();
	});

	it('returns 200 and aggregates mixed Promise outcomes', async () => {
		whereMock.mockResolvedValueOnce([
			{ id: 'driver-1' },
			{ id: 'driver-2' },
			{ id: 'driver-3' },
			{ id: 'driver-4' }
		]);

		checkAndApplyFlagMock.mockImplementation(async (userId) => {
			switch (userId) {
				case 'driver-1':
					return {
						warningSent: true,
						gracePenaltyApplied: true,
						rewardApplied: false
					};
				case 'driver-2':
					return {
						warningSent: false,
						gracePenaltyApplied: false,
						rewardApplied: true
					};
				case 'driver-3':
					throw new Error('driver processing failed');
				default:
					return {
						warningSent: false,
						gracePenaltyApplied: false,
						rewardApplied: false
					};
			}
		});

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			summary: {
				driversChecked: 3,
				newlyFlagged: 1,
				capsReduced: 1,
				rewardsGranted: 1,
				errors: 1
			},
			elapsedMs: expect.any(Number)
		});

		expect(updateDriverMetricsMock).toHaveBeenCalledTimes(4);
		expect(checkAndApplyFlagMock).toHaveBeenCalledTimes(4);
	});

	it('returns 500 when top-level driver query fails', async () => {
		whereMock.mockRejectedValueOnce(new Error('database unavailable'));

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
		expect(updateDriverMetricsMock).not.toHaveBeenCalled();
		expect(checkAndApplyFlagMock).not.toHaveBeenCalled();
	});
});
