import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';
import { freezeTime, resetTime } from '../harness/time';

type AutoDropRouteModule = typeof import('../../src/routes/api/cron/auto-drop-unconfirmed/+server');

type AutoDropCandidate = {
	id: string;
	userId: string;
	routeId: string;
	date: string;
	routeName: string;
	organizationId: string;
};

type CreateBidWindowResult = {
	success: boolean;
	bidWindowId?: string;
	reason?: string;
	notifiedCount?: number;
};

let GET: AutoDropRouteModule['GET'];

let createBidWindowMock: ReturnType<
	typeof vi.fn<
		(
			assignmentId: string,
			options: {
				organizationId: string;
				trigger: 'auto_drop';
			}
		) => Promise<CreateBidWindowResult>
	>
>;
let sendNotificationMock: ReturnType<
	typeof vi.fn<
		(
			userId: string,
			type: 'shift_auto_dropped',
			payload: {
				customBody: string;
				organizationId: string;
				data: {
					assignmentId: string;
					routeName: string;
					date: string;
				};
			}
		) => Promise<void>
	>
>;
let createAuditLogMock: ReturnType<typeof vi.fn<(entry: Record<string, unknown>) => Promise<void>>>;

let selectWhereMock: ReturnType<
	typeof vi.fn<(whereClause: unknown) => Promise<AutoDropCandidate[]>>
>;
let selectInnerJoinMock: ReturnType<
	typeof vi.fn<
		(
			joinTable: unknown,
			joinCondition: unknown
		) => {
			innerJoin: (joinTable: unknown, joinCondition: unknown) => unknown;
			where: typeof selectWhereMock;
		}
	>
>;
let selectFromMock: ReturnType<
	typeof vi.fn<
		(fromTable: unknown) => {
			innerJoin: typeof selectInnerJoinMock;
		}
	>
>;
let selectMock: ReturnType<
	typeof vi.fn<
		(selectShape: Record<string, unknown>) => {
			from: typeof selectFromMock;
		}
	>
>;

let updateWhereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<unknown[]>>>;
let updateSetMock: ReturnType<
	typeof vi.fn<(setValues: Record<string, unknown>) => { where: typeof updateWhereMock }>
>;
let updateMock: ReturnType<typeof vi.fn<(table: unknown) => { set: typeof updateSetMock }>>;
let transactionMock: ReturnType<
	typeof vi.fn<(callback: (tx: { update: typeof updateMock }) => Promise<void>) => Promise<void>>
>;

beforeEach(async () => {
	vi.resetModules();

	createBidWindowMock = vi.fn<
		(
			assignmentId: string,
			options: {
				organizationId: string;
				trigger: 'auto_drop';
			}
		) => Promise<CreateBidWindowResult>
	>();

	sendNotificationMock = vi.fn<
		(
			userId: string,
			type: 'shift_auto_dropped',
			payload: {
				customBody: string;
				organizationId: string;
				data: {
					assignmentId: string;
					routeName: string;
					date: string;
				};
			}
		) => Promise<void>
	>();

	createAuditLogMock = vi.fn<(entry: Record<string, unknown>) => Promise<void>>(
		async () => undefined
	);

	selectWhereMock = vi.fn<(whereClause: unknown) => Promise<AutoDropCandidate[]>>(async () => []);
	selectInnerJoinMock = vi.fn<
		(
			joinTable: unknown,
			joinCondition: unknown
		) => {
			innerJoin: (joinTable: unknown, joinCondition: unknown) => unknown;
			where: typeof selectWhereMock;
		}
	>(() => ({ innerJoin: selectInnerJoinMock, where: selectWhereMock }));
	selectFromMock = vi.fn<(fromTable: unknown) => { innerJoin: typeof selectInnerJoinMock }>(() => ({
		innerJoin: selectInnerJoinMock
	}));
	selectMock = vi.fn<(selectShape: Record<string, unknown>) => { from: typeof selectFromMock }>(
		() => ({ from: selectFromMock })
	);

	updateWhereMock = vi.fn<(whereClause: unknown) => Promise<unknown[]>>(async () => []);
	updateSetMock = vi.fn<(setValues: Record<string, unknown>) => { where: typeof updateWhereMock }>(
		() => ({ where: updateWhereMock })
	);
	updateMock = vi.fn<(table: unknown) => { set: typeof updateSetMock }>(() => ({
		set: updateSetMock
	}));
	transactionMock = vi.fn(async (callback) => {
		await callback({ update: updateMock });
	});

	const loggerInfoMock = vi.fn();
	const loggerErrorMock = vi.fn();

	vi.doMock('$env/static/private', () => ({
		CRON_SECRET: 'test-cron-secret'
	}));

	vi.doMock('$env/dynamic/private', () => ({
		env: {}
	}));

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			update: updateMock,
			transaction: transactionMock
		}
	}));

	vi.doMock('$lib/server/services/bidding', () => ({
		createBidWindow: createBidWindowMock
	}));

	vi.doMock('$lib/server/services/notifications', () => ({
		sendNotification: sendNotificationMock
	}));

	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: createAuditLogMock
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => ({
				info: loggerInfoMock,
				error: loggerErrorMock
			}))
		}
	}));

	({ GET } = await import('../../src/routes/api/cron/auto-drop-unconfirmed/+server'));
}, 20_000);

afterEach(() => {
	resetTime();
	vi.clearAllMocks();
	vi.doUnmock('$env/static/private');
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/services/bidding');
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/logger');
});

