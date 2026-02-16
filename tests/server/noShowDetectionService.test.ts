import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBoundaryMock } from '../harness/serviceMocks';
import { freezeTime, resetTime } from '../harness/time';

type NoShowServiceModule = typeof import('../../src/lib/server/services/noshow');

interface NoShowCandidate {
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

interface CreateBidWindowResult {
	success: boolean;
	bidWindowId?: string;
	notifiedCount?: number;
	reason?: string;
}

let detectNoShows: NoShowServiceModule['detectNoShows'];

let candidates: NoShowCandidate[];
let dbSelectMock: ReturnType<typeof vi.fn>;
let dbUpdateMock: ReturnType<typeof vi.fn>;

let createBidWindowMock: ReturnType<
	typeof createBoundaryMock<
		[assignmentId: string, options: Record<string, unknown>],
		Promise<CreateBidWindowResult>
	>
>;
let sendManagerAlertMock: ReturnType<
	typeof createBoundaryMock<
		[routeId: string, alertType: string, payload: Record<string, unknown>],
		Promise<void>
	>
>;
let createAuditLogMock: ReturnType<
	typeof createBoundaryMock<[entry: Record<string, unknown>], Promise<void>>
>;
let getEmergencyBonusPercentMock: ReturnType<
	typeof createBoundaryMock<[organizationId: string], Promise<number>>
>;

function createCandidate(overrides: Partial<NoShowCandidate> = {}): NoShowCandidate {
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
	candidates = [];
	let whereCallCount = 0;

	const selectWhereMock = vi.fn(async (_condition: unknown) => {
		whereCallCount++;
		if (whereCallCount % 2 === 1) {
			return [{ id: 'org-a' }];
		}

		return candidates;
	});
	const selectChain = {
		from: vi.fn(() => selectChain),
		innerJoin: vi.fn((_table: unknown, _on: unknown) => selectChain),
		leftJoin: vi.fn((_table: unknown, _on: unknown) => selectChain),
		where: selectWhereMock
	};

	const updateWhereMock = vi.fn(async (_condition: unknown) => undefined);
	const updateSetMock = vi.fn((_values: Record<string, unknown>) => ({
		where: updateWhereMock
	}));

	dbSelectMock = vi.fn((_selection: unknown) => selectChain);
	dbUpdateMock = vi.fn((_table: unknown) => ({
		set: updateSetMock
	}));

	createBidWindowMock = createBoundaryMock<
		[string, Record<string, unknown>],
		Promise<CreateBidWindowResult>
	>();
	sendManagerAlertMock = createBoundaryMock<
		[string, string, Record<string, unknown>],
		Promise<void>
	>();
	createAuditLogMock = createBoundaryMock<[Record<string, unknown>], Promise<void>>();
	getEmergencyBonusPercentMock = createBoundaryMock<[string], Promise<number>>();

	createBidWindowMock.mockResolvedValue({
		success: true,
		bidWindowId: 'bid-window-1',
		notifiedCount: 2
	});
	sendManagerAlertMock.mockResolvedValue();
	createAuditLogMock.mockResolvedValue();
	getEmergencyBonusPercentMock.mockResolvedValue(20);

	const childLogger = {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	};

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
			child: vi.fn(() => childLogger)
		}
	}));

	({ detectNoShows } = await import('../../src/lib/server/services/noshow'));
}, 20_000);

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

