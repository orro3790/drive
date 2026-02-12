import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';
import { createBoundaryMock } from '../harness/serviceMocks';

type BidWindowMode = 'competitive' | 'instant' | 'emergency';

interface ExpiredBidWindow {
	id: string;
	mode: BidWindowMode;
}

interface ResolveBidWindowResult {
	resolved: boolean;
	transitioned?: boolean;
	winnerId?: string | null;
	bidCount?: number;
	reason?: string;
}

type CloseBidWindowsRouteModule =
	typeof import('../../src/routes/api/cron/close-bid-windows/+server');
type GetExpiredBidWindowsMock = ReturnType<
	typeof createBoundaryMock<[cutoff?: Date, organizationId?: string], Promise<ExpiredBidWindow[]>>
>;
type ResolveBidWindowMock = ReturnType<
	typeof createBoundaryMock<
		[windowId: string, actor: { actorType: 'system'; actorId: null }, organizationId: string],
		Promise<ResolveBidWindowResult>
	>
>;

const CRON_TOKEN = 'cron-secret-test-token';

vi.mock('$env/static/private', () => ({ CRON_SECRET: CRON_TOKEN }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));

let GET: CloseBidWindowsRouteModule['GET'];
let getExpiredBidWindowsMock: GetExpiredBidWindowsMock;
let resolveBidWindowMock: ResolveBidWindowMock;
let dbSelectMock: ReturnType<typeof vi.fn>;
let selectFromMock: ReturnType<typeof vi.fn>;
let dbUpdateMock: ReturnType<typeof vi.fn>;
let updateSetMock: ReturnType<typeof vi.fn>;
let updateWhereMock: ReturnType<typeof vi.fn>;

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

	getExpiredBidWindowsMock = createBoundaryMock<
		[cutoff?: Date, organizationId?: string],
		Promise<ExpiredBidWindow[]>
	>();
	resolveBidWindowMock = createBoundaryMock<
		[windowId: string, actor: { actorType: 'system'; actorId: null }, organizationId: string],
		Promise<ResolveBidWindowResult>
	>();

	selectFromMock = vi.fn(async (_table: unknown) => [{ id: 'org-1' }]);
	dbSelectMock = vi.fn((_shape: Record<string, unknown>) => ({ from: selectFromMock }));

	updateWhereMock = vi.fn(async (_condition: unknown) => []);
	updateSetMock = vi.fn((_values: Record<string, unknown>) => ({
		where: updateWhereMock
	}));
	dbUpdateMock = vi.fn((_table: unknown) => ({
		set: updateSetMock
	}));

	const childLogger = {
		info: vi.fn(),
		error: vi.fn()
	};

	vi.doMock('$lib/server/services/bidding', () => ({
		getExpiredBidWindows: getExpiredBidWindowsMock,
		resolveBidWindow: resolveBidWindowMock
	}));

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: dbSelectMock,
			update: dbUpdateMock
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		organizations: {
			id: 'organizations.id'
		},
		bidWindows: {
			id: 'bid_windows.id'
		}
	}));

	vi.doMock('drizzle-orm', () => ({
		eq: (left: unknown, right: unknown) => ({ left, right })
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => childLogger)
		}
	}));

	({ GET } = await import('../../src/routes/api/cron/close-bid-windows/+server'));
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('LC-05 cron decision logic: GET /api/cron/close-bid-windows', () => {
	it('returns 401 when cron auth is missing', async () => {
		const event = createRequestEvent({ method: 'GET' });

		const response = await GET(event as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
		expect(getExpiredBidWindowsMock).not.toHaveBeenCalled();
	});

	it('returns a zeroed summary when no windows are expired', async () => {
		getExpiredBidWindowsMock.mockResolvedValue([]);

		const response = await GET(createAuthorizedCronEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			processed: 0,
			resolved: 0,
			transitioned: 0,
			closed: 0,
			errors: 0
		});
		expect(resolveBidWindowMock).not.toHaveBeenCalled();
		expect(getExpiredBidWindowsMock).toHaveBeenCalledWith(undefined, 'org-1');
		expect(dbUpdateMock).not.toHaveBeenCalled();
	});

	it('tracks resolved, transitioned, closed, and failed windows', async () => {
		getExpiredBidWindowsMock.mockResolvedValue([
			{ id: 'window-resolved', mode: 'competitive' },
			{ id: 'window-transitioned', mode: 'competitive' },
			{ id: 'window-closed', mode: 'instant' },
			{ id: 'window-error', mode: 'emergency' }
		]);

		resolveBidWindowMock.mockImplementation(async (windowId) => {
			switch (windowId) {
				case 'window-resolved':
					return {
						resolved: true,
						winnerId: 'driver-1',
						bidCount: 3
					};
				case 'window-transitioned':
					return {
						resolved: false,
						transitioned: true
					};
				case 'window-closed':
					return {
						resolved: false,
						transitioned: false,
						reason: 'no_bids'
					};
				case 'window-error':
					throw new Error('forced failure');
				default:
					return {
						resolved: false,
						transitioned: false,
						reason: 'not_processed'
					};
			}
		});

		const response = await GET(createAuthorizedCronEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			processed: 4,
			resolved: 1,
			transitioned: 1,
			closed: 1,
			errors: 1
		});

		expect(resolveBidWindowMock).toHaveBeenCalledTimes(4);
		expect(dbUpdateMock).toHaveBeenCalledTimes(1);
		expect(updateSetMock).toHaveBeenCalledWith({ status: 'closed' });
		expect(updateWhereMock).toHaveBeenCalledTimes(1);
	});

	it('stays idempotent when rerun after closing a no-bids window', async () => {
		getExpiredBidWindowsMock
			.mockResolvedValueOnce([{ id: 'window-closed', mode: 'instant' }])
			.mockResolvedValueOnce([]);

		resolveBidWindowMock.mockResolvedValue({
			resolved: false,
			transitioned: false,
			reason: 'no_bids'
		});

		const firstResponse = await GET(createAuthorizedCronEvent() as Parameters<typeof GET>[0]);
		const secondResponse = await GET(createAuthorizedCronEvent() as Parameters<typeof GET>[0]);

		expect(firstResponse.status).toBe(200);
		expect(secondResponse.status).toBe(200);
		await expect(firstResponse.json()).resolves.toEqual({
			success: true,
			processed: 1,
			resolved: 0,
			transitioned: 0,
			closed: 1,
			errors: 0
		});
		await expect(secondResponse.json()).resolves.toEqual({
			success: true,
			processed: 0,
			resolved: 0,
			transitioned: 0,
			closed: 0,
			errors: 0
		});

		expect(resolveBidWindowMock).toHaveBeenCalledTimes(1);
		expect(dbUpdateMock).toHaveBeenCalledTimes(1);
		expect(updateWhereMock).toHaveBeenCalledTimes(1);
	});
});
