import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type HealthWeeklyRouteModule = typeof import('../../src/routes/api/cron/health-weekly/+server');

interface WeeklySummary {
	evaluated: number;
	qualified: number;
	hardStopResets: number;
	neutral: number;
	errors: number;
	elapsedMs: number;
}

const CRON_TOKEN = 'cron-secret-test-token';

let GET: HealthWeeklyRouteModule['GET'];
let runWeeklyHealthEvaluationMock: ReturnType<typeof vi.fn<() => Promise<WeeklySummary>>>;

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

	runWeeklyHealthEvaluationMock = vi.fn(async () => ({
		evaluated: 10,
		qualified: 6,
		hardStopResets: 1,
		neutral: 3,
		errors: 0,
		elapsedMs: 35
	}));

	const childLogger = {
		info: vi.fn(),
		error: vi.fn()
	};

	vi.doMock('$env/static/private', () => ({ CRON_SECRET: CRON_TOKEN }));
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));

	vi.doMock('$lib/server/services/health', () => ({
		runWeeklyHealthEvaluation: runWeeklyHealthEvaluationMock
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => childLogger)
		}
	}));

	({ GET } = await import('../../src/routes/api/cron/health-weekly/+server'));
});

afterEach(() => {
	vi.clearAllMocks();
	vi.doUnmock('$env/static/private');
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/services/health');
	vi.doUnmock('$lib/server/logger');
});

describe('GET /api/cron/health-weekly contract', () => {
	it('returns 401 when unauthorized', async () => {
		const response = await GET(createRequestEvent({ method: 'GET' }) as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
		expect(runWeeklyHealthEvaluationMock).not.toHaveBeenCalled();
	});

	it('returns 200 and passes through service summary', async () => {
		const summary: WeeklySummary = {
			evaluated: 12,
			qualified: 7,
			hardStopResets: 2,
			neutral: 3,
			errors: 1,
			elapsedMs: 41
		};
		runWeeklyHealthEvaluationMock.mockResolvedValueOnce(summary);

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			summary
		});
		expect(runWeeklyHealthEvaluationMock).toHaveBeenCalledTimes(1);
	});

	it('returns 500 when service throws', async () => {
		runWeeklyHealthEvaluationMock.mockRejectedValueOnce(new Error('service unavailable'));

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
	});
});
