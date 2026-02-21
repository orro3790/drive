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
const updateWhereMock = vi.fn(async (_whereClause: unknown) => undefined);
const updateSetMock = vi.fn((_values: Record<string, unknown>) => ({ where: updateWhereMock }));
const updateMock = vi.fn((_table: unknown) => ({ set: updateSetMock }));
const messagingSendMock = vi.fn(async () => 'message-id');
const getMessagingMock = vi.fn(() => ({ send: messagingSendMock }));
const getAppsMock = vi.fn(() => []);
const initializeAppMock = vi.fn(() => ({ name: 'mock-app' }));

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
		FIREBASE_PROJECT_ID: 'test-project',
		FIREBASE_CLIENT_EMAIL: 'test@example.com',
		FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----'
	}));

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			insert: insertMock,
			update: updateMock
		}
	}));

	vi.doMock('firebase-admin/app', () => ({
		initializeApp: initializeAppMock,
		getApp: vi.fn(() => {
			throw new Error('app not found');
		}),
		getApps: getAppsMock,
		cert: vi.fn((value: unknown) => value)
	}));

	vi.doMock('firebase-admin/messaging', () => ({
		getMessaging: getMessagingMock
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => ({
				info: vi.fn(),
				debug: vi.fn(),
				warn: vi.fn(),
				error: vi.fn()
			})),
			info: vi.fn(),
			debug: vi.fn(),
			warn: vi.fn(),
			error: vi.fn()
		},
		toSafeErrorMessage: vi.fn((_error: unknown) => 'error')
	}));

	vi.doMock('$lib/server/services/managers', () => ({
		getRouteManager: vi.fn(async () => null)
	}));

	vi.doMock('$lib/server/services/scheduling', () => ({
		getWeekStartForDateString: vi.fn((date: string) => date),
		canDriverTakeAssignment: vi.fn(async () => true)
	}));

	// Mock Paraglide messages — explicit function stubs (Proxy causes vitest import deadlock)
	const msgFn = (_inputs?: Record<string, unknown>) => '[mock]';
	vi.doMock('$lib/paraglide/messages.js', () => ({
		notif_shift_reminder_title: msgFn,
		notif_shift_reminder_body: msgFn,
		notif_bid_open_title: msgFn,
		notif_bid_open_body: msgFn,
		notif_bid_won_title: msgFn,
		notif_bid_won_body: msgFn,
		notif_bid_lost_title: msgFn,
		notif_bid_lost_body: msgFn,
		notif_shift_cancelled_title: msgFn,
		notif_shift_cancelled_body: msgFn,
		notif_warning_title: msgFn,
		notif_warning_body: msgFn,
		notif_manual_title: msgFn,
		notif_manual_body: msgFn,
		notif_schedule_locked_title: msgFn,
		notif_schedule_locked_body: msgFn,
		notif_assignment_confirmed_title: msgFn,
		notif_assignment_confirmed_body: msgFn,
		notif_route_unfilled_title: msgFn,
		notif_route_unfilled_body: msgFn,
		notif_route_cancelled_title: msgFn,
		notif_route_cancelled_body: msgFn,
		notif_driver_no_show_title: msgFn,
		notif_driver_no_show_body: msgFn,
		notif_confirmation_reminder_title: msgFn,
		notif_confirmation_reminder_body: msgFn,
		notif_shift_auto_dropped_title: msgFn,
		notif_shift_auto_dropped_body: msgFn,
		notif_emergency_route_available_title: msgFn,
		notif_emergency_route_available_body: msgFn,
		notif_streak_advanced_title: msgFn,
		notif_streak_advanced_body: msgFn,
		notif_streak_reset_title: msgFn,
		notif_streak_reset_body: msgFn,
		notif_bonus_eligible_title: msgFn,
		notif_bonus_eligible_body: msgFn,
		notif_corrective_warning_title: msgFn,
		notif_corrective_warning_body: msgFn,
		notif_return_exception_title: msgFn,
		notif_return_exception_body: msgFn,
		notif_stale_shift_reminder_title: msgFn,
		notif_stale_shift_reminder_body: msgFn,
		notif_pay_bonus_suffix: msgFn
	}));

	vi.doMock('$lib/paraglide/runtime.js', () => ({
		locales: ['en', 'zh', 'zh-Hant', 'ko'],
		getLocale: vi.fn(() => 'en'),
		setLocale: vi.fn(),
		isLocale: vi.fn((l: string) => ['en', 'zh', 'zh-Hant', 'ko'].includes(l))
	}));

	({ sendNotification } =
		(await import('../../src/lib/server/services/notifications')) as NotificationsModule);
});

