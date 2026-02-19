import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';
import { createBoundaryMock } from '../harness/serviceMocks';
import { freezeTime, resetTime } from '../harness/time';

type NoShowCronRouteModule = typeof import('../../src/routes/api/cron/no-show-detection/+server');

interface NoShowDetectionPayload {
	evaluated: number;
	noShows: number;
	bidWindowsCreated: number;
	managerAlertsSent: number;
	driversNotified: number;
	errors: number;
	skippedBeforeDeadline: boolean;
}

interface OrganizationRow {
	id: string;
}

const CRON_TOKEN = 'launch-secret';

let GET: NoShowCronRouteModule['GET'];
let detectNoShowsForOrganizationMock: ReturnType<
	typeof createBoundaryMock<[organizationId: string], Promise<NoShowDetectionPayload>>
>;
let dbSelectMock: ReturnType<typeof vi.fn>;
let selectFromMock: ReturnType<typeof vi.fn<(table: unknown) => Promise<OrganizationRow[]>>>;

beforeEach(async () => {
	vi.resetModules();

	detectNoShowsForOrganizationMock = createBoundaryMock<
		[organizationId: string],
		Promise<NoShowDetectionPayload>
	>();
	detectNoShowsForOrganizationMock.mockResolvedValue({
		evaluated: 2,
		noShows: 1,
		bidWindowsCreated: 1,
		managerAlertsSent: 1,
		driversNotified: 3,
		errors: 0,
		skippedBeforeDeadline: false
	});

	selectFromMock = vi.fn<(table: unknown) => Promise<OrganizationRow[]>>(async () => [
		{ id: 'org-1' }
	]);
	dbSelectMock = vi.fn((_shape: Record<string, unknown>) => ({ from: selectFromMock }));

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
		env: {
			CRON_SECRET: CRON_TOKEN
		}
	}));
	vi.doMock('$lib/server/db', () => ({
		db: {
			select: dbSelectMock
		}
	}));
	vi.doMock('$lib/server/db/schema', () => ({
		organizations: {
			id: 'organizations.id'
		}
	}));
	vi.doMock('$lib/server/services/noshow', () => ({
		detectNoShowsForOrganization: detectNoShowsForOrganizationMock
	}));
	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => childLogger)
		}
	}));

	({ GET } = await import('../../src/routes/api/cron/no-show-detection/+server'));
});

afterEach(() => {
	resetTime();
	vi.doUnmock('$env/static/private');
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('$lib/server/services/noshow');
	vi.doUnmock('$lib/server/logger');
	vi.clearAllMocks();
});

describe('LC-05 API boundary: GET /api/cron/no-show-detection', () => {
	it('returns 401 when authorization is missing', async () => {
		const event = createRequestEvent({ method: 'GET' });

		const response = await GET(event as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
		expect(detectNoShowsForOrganizationMock).not.toHaveBeenCalled();
	});

	it('returns 401 when authorization token does not match', async () => {
		const event = createRequestEvent({
			method: 'GET',
			headers: { authorization: 'Bearer wrong-token' }
		});

		const response = await GET(event as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
		expect(detectNoShowsForOrganizationMock).not.toHaveBeenCalled();
	});

	it('returns success payload from detection service with deterministic elapsed time', async () => {
		freezeTime('2026-02-10T15:00:00.000Z');
		const event = createRequestEvent({
			method: 'GET',
			headers: { authorization: `Bearer ${CRON_TOKEN}` }
		});

		const response = await GET(event as Parameters<typeof GET>[0]);
		const payload = (await response.json()) as NoShowDetectionPayload & {
			success: boolean;
			elapsedMs: number;
		};

		expect(response.status).toBe(200);
		expect(payload).toMatchObject({
			success: true,
			evaluated: 2,
			noShows: 1,
			bidWindowsCreated: 1,
			managerAlertsSent: 1,
			driversNotified: 3,
			errors: 0,
			skippedBeforeDeadline: false
		});
		expect(payload.elapsedMs).toBe(0);
		expect(detectNoShowsForOrganizationMock).toHaveBeenCalledTimes(1);
		expect(detectNoShowsForOrganizationMock).toHaveBeenCalledWith('org-1');
	});

	it('returns 500 when detection service throws', async () => {
		detectNoShowsForOrganizationMock.mockRejectedValueOnce(new Error('cron service unavailable'));
		const event = createRequestEvent({
			method: 'GET',
			headers: { authorization: `Bearer ${CRON_TOKEN}` }
		});

		const response = await GET(event as Parameters<typeof GET>[0]);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ message: 'Internal server error' });
	});
});
