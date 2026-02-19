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
const organizationsTable = {
	id: 'organizations.id'
};

let GET: HealthWeeklyRouteModule['GET'];
let runWeeklyHealthEvaluationMock: ReturnType<
	typeof vi.fn<(organizationId?: string) => Promise<WeeklySummary>>
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

	runWeeklyHealthEvaluationMock = vi.fn(async (_organizationId?: string) => ({
		evaluated: 10,
		qualified: 6,
		hardStopResets: 1,
		neutral: 3,
		errors: 0,
		elapsedMs: 35
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
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('$lib/server/services/health');
	vi.doUnmock('$lib/server/logger');
});

describe('GET /api/cron/health-weekly contract', () => {
	it('returns 401 when unauthorized', async () => {
		const response = await GET(createRequestEvent({ method: 'GET' }) as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
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
		await expect(response.json()).resolves.toMatchObject({
			success: true,
			summary: {
				evaluated: 12,
				qualified: 7,
				hardStopResets: 2,
				neutral: 3,
				errors: 1,
				elapsedMs: expect.any(Number)
			}
		});
		expect(runWeeklyHealthEvaluationMock).toHaveBeenCalledTimes(1);
		expect(runWeeklyHealthEvaluationMock).toHaveBeenCalledWith('org-1');
	});

	it('returns 500 when service throws', async () => {
		runWeeklyHealthEvaluationMock.mockRejectedValueOnce(new Error('service unavailable'));

		const response = await GET(createAuthorizedEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ message: 'Internal server error' });
	});
});