beforeEach(() => {
	setSelectResults([]);
	selectMock.mockClear();
	insertMock.mockClear();
	insertValuesMock.mockClear();
	updateMock.mockClear();
	updateSetMock.mockClear();
	updateWhereMock.mockClear();
	messagingSendMock.mockClear();
	getMessagingMock.mockClear();
	getAppsMock.mockClear();
	initializeAppMock.mockClear();
});

afterAll(() => {
	vi.doUnmock('$env/static/private');
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/logger');
	vi.doUnmock('$lib/server/services/managers');
	vi.doUnmock('$lib/server/services/scheduling');
	vi.doUnmock('firebase-admin/app');
	vi.doUnmock('firebase-admin/messaging');
	vi.clearAllMocks();
});

describe('notification service org scoping', () => {
	it('creates same-org in-app notifications', async () => {
		setSelectResults([[{ fcmToken: null, organizationId: 'org-a', preferredLocale: 'en' }]]);

		const result = await sendNotification('driver-1', 'manual', {
			organizationId: 'org-a',
			data: { source: 'test' }
		});

		expect(result).toMatchObject({ inAppCreated: true, pushSent: false });
		expect(insertValuesMock).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 'driver-1', organizationId: 'org-a' })
		);
	});

	it('persists shift metadata and includes shift context in push payload', async () => {
		setSelectResults([[{ fcmToken: 'token-1', organizationId: 'org-a', preferredLocale: 'en' }]]);
		const shiftData = {
			assignmentId: 'assignment-1',
			assignmentDate: '2026-02-10',
			routeStartTime: '09:00'
		};
		const shiftBody = 'Your shift starts Mon, Feb 10 at 9:00 AM.';

		const result = await sendNotification('driver-shift', 'shift_reminder', {
			organizationId: 'org-a',
			renderBody: () => shiftBody,
			data: shiftData
		});

		expect(result).toMatchObject({ inAppCreated: true, pushSent: true });
		expect(insertValuesMock).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'driver-shift',
				type: 'shift_reminder',
				body: shiftBody,
				data: shiftData
			})
		);
		expect(messagingSendMock).toHaveBeenCalledWith(
			expect.objectContaining({
				notification: expect.objectContaining({ body: shiftBody }),
				data: expect.objectContaining(shiftData)
			})
		);
	});

	it('skips cross-org notifications when recipient org mismatches', async () => {
		setSelectResults([[{ fcmToken: null, organizationId: 'org-b', preferredLocale: 'en' }]]);

		const result = await sendNotification('driver-2', 'manual', {
			organizationId: 'org-a'
		});

		expect(result).toMatchObject({ inAppCreated: false, pushSent: false });
		expect(insertValuesMock).not.toHaveBeenCalled();
	});

	it('classifies retryable FCM failures as transient without token cleanup', async () => {
		setSelectResults([
			[{ fcmToken: 'token-transient', organizationId: 'org-a', preferredLocale: 'en' }]
		]);
		messagingSendMock.mockRejectedValueOnce({
			code: 'messaging/server-unavailable',
			message: 'temporary outage'
		});

		const result = await sendNotification('driver-3', 'manual', {
			organizationId: 'org-a'
		});

		expect(result).toMatchObject({
			inAppCreated: true,
			pushSent: false,
			pushError: 'push_failed_transient',
			pushErrorCode: 'messaging/server-unavailable',
			retryable: true,
			tokenInvalidated: false
		});
		expect(updateMock).not.toHaveBeenCalled();
	});

	it('classifies invalid-token failures as terminal and clears stored token', async () => {
		setSelectResults([
			[{ fcmToken: 'token-dead', organizationId: 'org-a', preferredLocale: 'en' }]
		]);
		messagingSendMock.mockRejectedValueOnce({
			code: 'messaging/registration-token-not-registered',
			message: 'token no longer valid'
		});

		const result = await sendNotification('driver-4', 'manual', {
			organizationId: 'org-a'
		});

		expect(result).toMatchObject({
			inAppCreated: true,
			pushSent: false,
			pushError: 'push_failed_terminal',
			pushErrorCode: 'messaging/registration-token-not-registered',
			retryable: false,
			tokenInvalidated: true
		});
		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(updateSetMock).toHaveBeenCalledWith(expect.objectContaining({ fcmToken: null }));
	});
});
