import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';
import { createBoundaryMock } from '../harness/serviceMocks';
import { freezeTime, resetTime } from '../harness/time';

interface ReminderCandidate {
	assignmentId: string;
	userId: string | null;
	date: string;
	routeName: string;
}

type ReminderRouteModule =
	typeof import('../../src/routes/api/cron/send-confirmation-reminders/+server');
type SendNotificationMock = ReturnType<
	typeof createBoundaryMock<
		[
			userId: string,
			notificationType: string,
			options: {
				customBody: string;
				data: {
					assignmentId: string;
					routeName: string;
					date: string;
				};
			}
		],
		Promise<unknown>
	>
>;

const CRON_TOKEN = 'cron-secret-test-token';

vi.mock('$env/static/private', () => ({ CRON_SECRET: CRON_TOKEN }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));

let GET: ReminderRouteModule['GET'];
let sendNotificationMock: SendNotificationMock;
let selectMock: ReturnType<typeof vi.fn>;
let fromMock: ReturnType<typeof vi.fn>;
let innerJoinMock: ReturnType<typeof vi.fn>;
let whereMock: ReturnType<typeof vi.fn>;

function createAuthorizedCronEvent() {
	return createRequestEvent({
		method: 'GET',
		headers: {
			authorization: `Bearer ${CRON_TOKEN}`
		}
	});
}

beforeEach(async () => {
	vi.resetModules();

	sendNotificationMock = createBoundaryMock<
		[
			string,
			string,
			{
				customBody: string;
				data: {
					assignmentId: string;
					routeName: string;
					date: string;
				};
			}
		],
		Promise<unknown>
	>();

	whereMock = vi.fn(async (_condition: unknown) => [] as ReminderCandidate[]);
	innerJoinMock = vi.fn((_table: unknown, _on: unknown) => ({ where: whereMock }));
	fromMock = vi.fn((_table: unknown) => ({ innerJoin: innerJoinMock }));
	selectMock = vi.fn((_shape: Record<string, unknown>) => ({ from: fromMock }));

	const childLogger = {
		info: vi.fn(),
		error: vi.fn()
	};

	vi.doMock('$lib/server/services/notifications', () => ({
		sendNotification: sendNotificationMock
	}));

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		assignments: {
			id: 'assignments.id',
			userId: 'assignments.userId',
			date: 'assignments.date',
			status: 'assignments.status',
			confirmedAt: 'assignments.confirmedAt',
			routeId: 'assignments.routeId'
		},
		routes: {
			id: 'routes.id',
			name: 'routes.name'
		}
	}));

	vi.doMock('drizzle-orm', () => ({
		and: (...conditions: unknown[]) => ({ conditions }),
		eq: (left: unknown, right: unknown) => ({ left, right }),
		gte: (left: unknown, right: unknown) => ({ left, right }),
		isNotNull: (column: unknown) => ({ column }),
		isNull: (column: unknown) => ({ column })
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => childLogger)
		}
	}));

	({ GET } = await import('../../src/routes/api/cron/send-confirmation-reminders/+server'));
}, 20_000);

afterEach(() => {
	resetTime();
	vi.clearAllMocks();
});

describe('LC-05 cron decision logic: GET /api/cron/send-confirmation-reminders', () => {
	it('returns 401 when cron auth is missing', async () => {
		const event = createRequestEvent({ method: 'GET' });

		const response = await GET(event as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('sends reminders for deterministic target date', async () => {
		freezeTime('2026-03-02T12:00:00.000Z');
		whereMock.mockResolvedValue([
			{
				assignmentId: 'assignment-1',
				userId: 'driver-1',
				date: '2026-03-05',
				routeName: 'Route A'
			},
			{
				assignmentId: 'assignment-2',
				userId: 'driver-2',
				date: '2026-03-05',
				routeName: 'Route B'
			}
		]);
		sendNotificationMock.mockResolvedValue(undefined);

		const response = await GET(createAuthorizedCronEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			success: boolean;
			sent: number;
			errors: number;
			date: string;
			elapsedMs: number;
		};

		expect(payload.success).toBe(true);
		expect(payload.sent).toBe(2);
		expect(payload.errors).toBe(0);
		expect(payload.date).toBe('2026-03-05');
		expect(payload.elapsedMs).toBeTypeOf('number');

		expect(sendNotificationMock).toHaveBeenCalledTimes(2);
		expect(sendNotificationMock).toHaveBeenNthCalledWith(1, 'driver-1', 'confirmation_reminder', {
			customBody: 'Your shift on 2026-03-05 at Route A needs confirmation within 24 hours.',
			data: {
				assignmentId: 'assignment-1',
				routeName: 'Route A',
				date: '2026-03-05'
			}
		});
	});

	it('skips candidates that are missing userId', async () => {
		whereMock.mockResolvedValue([
			{
				assignmentId: 'assignment-missing-user',
				userId: null,
				date: '2026-03-05',
				routeName: 'Route A'
			},
			{
				assignmentId: 'assignment-valid',
				userId: 'driver-2',
				date: '2026-03-05',
				routeName: 'Route B'
			}
		]);
		sendNotificationMock.mockResolvedValue(undefined);

		const response = await GET(createAuthorizedCronEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			success: true,
			sent: 1,
			errors: 0
		});
		expect(sendNotificationMock).toHaveBeenCalledTimes(1);
		expect(sendNotificationMock).toHaveBeenCalledWith(
			'driver-2',
			'confirmation_reminder',
			expect.objectContaining({
				data: expect.objectContaining({ assignmentId: 'assignment-valid' })
			})
		);
	});

	it('continues processing when a reminder send fails', async () => {
		whereMock.mockResolvedValue([
			{
				assignmentId: 'assignment-fails',
				userId: 'driver-1',
				date: '2026-03-05',
				routeName: 'Route A'
			},
			{
				assignmentId: 'assignment-succeeds',
				userId: 'driver-2',
				date: '2026-03-05',
				routeName: 'Route B'
			}
		]);
		sendNotificationMock.mockRejectedValueOnce(new Error('FCM unavailable'));
		sendNotificationMock.mockResolvedValueOnce(undefined);

		const response = await GET(createAuthorizedCronEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			success: true,
			sent: 1,
			errors: 1
		});
		expect(sendNotificationMock).toHaveBeenCalledTimes(2);
	});
});
