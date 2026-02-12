import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type NotificationsModule = typeof import('../../src/lib/server/services/notifications');

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

const insertValuesMock = vi.fn(async (_values: Record<string, unknown>) => undefined);
const insertMock = vi.fn((_table: unknown) => ({ values: insertValuesMock }));

const selectMock = vi.fn((_shape?: unknown) => {
	const whereResult = {
		limit: vi.fn(async (_count?: number) => nextSelectResult()),
		then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
			Promise.resolve(nextSelectResult()).then(onFulfilled, onRejected)
	};

	const chain = {
		from: vi.fn(() => chain),
		where: vi.fn((_condition: unknown) => whereResult)
	};

	return chain;
});

let sendNotification: NotificationsModule['sendNotification'];

beforeAll(async () => {
	vi.doMock('$env/static/private', () => ({
		FIREBASE_PROJECT_ID: '',
		FIREBASE_CLIENT_EMAIL: '',
		FIREBASE_PRIVATE_KEY: ''
	}));

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			insert: insertMock
		}
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => ({
				info: vi.fn(),
				debug: vi.fn(),
				warn: vi.fn(),
				error: vi.fn()
			})),
			warn: vi.fn(),
			info: vi.fn()
		},
		toSafeErrorMessage: vi.fn((_error: unknown) => 'error')
	}));

	vi.doMock('$lib/server/services/managers', () => ({
		getRouteManager: vi.fn(async () => null)
	}));

	vi.doMock('$lib/server/services/scheduling', () => ({
		getWeekStart: vi.fn((date: Date) => date),
		canDriverTakeAssignment: vi.fn(async () => true)
	}));

	({ sendNotification } =
		(await import('../../src/lib/server/services/notifications')) as NotificationsModule);
});

beforeEach(() => {
	setSelectResults([]);
	selectMock.mockClear();
	insertMock.mockClear();
	insertValuesMock.mockClear();
});

afterAll(() => {
	vi.doUnmock('$env/static/private');
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/logger');
	vi.doUnmock('$lib/server/services/managers');
	vi.doUnmock('$lib/server/services/scheduling');
	vi.clearAllMocks();
});

describe('notification service org scoping', () => {
	it('creates same-org in-app notifications', async () => {
		setSelectResults([[{ fcmToken: null, organizationId: 'org-a' }]]);

		const result = await sendNotification('driver-1', 'manual', {
			organizationId: 'org-a',
			data: { source: 'test' }
		});

		expect(result).toMatchObject({ inAppCreated: true, pushSent: false });
		expect(insertValuesMock).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 'driver-1', organizationId: 'org-a' })
		);
	});

	it('skips cross-org notifications when recipient org mismatches', async () => {
		setSelectResults([[{ fcmToken: null, organizationId: 'org-b' }]]);

		const result = await sendNotification('driver-2', 'manual', {
			organizationId: 'org-a'
		});

		expect(result).toMatchObject({ inAppCreated: false, pushSent: false });
		expect(insertValuesMock).not.toHaveBeenCalled();
	});
});
