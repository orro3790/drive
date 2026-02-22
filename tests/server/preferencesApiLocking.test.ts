import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type PreferencesRouteModule = typeof import('../../src/routes/api/preferences/+server');

interface PreferenceRow {
	id: string;
	userId: string;
	preferredDays: number[];
	preferredRoutes: string[];
	updatedAt: Date;
	lockedAt: Date | null;
}

const driverPreferencesTable = {
	id: 'driver_preferences.id',
	userId: 'driver_preferences.userId',
	lockedAt: 'driver_preferences.lockedAt'
};

const routesTable = {
	id: 'routes.id',
	name: 'routes.name',
	warehouseId: 'routes.warehouseId'
};

const warehousesTable = {
	id: 'warehouses.id',
	name: 'warehouses.name'
};

let PUT: PreferencesRouteModule['PUT'];

let insertReturningMock: ReturnType<
	typeof vi.fn<(shape?: Record<string, unknown>) => Promise<PreferenceRow[]>>
>;
let insertOnConflictDoUpdateMock: ReturnType<
	typeof vi.fn<
		(options: { target: unknown; set: Record<string, unknown> }) => {
			returning: typeof insertReturningMock;
		}
	>
>;
let insertValuesMock: ReturnType<
	typeof vi.fn<
		(values: Record<string, unknown>) => {
			onConflictDoUpdate: typeof insertOnConflictDoUpdateMock;
		}
	>
>;
let insertMock: ReturnType<
	typeof vi.fn<
		(table: unknown) => {
			values: typeof insertValuesMock;
		}
	>
>;

let selectWhereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<unknown[]>>>;
let selectInnerJoinMock: ReturnType<typeof vi.fn>;
let selectFromMock: ReturnType<typeof vi.fn>;
let selectMock: ReturnType<
	typeof vi.fn<
		(shape?: Record<string, unknown>) => {
			from: typeof selectFromMock;
		}
	>
>;

beforeEach(async () => {
	vi.resetModules();

	insertReturningMock = vi.fn(async () => []);
	insertOnConflictDoUpdateMock = vi.fn(() => ({ returning: insertReturningMock }));
	insertValuesMock = vi.fn(() => ({ onConflictDoUpdate: insertOnConflictDoUpdateMock }));
	insertMock = vi.fn(() => ({ values: insertValuesMock }));

	selectWhereMock = vi.fn(async () => []);
	selectInnerJoinMock = vi.fn((_table: unknown, _condition: unknown) => ({
		where: selectWhereMock
	}));
	selectFromMock = vi.fn((_table: unknown) => ({
		innerJoin: selectInnerJoinMock,
		where: selectWhereMock
	}));
	selectMock = vi.fn(() => ({ from: selectFromMock }));

	vi.doMock('$lib/server/db', () => ({
		db: {
			insert: insertMock,
			select: selectMock
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		driverPreferences: driverPreferencesTable,
		routes: routesTable,
		warehouses: warehousesTable
	}));

	vi.doMock('$lib/server/org-scope', () => ({
		requireDriverWithOrg: vi.fn(() => ({
			user: {
				id: 'driver-1',
				role: 'driver',
				organizationId: 'org-1',
				weeklyCap: 4
			}
		}))
	}));

	vi.doMock('drizzle-orm', () => ({
		eq: (left: unknown, right: unknown) => ({ left, right }),
		inArray: (left: unknown, right: unknown[]) => ({ left, right }),
		sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
			strings: Array.from(strings),
			values
		})
	}));

	({ PUT } = await import('../../src/routes/api/preferences/+server'));
});

afterEach(() => {
	vi.clearAllMocks();
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('$lib/server/org-scope');
	vi.doUnmock('drizzle-orm');
});

describe('PUT /api/preferences', () => {
	it('returns 500 when upsert returns no row', async () => {
		insertReturningMock.mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'PUT',
			body: {
				preferredDays: [1, 3],
				preferredRoutes: []
			}
		});

		await expect(PUT(event as Parameters<typeof PUT>[0])).rejects.toMatchObject({ status: 500 });
		expect(insertOnConflictDoUpdateMock).toHaveBeenCalledTimes(1);
	});

	it('persists preferences via upsert', async () => {
		const updatedAt = new Date('2026-02-18T16:00:00.000Z');
		insertReturningMock.mockResolvedValueOnce([
			{
				id: 'pref-1',
				userId: 'driver-1',
				preferredDays: [1, 3],
				preferredRoutes: [],
				updatedAt,
				lockedAt: null
			}
		]);

		const event = createRequestEvent({
			method: 'PUT',
			body: {
				preferredDays: [1, 3],
				preferredRoutes: []
			}
		});

		const response = await PUT(event as Parameters<typeof PUT>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			isLocked: false,
			lockedUntil: null,
			preferences: {
				id: 'pref-1',
				userId: 'driver-1',
				preferredDays: [1, 3],
				preferredRoutes: [],
				preferredRoutesDetails: []
			}
		});
		expect(insertMock).toHaveBeenCalledWith(driverPreferencesTable);
		expect(insertOnConflictDoUpdateMock).toHaveBeenCalledWith(
			expect.objectContaining({ target: driverPreferencesTable.userId })
		);
	});
});
