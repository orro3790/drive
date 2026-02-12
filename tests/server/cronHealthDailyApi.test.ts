import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type HealthDailyRouteModule = typeof import('../../src/routes/api/cron/health-daily/+server');

interface DailySummary {
	evaluated: number;
	scored: number;
	skippedNewDrivers: number;
	correctiveWarnings: number;
	errors: number;
	elapsedMs: number;
}

const CRON_TOKEN = 'cron-secret-test-token';
const organizationsTable = {
	id: 'organizations.id'
};

let GET: HealthDailyRouteModule['GET'];
let runDailyHealthEvaluationMock: ReturnType<
	typeof vi.fn<(organizationId?: string) => Promise<DailySummary>>
>;
let dbSelectMock: ReturnType<typeof vi.fn>;
let selectFromMock: ReturnType<typeof vi.fn>;

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

	runDailyHealthEvaluationMock = vi.fn(async (_organizationId?: string) => ({
		evaluated: 4,
		scored: 3,
		skippedNewDrivers: 1,
		correctiveWarnings: 1,
		errors: 0,
		elapsedMs: 15
	}));

	selectFromMock = vi.fn(async (_table: unknown) => [{ id: 'org-1' }]);
	dbSelectMock = vi.fn((_shape: Record<string, unknown>) => ({ from: selectFromMock }));

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
			select: dbSelectMock
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		organizations: organizationsTable
	}));

	vi.doMock('$lib/server/services/health', () => ({
		runDailyHealthEvaluation: runDailyHealthEvaluationMock
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => childLogger)
		}
	}));

	({ GET } = await import('../../src/routes/api/cron/health-daily/+server'));
});

afterEach(() => {
	vi.clearAllMocks();
	vi.doUnmock('$env/static/private');
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('$lib/server/services/health');
	vi.doUnmock('$lib/server/logger');
});

describe('GET /api/cron/health-daily contract', () => {
	it('returns 401 when unauthorized', async () => {
		const response = await GET(createRequestEvent({ method: 'GET' }) as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
		expect(runDailyHealthEvaluationMock).not.toHaveBeenCalled();
	});

	it('returns 200 and passes through service summary', async () => {
		const summary: DailySummary = {
			evaluated: 5,
			scored: 4,
			skippedNewDrivers: 1,
			correctiveWarnings: 2,
			errors: 0,
			elapsedMs: 20
		};
		runDailyHealthEvaluationMock.mockResolvedValueOnce(summary);

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			success: true,
			summary: {
				evaluated: 5,
				scored: 4,
				skippedNewDrivers: 1,
				correctiveWarnings: 2,
				errors: 0,
				elapsedMs: expect.any(Number)
			}
		});
		expect(runDailyHealthEvaluationMock).toHaveBeenCalledTimes(1);
		expect(runDailyHealthEvaluationMock).toHaveBeenCalledWith('org-1');
	});

	it('returns 500 when service throws', async () => {
		runDailyHealthEvaluationMock.mockRejectedValueOnce(new Error('service unavailable'));

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
	});
});
