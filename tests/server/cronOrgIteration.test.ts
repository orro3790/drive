import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';
import { freezeTime, resetTime } from '../harness/time';

type AutoDropRouteModule = typeof import('../../src/routes/api/cron/auto-drop-unconfirmed/+server');

interface AutoDropCandidate {
	id: string;
	userId: string;
	routeId: string;
	date: string;
	routeName: string;
}

interface OrganizationRow {
	id: string;
}

interface CreateBidWindowResult {
	success: boolean;
	bidWindowId?: string;
	reason?: string;
}

const CRON_TOKEN = 'test-cron-secret';

let GET: AutoDropRouteModule['GET'];

let createBidWindowMock: ReturnType<typeof vi.fn>;
let sendNotificationMock: ReturnType<typeof vi.fn>;
let createAuditLogMock: ReturnType<typeof vi.fn>;

let organizationRows: OrganizationRow[];
let candidatesByCallIndex: AutoDropCandidate[][];
let candidateCallIndex: number;

let updateWhereMock: ReturnType<typeof vi.fn>;
let updateSetMock: ReturnType<typeof vi.fn>;
let updateMock: ReturnType<typeof vi.fn>;
let transactionMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
	vi.resetModules();
	freezeTime('2026-03-10T11:00:00.000Z');

	organizationRows = [{ id: 'org-1' }];
	candidatesByCallIndex = [];
	candidateCallIndex = 0;

	createBidWindowMock = vi.fn(
		async (): Promise<CreateBidWindowResult> => ({
			success: true,
			bidWindowId: 'window-1'
		})
	);
	sendNotificationMock = vi.fn(async () => undefined);
	createAuditLogMock = vi.fn(async () => undefined);

	// Build a select chain that handles two select patterns:
	// 1. db.select({id}).from(organizations) → returns organizationRows
	// 2. db.select({...}).from(assignments).innerJoin(routes).innerJoin(warehouses).where(...) → returns candidates
	// NOTE: Discriminates by select-shape key count. If the production org query
	// ever selects additional columns, this mock must be updated.
	const selectMock = vi.fn((selectShape: Record<string, unknown>) => {
		// Org query: only {id} selected
		if (Object.keys(selectShape).length === 1 && 'id' in selectShape) {
			return {
				from: vi.fn(async () => organizationRows)
			};
		}

		// Candidate query: multiple fields
		return {
			from: vi.fn(() => ({
				innerJoin: vi.fn(() => ({
					innerJoin: vi.fn(() => ({
						where: vi.fn(async () => {
							const candidates = candidatesByCallIndex[candidateCallIndex] ?? [];
							candidateCallIndex++;
							return candidates;
						})
					}))
				}))
			}))
		};
	});

	updateWhereMock = vi.fn(async () => []);
	updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
	updateMock = vi.fn(() => ({ set: updateSetMock }));
	transactionMock = vi.fn(async (callback: (tx: unknown) => Promise<void>) => {
		await callback({ update: updateMock });
	});

	const childLogger = {
		child: vi.fn(),
		info: vi.fn(),
		error: vi.fn()
	};
	childLogger.child.mockReturnValue(childLogger);

	vi.doMock('$env/static/private', () => ({
		CRON_SECRET: CRON_TOKEN
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
	vi.doMock('$lib/server/db/schema', () => ({
		assignments: {
			id: 'assignments.id',
			userId: 'assignments.userId',
			routeId: 'assignments.routeId',
			warehouseId: 'assignments.warehouseId',
			date: 'assignments.date',
			status: 'assignments.status',
			confirmedAt: 'assignments.confirmedAt',
			cancelType: 'assignments.cancelType',
			updatedAt: 'assignments.updatedAt'
		},
		driverMetrics: {
			userId: 'driver_metrics.userId',
			autoDroppedShifts: 'driver_metrics.autoDroppedShifts',
			updatedAt: 'driver_metrics.updatedAt'
		},
		organizations: { id: 'organizations.id' },
		routes: { id: 'routes.id', name: 'routes.name' },
		warehouses: {
			id: 'warehouses.id',
			organizationId: 'warehouses.organizationId'
		}
	}));
	vi.doMock('drizzle-orm', () => ({
		eq: (left: unknown, right: unknown) => ({ left, right }),
		and: (...conditions: unknown[]) => ({ conditions }),
		gte: (left: unknown, right: unknown) => ({ operator: 'gte', left, right }),
		isNotNull: (left: unknown) => ({ operator: 'isNotNull', left }),
		isNull: (left: unknown) => ({ operator: 'isNull', left }),
		sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
			strings: Array.from(strings),
			values
		})
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
		default: { child: vi.fn(() => childLogger) }
	}));

	({ GET } = await import('../../src/routes/api/cron/auto-drop-unconfirmed/+server'));
}, 20_000);