describe('LC-05 cron service: detectNoShows', () => {
	it('skips candidates whose per-route deadline has not yet passed', async () => {
		// 09:00 Toronto EST = 14:00 UTC; freeze to 13:59:59 UTC (one second before)
		freezeTime('2026-02-10T13:59:59.000Z');
		candidates.push(createCandidate({ routeStartTime: '09:00' }));

		const result = await detectNoShows();

		expect(result).toMatchObject({
			evaluated: 1,
			noShows: 0,
			bidWindowsCreated: 0,
			managerAlertsSent: 0,
			driversNotified: 0,
			errors: 0,
			skippedBeforeDeadline: false
		});
		expect(dbSelectMock).toHaveBeenCalled();
		expect(createBidWindowMock).not.toHaveBeenCalled();
	});

	it('processes candidates whose per-route deadline has passed', async () => {
		// 09:00 Toronto EST = 14:00 UTC; freeze at deadline
		freezeTime('2026-02-10T14:00:00.000Z');
		candidates.push(createCandidate({ routeStartTime: '09:00' }));

		const result = await detectNoShows();

		expect(result).toMatchObject({
			evaluated: 1,
			noShows: 1,
			bidWindowsCreated: 1,
			skippedBeforeDeadline: false
		});
		expect(createBidWindowMock).toHaveBeenCalledTimes(1);
	});

	it('handles mixed routes — only flags candidates past their individual deadlines', async () => {
		// Freeze to 12:30 UTC = 07:30 Toronto EST
		freezeTime('2026-02-10T12:30:00.000Z');

		// 07:30 route: deadline passed (07:30 EST = 12:30 UTC, now >= deadline)
		candidates.push(
			createCandidate({
				assignmentId: 'early-route',
				routeStartTime: '07:30'
			})
		);
		// 09:00 route: deadline NOT passed (09:00 EST = 14:00 UTC, now < deadline)
		candidates.push(
			createCandidate({
				assignmentId: 'normal-route',
				routeStartTime: '09:00'
			})
		);

		const result = await detectNoShows();

		expect(result).toMatchObject({
			evaluated: 2,
			noShows: 1,
			bidWindowsCreated: 1
		});
		expect(createBidWindowMock).toHaveBeenCalledTimes(1);
		expect(createBidWindowMock).toHaveBeenCalledWith('early-route', expect.any(Object));
	});

	it('respects per-route deadline across DST spring-forward boundary', async () => {
		// Spring forward: 09:00 EDT = 13:00 UTC on 2026-03-08
		freezeTime('2026-03-08T12:59:59.000Z');
		candidates.push(createCandidate({ assignmentDate: '2026-03-08', routeStartTime: '09:00' }));

		const beforeCutoff = await detectNoShows();
		expect(beforeCutoff).toMatchObject({
			evaluated: 1,
			noShows: 0,
			skippedBeforeDeadline: false
		});
		expect(createBidWindowMock).not.toHaveBeenCalled();

		freezeTime('2026-03-08T13:00:00.000Z');
		const atCutoff = await detectNoShows();
		expect(atCutoff).toMatchObject({
			evaluated: 1,
			noShows: 1,
			skippedBeforeDeadline: false
		});
		expect(createBidWindowMock).toHaveBeenCalledTimes(1);
	});

	it('respects per-route deadline across DST fall-back boundary', async () => {
		// Fall back: 09:00 EST = 14:00 UTC on 2026-11-01
		freezeTime('2026-11-01T13:59:59.000Z');
		candidates.push(createCandidate({ assignmentDate: '2026-11-01', routeStartTime: '09:00' }));

		const beforeCutoff = await detectNoShows();
		expect(beforeCutoff).toMatchObject({
			evaluated: 1,
			noShows: 0,
			skippedBeforeDeadline: false
		});
		expect(createBidWindowMock).not.toHaveBeenCalled();

		freezeTime('2026-11-01T14:00:00.000Z');
		const atCutoff = await detectNoShows();
		expect(atCutoff).toMatchObject({
			evaluated: 1,
			noShows: 1,
			skippedBeforeDeadline: false
		});
		expect(createBidWindowMock).toHaveBeenCalledTimes(1);
	});

	it('remains idempotent when an open bid window already exists', async () => {
		freezeTime('2026-02-10T14:05:00.000Z');
		candidates.push(createCandidate({ existingWindowId: 'existing-window-1' }));

		const result = await detectNoShows();

		expect(result).toMatchObject({
			evaluated: 1,
			noShows: 0,
			bidWindowsCreated: 0,
			managerAlertsSent: 0,
			driversNotified: 0,
			errors: 0,
			skippedBeforeDeadline: false
		});
		expect(createBidWindowMock).not.toHaveBeenCalled();
		expect(dbUpdateMock).not.toHaveBeenCalled();
		expect(sendManagerAlertMock).not.toHaveBeenCalled();
		expect(createAuditLogMock).not.toHaveBeenCalled();
	});

	it('creates emergency windows and downstream alerts for a detected no-show', async () => {
		freezeTime('2026-02-10T14:05:00.000Z');
		candidates.push(createCandidate());
		createBidWindowMock.mockResolvedValueOnce({
			success: true,
			bidWindowId: 'bid-window-1',
			notifiedCount: 4
		});

		const result = await detectNoShows();

		expect(createBidWindowMock).toHaveBeenCalledWith('assignment-1', {
			organizationId: 'org-a',
			mode: 'emergency',
			trigger: 'no_show',
			payBonusPercent: 20,
			allowPastShift: true
		});
		expect(sendManagerAlertMock).toHaveBeenCalledWith(
			'route-1',
			'driver_no_show',
			{
				routeName: 'Downtown Route',
				driverName: 'Driver One',
				date: '2026-02-10',
				routeStartTime: '09:00'
			},
			'org-a'
		);
		expect(createAuditLogMock).toHaveBeenCalledWith(
			expect.objectContaining({
				entityType: 'assignment',
				entityId: 'assignment-1',
				action: 'no_show_detected',
				actorType: 'system',
				changes: expect.objectContaining({
					routeStartTime: '09:00',
					reason: 'no_arrival_by_09:00'
				})
			})
		);
		expect(result).toMatchObject({
			evaluated: 1,
			noShows: 1,
			bidWindowsCreated: 1,
			managerAlertsSent: 1,
			driversNotified: 4,
			errors: 0,
			skippedBeforeDeadline: false
		});
		expect(dbUpdateMock).toHaveBeenCalledTimes(2);
	});

	it('uses runtime emergency bonus from dispatch settings service', async () => {
		freezeTime('2026-02-10T14:05:00.000Z');
		candidates.push(createCandidate());
		getEmergencyBonusPercentMock.mockResolvedValueOnce(37);

		await detectNoShows();

		expect(getEmergencyBonusPercentMock).toHaveBeenCalledTimes(1);
		expect(getEmergencyBonusPercentMock).toHaveBeenCalledWith('org-a');
		expect(createBidWindowMock).toHaveBeenCalledWith(
			'assignment-1',
			expect.objectContaining({
				organizationId: 'org-a',
				mode: 'emergency',
				payBonusPercent: 37
			})
		);
	});

	it('includes routeStartTime in audit log for non-default start times', async () => {
		freezeTime('2026-02-10T12:35:00.000Z'); // 07:35 Toronto
		candidates.push(createCandidate({ routeStartTime: '07:30' }));

		await detectNoShows();

		expect(createAuditLogMock).toHaveBeenCalledWith(
			expect.objectContaining({
				changes: expect.objectContaining({
					routeStartTime: '07:30',
					reason: 'no_arrival_by_07:30'
				})
			})
		);
	});

	it('surfaces processing failures through the result error counter', async () => {
		freezeTime('2026-02-10T14:05:00.000Z');
		candidates.push(createCandidate());
		createBidWindowMock.mockRejectedValueOnce(new Error('bid window unavailable'));

		const result = await detectNoShows();

		expect(result).toMatchObject({
			evaluated: 1,
			noShows: 0,
			bidWindowsCreated: 0,
			managerAlertsSent: 0,
			driversNotified: 0,
			errors: 1,
			skippedBeforeDeadline: false
		});
		expect(sendManagerAlertMock).not.toHaveBeenCalled();
		expect(createAuditLogMock).not.toHaveBeenCalled();
	});
});
