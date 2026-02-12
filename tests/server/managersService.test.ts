import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type ManagersModule = typeof import('../../src/lib/server/services/managers');

type SelectResult = unknown;

let selectQueue: SelectResult[] = [];

function setSelectResults(results: SelectResult[]) {
	selectQueue = [...results];
}

function nextSelectResult() {
	if (selectQueue.length === 0) {
		throw new Error('No mocked select result available');
	}

	return selectQueue.shift();
}

const selectMock = vi.fn((_shape?: unknown) => {
	const whereResult = {
		limit: vi.fn(async (_count?: number) => nextSelectResult()),
		then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
			Promise.resolve(nextSelectResult()).then(onFulfilled, onRejected)
	};

	const chain = {
		from: vi.fn(() => chain),
		innerJoin: vi.fn((_table: unknown, _on: unknown) => chain),
		leftJoin: vi.fn((_table: unknown, _on: unknown) => chain),
		where: vi.fn((_condition: unknown) => whereResult)
	};

	return chain;
});

let getManagerWarehouseIds: ManagersModule['getManagerWarehouseIds'];
let canManagerAccessWarehouse: ManagersModule['canManagerAccessWarehouse'];
let getRouteManager: ManagersModule['getRouteManager'];

beforeAll(async () => {
	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock
		}
	}));

	({ getManagerWarehouseIds, canManagerAccessWarehouse, getRouteManager } =
		(await import('../../src/lib/server/services/managers')) as ManagersModule);
});

beforeEach(() => {
	setSelectResults([]);
	selectMock.mockClear();
});

afterAll(() => {
	vi.doUnmock('$lib/server/db');
	vi.clearAllMocks();
});

describe('manager service org scoping', () => {
	it('returns warehouse ids for same-org manager access', async () => {
		setSelectResults([[{ warehouseId: 'warehouse-1' }, { warehouseId: 'warehouse-2' }]]);

		await expect(getManagerWarehouseIds('manager-1', 'org-a')).resolves.toEqual([
			'warehouse-1',
			'warehouse-2'
		]);
	});

	it('denies cross-org warehouse access when scoped query returns no row', async () => {
		setSelectResults([[]]);

		await expect(
			canManagerAccessWarehouse('manager-1', 'warehouse-foreign', 'org-a')
		).resolves.toBe(false);
	});

	it('returns null route manager when org scope has no match', async () => {
		setSelectResults([[]]);

		await expect(getRouteManager('route-foreign', 'org-a')).resolves.toBeNull();
	});
});
