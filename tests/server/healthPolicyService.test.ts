import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type HealthModule = typeof import('../../src/lib/server/services/health');

type SelectResult = unknown;

let selectQueue: SelectResult[] = [];

function nextSelectResult() {
	if (selectQueue.length === 0) {
		throw new Error('No mock select result available');
	}

	return selectQueue.shift();
}

const selectMock = vi.fn((_selection?: unknown) => {
	const chain = {
		from: vi.fn(() => chain),
		innerJoin: vi.fn((_table: unknown, _on: unknown) => chain),
		leftJoin: vi.fn((_table: unknown, _on: unknown) => chain),
		where: vi.fn(async (_condition: unknown) => nextSelectResult())
	};

	return chain;
});

let computeDailyScore: HealthModule['computeDailyScore'];
let evaluateWeek: HealthModule['evaluateWeek'];

function setSelectResults(results: SelectResult[]) {
	selectQueue = [...results];
}

beforeAll(async () => {
	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock
		}
	}));

	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: vi.fn(async () => undefined)
	}));

	vi.doMock('$lib/server/services/notifications', () => ({
		sendNotification: vi.fn(async () => ({ inAppCreated: true, pushSent: false }))
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => ({
				info: vi.fn(),
				debug: vi.fn(),
				warn: vi.fn(),
				error: vi.fn()
			}))
		}
	}));

	({ computeDailyScore, evaluateWeek } =
		(await import('../../src/lib/server/services/health')) as HealthModule);
}, 20_000);

beforeEach(() => {
	selectQueue = [];
	selectMock.mockClear();
});

afterAll(() => {
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/logger');
	vi.clearAllMocks();
});

describe('driver health policy regression coverage', () => {
	it('returns null daily score for onboarding drivers with zero shifts', async () => {
		setSelectResults([[{ totalShifts: 0 }]]);

		await expect(computeDailyScore('driver-new')).resolves.toBeNull();
		expect(selectMock).toHaveBeenCalledTimes(1);
	});

	it('caps daily score at 49 when a hard-stop event is active', async () => {
		setSelectResults([
			[{ totalShifts: 12 }],
			[{ lastScoreResetAt: null }],
			[{ count: 10 }],
			[{ count: 10 }],
			[{ count: 10 }],
			[{ count: 10 }],
			[{ count: 0 }],
			[{ count: 0 }],
			[{ count: 10 }],
			[{ count: 0 }],
			[{ count: 1 }],
			[{ count: 0 }]
		]);

		const result = await computeDailyScore('driver-hard-stop');

		expect(result).toMatchObject({
			score: 49,
			hardStopTriggered: true,
			noShowCount30d: 1,
			lateCancellationCount30d: 0
		});
		expect(result?.reasons).toContain('No-show in last 30 days');
	});

	it('treats zero-assignment weeks as neutral for streak progression', async () => {
		setSelectResults([
			[],
			[
				{
					stars: 2,
					streakWeeks: 2
				}
			]
		]);

		const result = await evaluateWeek('driver-neutral', new Date('2026-02-02T00:00:00.000Z'));

		expect(result).toMatchObject({
			neutral: true,
			qualified: false,
			hardStopReset: false,
			previousStars: 2,
			newStars: 2,
			previousStreak: 2,
			newStreak: 2
		});
	});

	it('applies immediate weekly reset when rolling late-cancel threshold is breached', async () => {
		setSelectResults([
			[{ id: 'a-1', status: 'completed', confirmedAt: new Date('2026-02-03T00:00:00.000Z') }],
			[
				{
					stars: 3,
					streakWeeks: 3
				}
			],
			[{ count: 0 }],
			[{ count: 2 }]
		]);

		const result = await evaluateWeek('driver-reset', new Date('2026-02-02T00:00:00.000Z'));

		expect(result).toMatchObject({
			hardStopReset: true,
			qualified: false,
			neutral: false,
			previousStars: 3,
			newStars: 0,
			previousStreak: 3,
			newStreak: 0
		});
		expect(result.reasons.join(' ')).toContain('late cancellations');
	});

	it('advances stars on qualifying weeks that satisfy strict policy criteria', async () => {
		setSelectResults([
			[
				{ id: 'a-1', status: 'completed', confirmedAt: new Date('2026-02-03T00:00:00.000Z') },
				{ id: 'a-2', status: 'completed', confirmedAt: new Date('2026-02-04T00:00:00.000Z') }
			],
			[
				{
					stars: 1,
					streakWeeks: 1
				}
			],
			[{ count: 0 }],
			[{ count: 0 }],
			[
				{ parcelsStart: 100, parcelsDelivered: 100 },
				{ parcelsStart: 100, parcelsDelivered: 95 }
			],
			[{ count: 0 }],
			[{ count: 0 }]
		]);

		const result = await evaluateWeek('driver-qualified', new Date('2026-02-02T00:00:00.000Z'));

		expect(result).toMatchObject({
			qualified: true,
			hardStopReset: false,
			neutral: false,
			previousStars: 1,
			newStars: 2,
			previousStreak: 1,
			newStreak: 2
		});
		expect(result.reasons).toContain('Qualifying week — streak advanced');
	});

	it('keeps streak unchanged for non-qualifying weeks and reports failing criteria', async () => {
		setSelectResults([
			[
				{ id: 'a-1', status: 'completed', confirmedAt: new Date('2026-02-03T00:00:00.000Z') },
				{ id: 'a-2', status: 'completed', confirmedAt: new Date('2026-02-04T00:00:00.000Z') }
			],
			[
				{
					stars: 2,
					streakWeeks: 2
				}
			],
			[{ count: 0 }],
			[{ count: 0 }],
			[{ parcelsStart: 100, parcelsDelivered: 80 }],
			[{ count: 0 }],
			[{ count: 1 }]
		]);

		const result = await evaluateWeek(
			'driver-non-qualifying',
			new Date('2026-02-02T00:00:00.000Z')
		);

		expect(result).toMatchObject({
			qualified: false,
			hardStopReset: false,
			neutral: false,
			previousStars: 2,
			newStars: 2,
			previousStreak: 2,
			newStreak: 2
		});
		expect(result.reasons.join(' | ')).toContain('Completion 80% < 95%');
		expect(result.reasons.join(' | ')).toContain('1 late cancellation(s) this week');
	});
});
