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
	warehouseName: string | null;
	existingWindowId: string | null;
	arrivedAt: Date | null;
}

interface CreateBidWindowResult {
	success: boolean;
	bidWindowId?: string;
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
let notifyAvailableDriversForEmergencyMock: ReturnType<
	typeof createBoundaryMock<[payload: Record<string, unknown>], Promise<number>>
>;
let createAuditLogMock: ReturnType<
	typeof createBoundaryMock<[entry: Record<string, unknown>], Promise<void>>
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
		warehouseName: 'Warehouse A',
		existingWindowId: null,
		arrivedAt: null,
		...overrides
	};
}

beforeEach(async () => {
	vi.resetModules();
	candidates = [];

	const selectWhereMock = vi.fn(async (_condition: unknown) => candidates);
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
	notifyAvailableDriversForEmergencyMock = createBoundaryMock<
		[Record<string, unknown>],
		Promise<number>
	>();
	createAuditLogMock = createBoundaryMock<[Record<string, unknown>], Promise<void>>();

	createBidWindowMock.mockResolvedValue({ success: true, bidWindowId: 'bid-window-1' });
	sendManagerAlertMock.mockResolvedValue();
	notifyAvailableDriversForEmergencyMock.mockResolvedValue(2);
	createAuditLogMock.mockResolvedValue();

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
		sendManagerAlert: sendManagerAlertMock,
		notifyAvailableDriversForEmergency: notifyAvailableDriversForEmergencyMock
	}));
	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: createAuditLogMock
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
	vi.doUnmock('$lib/server/logger');
	vi.clearAllMocks();
});

describe('LC-05 cron service: detectNoShows', () => {
	it('skips processing before the Toronto 9 AM arrival deadline', async () => {
		freezeTime('2026-02-10T13:59:59.000Z');

		const result = await detectNoShows();

		expect(result).toEqual({
			evaluated: 0,
			noShows: 0,
			bidWindowsCreated: 0,
			managerAlertsSent: 0,
			driversNotified: 0,
			errors: 0,
			skippedBeforeDeadline: true
		});
		expect(dbSelectMock).not.toHaveBeenCalled();
	});

	it('honors the Toronto 9 AM cutoff on DST spring-forward day', async () => {
		freezeTime('2026-03-08T12:59:59.000Z');

		const beforeCutoff = await detectNoShows();
		expect(beforeCutoff.skippedBeforeDeadline).toBe(true);

		freezeTime('2026-03-08T13:00:00.000Z');
		candidates.push(createCandidate({ assignmentDate: '2026-03-08' }));

		const atCutoff = await detectNoShows();
		expect(atCutoff.skippedBeforeDeadline).toBe(false);
		expect(createBidWindowMock).toHaveBeenCalledTimes(1);
	});

	it('honors the Toronto 9 AM cutoff on DST fall-back day', async () => {
		freezeTime('2026-11-01T13:59:59.000Z');

		const beforeCutoff = await detectNoShows();
		expect(beforeCutoff.skippedBeforeDeadline).toBe(true);

		freezeTime('2026-11-01T14:00:00.000Z');
		candidates.push(createCandidate({ assignmentDate: '2026-11-01' }));

		const atCutoff = await detectNoShows();
		expect(atCutoff.skippedBeforeDeadline).toBe(false);
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
		expect(notifyAvailableDriversForEmergencyMock).not.toHaveBeenCalled();
		expect(createAuditLogMock).not.toHaveBeenCalled();
	});

	it('creates emergency windows and downstream alerts for a detected no-show', async () => {
		freezeTime('2026-02-10T14:05:00.000Z');
		candidates.push(createCandidate());
		notifyAvailableDriversForEmergencyMock.mockResolvedValueOnce(4);

		const result = await detectNoShows();

		expect(createBidWindowMock).toHaveBeenCalledWith('assignment-1', {
			mode: 'emergency',
			trigger: 'no_show',
			payBonusPercent: 20,
			allowPastShift: true
		});
		expect(sendManagerAlertMock).toHaveBeenCalledWith('route-1', 'driver_no_show', {
			routeName: 'Downtown Route',
			driverName: 'Driver One',
			date: '2026-02-10'
		});
		expect(notifyAvailableDriversForEmergencyMock).toHaveBeenCalledWith({
			assignmentId: 'assignment-1',
			routeName: 'Downtown Route',
			warehouseName: 'Warehouse A',
			date: '2026-02-10',
			payBonusPercent: 20
		});
		expect(createAuditLogMock).toHaveBeenCalledWith(
			expect.objectContaining({
				entityType: 'assignment',
				entityId: 'assignment-1',
				action: 'no_show_detected',
				actorType: 'system'
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
		expect(notifyAvailableDriversForEmergencyMock).not.toHaveBeenCalled();
		expect(createAuditLogMock).not.toHaveBeenCalled();
	});
});
