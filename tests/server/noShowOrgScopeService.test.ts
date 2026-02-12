import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBoundaryMock } from '../harness/serviceMocks';
import { freezeTime, resetTime } from '../harness/time';

type NoShowModule = typeof import('../../src/lib/server/services/noshow');

interface CandidateRow {
	assignmentId: string;
	routeId: string;
	warehouseId: string;
	assignmentDate: string;
	assignmentStatus: 'scheduled';
	driverId: string | null;
	driverName: string | null;
	routeName: string | null;
	routeStartTime: string | null;
	warehouseName: string | null;
	existingWindowId: string | null;
	arrivedAt: Date | null;
}

let detectNoShowsForOrganization: NoShowModule['detectNoShowsForOrganization'];

let candidates: CandidateRow[];
let dbSelectMock: ReturnType<typeof vi.fn>;
let dbUpdateMock: ReturnType<typeof vi.fn>;
let createBidWindowMock: ReturnType<
	typeof createBoundaryMock<
		[assignmentId: string, options: Record<string, unknown>],
		Promise<unknown>
	>
>;
let sendManagerAlertMock: ReturnType<typeof createBoundaryMock<unknown[], Promise<boolean>>>;
let createAuditLogMock: ReturnType<typeof createBoundaryMock<unknown[], Promise<void>>>;
let getEmergencyBonusPercentMock: ReturnType<
	typeof createBoundaryMock<[organizationId: string], Promise<number>>
>;

function createCandidate(overrides: Partial<CandidateRow> = {}): CandidateRow {
	return {
		assignmentId: 'assignment-1',
		routeId: 'route-1',
		warehouseId: 'warehouse-1',
		assignmentDate: '2026-02-10',
		assignmentStatus: 'scheduled',
		driverId: 'driver-1',
		driverName: 'Driver One',
		routeName: 'Downtown Route',
		routeStartTime: '09:00',
		warehouseName: 'Warehouse A',
		existingWindowId: null,
		arrivedAt: null,
		...overrides
	};
}

beforeEach(async () => {
	vi.resetModules();
	freezeTime('2026-02-10T15:00:00.000Z');
	candidates = [];

	const selectChain = {
		from: vi.fn(() => selectChain),
		innerJoin: vi.fn((_table: unknown, _on: unknown) => selectChain),
		leftJoin: vi.fn((_table: unknown, _on: unknown) => selectChain),
		where: vi.fn(async (_condition: unknown) => candidates)
	};

	const updateWhereMock = vi.fn(async (_condition: unknown) => undefined);
	const updateSetMock = vi.fn((_values: Record<string, unknown>) => ({ where: updateWhereMock }));

	dbSelectMock = vi.fn((_selection?: unknown) => selectChain);
	dbUpdateMock = vi.fn((_table: unknown) => ({ set: updateSetMock }));

	createBidWindowMock = createBoundaryMock<[string, Record<string, unknown>], Promise<unknown>>();
	sendManagerAlertMock = createBoundaryMock<unknown[], Promise<boolean>>();
	createAuditLogMock = createBoundaryMock<unknown[], Promise<void>>();
	getEmergencyBonusPercentMock = createBoundaryMock<[string], Promise<number>>();

	createBidWindowMock.mockResolvedValue({
		success: true,
		bidWindowId: 'window-1',
		notifiedCount: 2
	});
	sendManagerAlertMock.mockResolvedValue(true);
	createAuditLogMock.mockResolvedValue();
	getEmergencyBonusPercentMock.mockResolvedValue(20);

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: dbSelectMock,
			update: dbUpdateMock
		}
	}));

	vi.doMock('$lib/server/services/bidding', () => ({
		createBidWindow: createBidWindowMock
	}));

	vi.doMock('$lib/server/services/notifications', () => ({
		sendManagerAlert: sendManagerAlertMock
	}));

	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: createAuditLogMock
	}));

	vi.doMock('$lib/server/services/dispatchSettings', () => ({
		getEmergencyBonusPercent: getEmergencyBonusPercentMock
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }))
		}
	}));

	({ detectNoShowsForOrganization } =
		(await import('../../src/lib/server/services/noshow')) as NoShowModule);
});

afterEach(() => {
	resetTime();
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/services/bidding');
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/services/dispatchSettings');
	vi.doUnmock('$lib/server/logger');
	vi.clearAllMocks();
});

describe('no-show service org scoping', () => {
	it('creates emergency windows with organization scope', async () => {
		candidates.push(createCandidate());

		await detectNoShowsForOrganization('org-a');

		expect(getEmergencyBonusPercentMock).toHaveBeenCalledWith('org-a');
		expect(createBidWindowMock).toHaveBeenCalledWith(
			'assignment-1',
			expect.objectContaining({ organizationId: 'org-a', mode: 'emergency' })
		);
		expect(sendManagerAlertMock).toHaveBeenCalledWith(
			'route-1',
			'driver_no_show',
			expect.any(Object),
			'org-a'
		);
	});

	it('does not fan out when org-scoped candidate set is empty', async () => {
		candidates = [];

		const result = await detectNoShowsForOrganization('org-a');

		expect(result.noShows).toBe(0);
		expect(createBidWindowMock).not.toHaveBeenCalled();
		expect(sendManagerAlertMock).not.toHaveBeenCalled();
	});
});
