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

let GET: HealthDailyRouteModule['GET'];
let runDailyHealthEvaluationMock: ReturnType<typeof vi.fn<() => Promise<DailySummary>>>;

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

	runDailyHealthEvaluationMock = vi.fn(async () => ({
		evaluated: 4,
		scored: 3,
		skippedNewDrivers: 1,
		correctiveWarnings: 1,
		errors: 0,
		elapsedMs: 15
	}));

	const childLogger = {
		info: vi.fn(),
		error: vi.fn()
	};

	vi.doMock('$env/static/private', () => ({ CRON_SECRET: CRON_TOKEN }));
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));

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
		await expect(response.json()).resolves.toEqual({
			success: true,
			summary
		});
		expect(runDailyHealthEvaluationMock).toHaveBeenCalledTimes(1);
	});

	it('returns 500 when service throws', async () => {
		runDailyHealthEvaluationMock.mockRejectedValueOnce(new Error('service unavailable'));

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
	});
});
