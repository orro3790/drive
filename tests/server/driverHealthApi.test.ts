import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HealthContributions } from '$lib/schemas/health';

import { createRequestEvent } from '../harness/requestEvent';
import { createBoundaryMock } from '../harness/serviceMocks';

type DriverHealthRouteModule = typeof import('../../src/routes/api/driver-health/+server');
type ComputeContributionsMock = ReturnType<
	typeof createBoundaryMock<
		[userId: string],
		Promise<{ contributions: HealthContributions; score: number }>
	>
>;

let limitQueue: unknown[] = [];

function setLimitResults(results: unknown[]) {
	limitQueue = [...results];
}

function nextLimitResult() {
	if (limitQueue.length === 0) {
		throw new Error('No mock query result available for limit()');
	}

	return limitQueue.shift();
}

const selectMock = vi.fn((_selection?: unknown) => {
	const chain = {
		from: vi.fn(() => chain),
		where: vi.fn((_condition: unknown) => chain),
		orderBy: vi.fn((_ordering: unknown) => chain),
		limit: vi.fn(async (_count: number) => nextLimitResult())
	};

	return chain;
});

const computeContributionsMock: ComputeContributionsMock = createBoundaryMock<
	[string],
	Promise<{ contributions: HealthContributions; score: number }>
>();

function createContributions(overrides: Partial<HealthContributions> = {}): HealthContributions {
	return {
		confirmedOnTime: { count: 4, points: 4 },
		arrivedOnTime: { count: 4, points: 8 },
		completedShifts: { count: 4, points: 8 },
		highDelivery: { count: 3, points: 3 },
		bidPickups: { count: 2, points: 4 },
		urgentPickups: { count: 1, points: 4 },
		autoDrops: { count: 0, points: 0 },
		lateCancellations: { count: 0, points: 0 },
		...overrides
	};
}

function createUser(role: 'driver' | 'manager', id: string): App.Locals['user'] {
	return {
		id,
		role,
		name: `${role}-${id}`,
		email: `${id}@example.test`,
		organizationId: 'org-test'
	} as App.Locals['user'];
}

let GET: DriverHealthRouteModule['GET'];

beforeAll(async () => {
	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock
		}
	}));

	vi.doMock('$lib/server/services/health', () => ({
		computeContributions: computeContributionsMock
	}));

	({ GET } = await import('../../src/routes/api/driver-health/+server'));
}, 15_000);

beforeEach(() => {
	setLimitResults([]);
	selectMock.mockClear();
	computeContributionsMock.mockReset();
	computeContributionsMock.mockResolvedValue({
		contributions: createContributions(),
		score: 72
	});
});

afterAll(() => {
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/services/health');
	vi.clearAllMocks();
});

describe('GET /api/driver-health contract', () => {
	it('returns 401 when no authenticated user exists', async () => {
		const event = createRequestEvent({ method: 'GET' });

		await expect(GET(event as Parameters<typeof GET>[0])).rejects.toMatchObject({ status: 401 });
		expect(selectMock).not.toHaveBeenCalled();
		expect(computeContributionsMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-driver users', async () => {
		const event = createRequestEvent({
			method: 'GET',
			locals: { user: createUser('manager', 'manager-1') }
		});

		await expect(GET(event as Parameters<typeof GET>[0])).rejects.toMatchObject({ status: 403 });
		expect(selectMock).not.toHaveBeenCalled();
		expect(computeContributionsMock).not.toHaveBeenCalled();
	});

	it('returns neutral onboarding payload when health state is missing', async () => {
		setLimitResults([[], []]);

		const event = createRequestEvent({
			method: 'GET',
			locals: { user: createUser('driver', 'driver-onboarding') }
		});

		const response = await GET(event as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);

		await expect(response.json()).resolves.toMatchObject({
			score: null,
			stars: 0,
			streakWeeks: 0,
			isOnboarding: true,
			simulation: {
				bonusEligible: false,
				bonusPercent: 10,
				label: 'simulation'
			}
		});

		expect(computeContributionsMock).not.toHaveBeenCalled();
	});

	it('returns driver-scoped health payload with hard-stop reasons and milestone simulation', async () => {
		setLimitResults([
			[
				{
					stars: 4,
					streakWeeks: 5,
					nextMilestoneStars: 4,
					assignmentPoolEligible: false,
					requiresManagerIntervention: true
				}
			],
			[
				{
					evaluatedAt: '2026-02-09',
					score: 49,
					hardStopTriggered: true,
					reasons: ['No-show in last 30 days']
				}
			]
		]);

		computeContributionsMock.mockResolvedValue({
			contributions: createContributions(),
			score: 108
		});

		const event = createRequestEvent({
			method: 'GET',
			locals: { user: createUser('driver', 'driver-elite') }
		});

		const response = await GET(event as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);

		await expect(response.json()).resolves.toMatchObject({
			tier: 'II',
			score: 108,
			stars: 4,
			streakWeeks: 5,
			isOnboarding: false,
			hardStop: {
				triggered: true,
				assignmentPoolEligible: false,
				requiresManagerIntervention: true,
				reasons: ['No-show in last 30 days']
			},
			simulation: {
				bonusEligible: true,
				bonusPercent: 10,
				label: 'simulation'
			},
			nextMilestone: {
				targetStars: 4,
				currentStars: 4
			}
		});

		expect(computeContributionsMock).toHaveBeenCalledWith('driver-elite');
	});
});
