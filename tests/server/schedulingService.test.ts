import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { format } from 'date-fns-tz';

type SchedulingModule = typeof import('../../src/lib/server/services/scheduling');

type SelectResult = unknown;

let selectQueue: SelectResult[] = [];

function setSelectResults(results: SelectResult[]) {
	selectQueue = [...results];
}

function nextSelectResult() {
	if (selectQueue.length === 0) {
		throw new Error('No mocked select result available');
	}

	return selectQueue.shift();
}

const selectMock = vi.fn((_shape?: unknown) => {
	const chain = {
		from: vi.fn(() => chain),
		innerJoin: vi.fn((_table: unknown, _on: unknown) => chain),
		where: vi.fn(async (_condition: unknown) => nextSelectResult())
	};

	return chain;
});

let getWeekStart: SchedulingModule['getWeekStart'];
let getDriverWeeklyAssignmentCount: SchedulingModule['getDriverWeeklyAssignmentCount'];
let canDriverTakeAssignment: SchedulingModule['canDriverTakeAssignment'];

beforeAll(async () => {
	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock
		}
	}));

	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: vi.fn(async () => undefined)
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

	({ getWeekStart, getDriverWeeklyAssignmentCount, canDriverTakeAssignment } =
		(await import('../../src/lib/server/services/scheduling')) as SchedulingModule);
}, 15_000);

beforeEach(() => {
	setSelectResults([]);
	selectMock.mockClear();
});

afterAll(() => {
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/logger');
	vi.clearAllMocks();
});

describe('scheduling service boundaries', () => {
	it('normalizes Sundays to the prior Monday week start', () => {
		const weekStart = getWeekStart(new Date('2026-02-08T12:00:00.000Z'));

		expect(format(weekStart, 'yyyy-MM-dd', { timeZone: 'America/Toronto' })).toBe('2026-02-02');
	});

	it('keeps week-start boundaries stable across DST fallback weekend', () => {
		const weekStart = getWeekStart(new Date('2026-11-01T05:30:00.000Z'));

		expect(format(weekStart, 'yyyy-MM-dd', { timeZone: 'America/Toronto' })).toBe('2026-10-26');
	});

	it('returns zero when no weekly assignment count row exists', async () => {
		setSelectResults([[]]);

		await expect(
			getDriverWeeklyAssignmentCount('driver-empty', new Date('2026-02-02T00:00:00.000Z'), 'org-a')
		).resolves.toBe(0);
	});

	it('blocks flagged drivers from taking additional assignments', async () => {
		setSelectResults([[{ weeklyCap: 4, isFlagged: true }]]);

		await expect(
			canDriverTakeAssignment('driver-flagged', new Date('2026-02-02T00:00:00.000Z'), 'org-a')
		).resolves.toBe(false);
	});

	it('allows drivers below weekly cap and blocks those at cap', async () => {
		setSelectResults([
			[{ weeklyCap: 4, isFlagged: false }],
			[{ count: 3 }],
			[{ weeklyCap: 4, isFlagged: false }],
			[{ count: 4 }]
		]);

		const weekStart = new Date('2026-02-02T00:00:00.000Z');

		await expect(canDriverTakeAssignment('driver-under-cap', weekStart, 'org-a')).resolves.toBe(
			true
		);
		await expect(canDriverTakeAssignment('driver-at-cap', weekStart, 'org-a')).resolves.toBe(false);
	});

	it('denies drivers when user lookup is out-of-org', async () => {
		setSelectResults([[]]);

		await expect(
			canDriverTakeAssignment('driver-cross-org', new Date('2026-02-02T00:00:00.000Z'), 'org-a')
		).resolves.toBe(false);
	});
});