afterEach(() => {
	resetTime();
	vi.doUnmock('$env/static/private');
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/services/bidding');
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/logger');
	vi.clearAllMocks();
});

function createEvent() {
	return createRequestEvent({
		method: 'GET',
		headers: { authorization: `Bearer ${CRON_TOKEN}` }
	}) as Parameters<typeof GET>[0];
}

describe('cron multi-org iteration (auto-drop-unconfirmed)', () => {
	it('iterates over all organizations and processes each independently', async () => {
		organizationRows = [{ id: 'org-a' }, { id: 'org-b' }];

		// First org query returns one candidate, second returns one candidate
		candidatesByCallIndex = [
			[
				{
					id: 'assignment-a1',
					userId: 'driver-a1',
					routeId: 'route-a',
					date: '2026-03-11',
					routeName: 'Route A'
				}
			],
			[
				{
					id: 'assignment-b1',
					userId: 'driver-b1',
					routeId: 'route-b',
					date: '2026-03-11',
					routeName: 'Route B'
				}
			]
		];

		const response = await GET(createEvent());
		const payload = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.dropped).toBe(2);
		expect(payload.bidWindowsCreated).toBe(2);

		// Verify createBidWindow called with correct org for each candidate
		expect(createBidWindowMock).toHaveBeenCalledTimes(2);
		expect(createBidWindowMock).toHaveBeenCalledWith(
			'assignment-a1',
			expect.objectContaining({ organizationId: 'org-a' })
		);
		expect(createBidWindowMock).toHaveBeenCalledWith(
			'assignment-b1',
			expect.objectContaining({ organizationId: 'org-b' })
		);

		// Verify notifications sent with correct org
		expect(sendNotificationMock).toHaveBeenCalledTimes(2);
		expect(sendNotificationMock).toHaveBeenCalledWith(
			'driver-a1',
			'shift_auto_dropped',
			expect.objectContaining({ organizationId: 'org-a' })
		);
		expect(sendNotificationMock).toHaveBeenCalledWith(
			'driver-b1',
			'shift_auto_dropped',
			expect.objectContaining({ organizationId: 'org-b' })
		);
	});

	it('returns zero totals when no organizations exist', async () => {
		organizationRows = [];

		const response = await GET(createEvent());
		const payload = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.dropped).toBe(0);
		expect(payload.bidWindowsCreated).toBe(0);
		expect(payload.errors).toBe(0);

		expect(createBidWindowMock).not.toHaveBeenCalled();
		expect(sendNotificationMock).not.toHaveBeenCalled();
	});

	it('processes all orgs even when one has no candidates', async () => {
		organizationRows = [{ id: 'org-active' }, { id: 'org-empty' }];

		// First org has a candidate, second has none
		candidatesByCallIndex = [
			[
				{
					id: 'assignment-active',
					userId: 'driver-active',
					routeId: 'route-active',
					date: '2026-03-11',
					routeName: 'Route Active'
				}
			],
			[]
		];

		const response = await GET(createEvent());
		const payload = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.dropped).toBe(1);
		expect(payload.bidWindowsCreated).toBe(1);

		expect(createBidWindowMock).toHaveBeenCalledTimes(1);
		expect(createBidWindowMock).toHaveBeenCalledWith(
			'assignment-active',
			expect.objectContaining({ organizationId: 'org-active' })
		);
	});
});
