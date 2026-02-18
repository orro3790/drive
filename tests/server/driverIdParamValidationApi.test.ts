import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RequestHandler } from '@sveltejs/kit';

import { createRequestEvent } from '../harness/requestEvent';

type DriversRouteModule = typeof import('../../src/routes/api/drivers/[id]/+server');
type DriverHealthRouteModule = typeof import('../../src/routes/api/drivers/[id]/health/+server');
type DriverShiftsRouteModule = typeof import('../../src/routes/api/drivers/[id]/shifts/+server');

let PATCH: DriversRouteModule['PATCH'];
let GET_HEALTH: DriverHealthRouteModule['GET'];
let GET_SHIFTS: DriverShiftsRouteModule['GET'];

const selectMock = vi.fn();
const updateMock = vi.fn();

function createManagerUser(id: string): App.Locals['user'] {
	return {
		id,
		role: 'manager',
		name: `manager-${id}`,
		email: `${id}@example.test`,
		organizationId: 'org-test'
	} as App.Locals['user'];
}

beforeEach(async () => {
	vi.resetModules();
	selectMock.mockReset();
	updateMock.mockReset();

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			update: updateMock,
			transaction: vi.fn()
		}
	}));

	({ PATCH } = await import('../../src/routes/api/drivers/[id]/+server'));
	({ GET: GET_HEALTH } = await import('../../src/routes/api/drivers/[id]/health/+server'));
	({ GET: GET_SHIFTS } = await import('../../src/routes/api/drivers/[id]/shifts/+server'));
});

afterEach(() => {
	vi.clearAllMocks();
	vi.doUnmock('$lib/server/db');
});

describe('driver [id] route param validation', () => {
	it.each([
		['PATCH /api/drivers/[id]', 'PATCH', () => PATCH, { weeklyCap: 5 }],
		['GET /api/drivers/[id]/health', 'GET', () => GET_HEALTH, undefined],
		['GET /api/drivers/[id]/shifts', 'GET', () => GET_SHIFTS, undefined]
	] as const)(
		'%s returns 400 for invalid UUID path param',
		async (_label, method, getHandler, body) => {
			const event = createRequestEvent({
				method,
				params: { id: 'driver-1' },
				locals: { user: createManagerUser('manager-1') },
				body
			});

			const handler = getHandler() as RequestHandler;

			await expect(handler(event)).rejects.toMatchObject({ status: 400 });
			expect(selectMock).not.toHaveBeenCalled();
			expect(updateMock).not.toHaveBeenCalled();
		}
	);
});