describe('LC-05 cron decision logic: GET /api/cron/auto-drop-unconfirmed', () => {
	it('returns 401 when cron secret does not match', async () => {
		const event = createRequestEvent({
			method: 'GET',
			headers: {
				authorization: 'Bearer wrong-secret'
			}
		});

		const response = await GET(event as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('applies the 48-hour boundary and surfaces per-assignment failures', async () => {
		freezeTime('2026-03-10T11:00:00.000Z');

		selectWhereMock.mockResolvedValue([
			{
				id: 'assignment-48h',
				userId: 'driver-ok',
				routeId: 'route-a',
				date: '2026-03-12',
				routeName: 'Route A',
				organizationId: 'org-1'
			},
			{
				id: 'assignment-72h',
				userId: 'driver-skip',
				routeId: 'route-b',
				date: '2026-03-13',
				routeName: 'Route B',
				organizationId: 'org-1'
			},
			{
				id: 'assignment-24h-no-window',
				userId: 'driver-no-window',
				routeId: 'route-c',
				date: '2026-03-11',
				routeName: 'Route C',
				organizationId: 'org-1'
			},
			{
				id: 'assignment-24h-error',
				userId: 'driver-error',
				routeId: 'route-c',
				date: '2026-03-11',
				routeName: 'Route C',
				organizationId: 'org-1'
			}
		]);

		createBidWindowMock.mockImplementation(async (assignmentId) => {
			if (assignmentId === 'assignment-48h') {
				return { success: true, bidWindowId: 'window-1' };
			}

			if (assignmentId === 'assignment-24h-no-window') {
				return { success: false, reason: 'no_eligible_drivers' };
			}

			return { success: true, bidWindowId: 'window-fallback' };
		});

		sendNotificationMock.mockImplementation(async (userId) => {
			if (userId === 'driver-error') {
				throw new Error('push delivery failed');
			}
		});

		const event = createRequestEvent({
			method: 'GET',
			headers: {
				authorization: 'Bearer test-cron-secret'
			}
		});

		const response = await GET(event as Parameters<typeof GET>[0]);
		const payload = (await response.json()) as {
			success: boolean;
			dropped: number;
			bidWindowsCreated: number;
			skippedNoWindow: number;
			errors: number;
			elapsedMs: number;
		};

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.dropped).toBe(2);
		expect(payload.bidWindowsCreated).toBe(2);
		expect(payload.skippedNoWindow).toBe(1);
		expect(payload.errors).toBe(1);
		expect(payload.elapsedMs).toBeTypeOf('number');

		expect(createBidWindowMock).toHaveBeenCalledTimes(3);
		expect(createBidWindowMock).toHaveBeenNthCalledWith(1, 'assignment-48h', {
			organizationId: 'org-1',
			trigger: 'auto_drop'
		});
		expect(createBidWindowMock).toHaveBeenNthCalledWith(2, 'assignment-24h-no-window', {
			organizationId: 'org-1',
			trigger: 'auto_drop'
		});
		expect(createBidWindowMock).toHaveBeenNthCalledWith(3, 'assignment-24h-error', {
			organizationId: 'org-1',
			trigger: 'auto_drop'
		});

		expect(sendNotificationMock).toHaveBeenCalledTimes(2);
		expect(updateMock).toHaveBeenCalledTimes(4);
		expect(transactionMock).toHaveBeenCalledTimes(2);
		expect(createAuditLogMock).toHaveBeenCalledTimes(2);
	});

	it('stays idempotent when the cron handler runs twice for the same assignment', async () => {
		freezeTime('2026-03-10T11:00:00.000Z');

		const repeatedCandidate: AutoDropCandidate = {
			id: 'assignment-repeat',
			userId: 'driver-repeat',
			routeId: 'route-repeat',
			date: '2026-03-11',
			routeName: 'Route Repeat',
			organizationId: 'org-1'
		};

		selectWhereMock.mockResolvedValue([repeatedCandidate]);
		createBidWindowMock
			.mockResolvedValueOnce({ success: true, bidWindowId: 'window-repeat' })
			.mockResolvedValueOnce({ success: false, reason: 'Open bid window already exists' });
		sendNotificationMock.mockResolvedValue(undefined);

		const firstResponse = await GET(
			createRequestEvent({
				method: 'GET',
				headers: {
					authorization: 'Bearer test-cron-secret'
				}
			}) as Parameters<typeof GET>[0]
		);
		const secondResponse = await GET(
			createRequestEvent({
				method: 'GET',
				headers: {
					authorization: 'Bearer test-cron-secret'
				}
			}) as Parameters<typeof GET>[0]
		);

		expect(firstResponse.status).toBe(200);
		expect(secondResponse.status).toBe(200);
		await expect(firstResponse.json()).resolves.toMatchObject({
			success: true,
			dropped: 1,
			bidWindowsCreated: 1,
			skippedNoWindow: 0,
			errors: 0
		});
		await expect(secondResponse.json()).resolves.toMatchObject({
			success: true,
			dropped: 0,
			bidWindowsCreated: 0,
			skippedNoWindow: 1,
			errors: 0
		});

		expect(createBidWindowMock).toHaveBeenCalledTimes(2);
		expect(transactionMock).toHaveBeenCalledTimes(1);
		expect(updateMock).toHaveBeenCalledTimes(2);
		expect(sendNotificationMock).toHaveBeenCalledTimes(1);
		expect(createAuditLogMock).toHaveBeenCalledTimes(1);
	});

	it('returns 500 when candidate lookup fails', async () => {
		selectWhereMock.mockRejectedValue(new Error('database unavailable'));

		const event = createRequestEvent({
			method: 'GET',
			headers: {
				authorization: 'Bearer test-cron-secret'
			}
		});

		const response = await GET(event as Parameters<typeof GET>[0]);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
		expect(createBidWindowMock).not.toHaveBeenCalled();
	});
});
