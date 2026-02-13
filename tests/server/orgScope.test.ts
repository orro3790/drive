import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type OrgScopeModule = typeof import('../../src/lib/server/org-scope');

let requireAuthenticatedWithOrg: OrgScopeModule['requireAuthenticatedWithOrg'];
let requireManagerWithOrg: OrgScopeModule['requireManagerWithOrg'];
let requireDriverWithOrg: OrgScopeModule['requireDriverWithOrg'];
let assertSameOrgUser: OrgScopeModule['assertSameOrgUser'];
let assertWarehouseInOrg: OrgScopeModule['assertWarehouseInOrg'];

let selectWhereMock: ReturnType<typeof vi.fn<() => Promise<unknown[]>>>;
let selectMock: ReturnType<typeof vi.fn>;

function createUser(
	role: 'driver' | 'manager',
	id: string,
	organizationId?: string
): App.Locals['user'] {
	return {
		id,
		role,
		name: `${role}-${id}`,
		email: `${id}@example.test`,
		organizationId: organizationId ?? null
	} as App.Locals['user'];
}

beforeEach(async () => {
	vi.resetModules();

	selectWhereMock = vi.fn(async () => []);
	const selectChain = {
		from: vi.fn(() => selectChain),
		where: vi.fn((_whereClause: unknown) => {
			const promise = selectWhereMock();
			return Object.assign(promise, {
				limit: vi.fn(() => promise)
			});
		})
	};

	selectMock = vi.fn(() => selectChain);

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		user: {
			id: 'user.id',
			organizationId: 'user.organizationId'
		},
		warehouses: {
			id: 'warehouses.id',
			organizationId: 'warehouses.organizationId'
		}
	}));

	vi.doMock('drizzle-orm', () => ({
		and: (...conditions: unknown[]) => ({ conditions }),
		eq: (left: unknown, right: unknown) => ({ left, right })
	}));

	({
		requireAuthenticatedWithOrg,
		requireManagerWithOrg,
		requireDriverWithOrg,
		assertSameOrgUser,
		assertWarehouseInOrg
	} = await import('../../src/lib/server/org-scope'));
}, 20_000);

afterEach(() => {
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.clearAllMocks();
});

describe('org scope guards', () => {
	it('requires authenticated users with an organization id', () => {
		try {
			requireAuthenticatedWithOrg({} as App.Locals);
			expect.fail('Expected unauthenticated call to throw');
		} catch (thrown) {
			expect(thrown).toMatchObject({ status: 401 });
		}

		try {
			requireAuthenticatedWithOrg({
				user: createUser('driver', 'driver-1', undefined)
			} as App.Locals);
			expect.fail('Expected missing org call to throw');
		} catch (thrown) {
			expect(thrown).toMatchObject({ status: 403 });
		}

		const context = requireAuthenticatedWithOrg({
			organizationId: 'org-1',
			user: createUser('driver', 'driver-1', 'org-ignored')
		} as App.Locals);

		expect(context).toMatchObject({
			organizationId: 'org-1',
			user: expect.objectContaining({ id: 'driver-1' })
		});
	});

	it('enforces role-specific helpers', () => {
		try {
			requireManagerWithOrg({
				organizationId: 'org-1',
				user: createUser('driver', 'driver-1', 'org-1')
			} as App.Locals);
			expect.fail('Expected manager guard to reject non-manager user');
		} catch (thrown) {
			expect(thrown).toMatchObject({ status: 403 });
		}

		try {
			requireDriverWithOrg({
				organizationId: 'org-1',
				user: createUser('manager', 'manager-1', 'org-1')
			} as App.Locals);
			expect.fail('Expected driver guard to reject non-driver user');
		} catch (thrown) {
			expect(thrown).toMatchObject({ status: 403 });
		}

		const managerContext = requireManagerWithOrg({
			organizationId: 'org-1',
			user: createUser('manager', 'manager-1', 'org-1')
		} as App.Locals);

		expect(managerContext.user.id).toBe('manager-1');
	});
});

describe('org scope assertions', () => {
	it('assertSameOrgUser returns the target id when user is in org', async () => {
		selectWhereMock.mockResolvedValueOnce([{ id: 'driver-2' }]);

		await expect(assertSameOrgUser('org-1', 'driver-2')).resolves.toEqual({ id: 'driver-2' });
	});

	it('assertSameOrgUser throws when user is outside org', async () => {
		selectWhereMock.mockResolvedValueOnce([]);

		await expect(assertSameOrgUser('org-1', 'driver-2')).rejects.toMatchObject({ status: 403 });
	});

	it('assertWarehouseInOrg returns the warehouse id when warehouse is in org', async () => {
		selectWhereMock.mockResolvedValueOnce([{ id: 'warehouse-1' }]);

		await expect(assertWarehouseInOrg('warehouse-1', 'org-1')).resolves.toEqual({
			id: 'warehouse-1'
		});
	});

	it('assertWarehouseInOrg throws when warehouse is outside org', async () => {
		selectWhereMock.mockResolvedValueOnce([]);

		await expect(assertWarehouseInOrg('warehouse-1', 'org-1')).rejects.toMatchObject({
			status: 403
		});
	});
});
