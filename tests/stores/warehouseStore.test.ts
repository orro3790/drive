import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
	toastSuccess: vi.fn(),
	toastError: vi.fn()
}));

vi.mock('$lib/stores/app-shell/toastStore.svelte', () => ({
	toastStore: {
		success: mocked.toastSuccess,
		error: mocked.toastError
	}
}));

vi.mock('$lib/paraglide/messages.js', () => ({
	warehouse_create_error: () => 'warehouse_create_error',
	warehouse_created_success: () => 'warehouse_created_success',
	warehouse_updated_success: () => 'warehouse_updated_success',
	warehouse_update_error: () => 'warehouse_update_error',
	warehouse_delete_has_routes: () => 'warehouse_delete_has_routes',
	warehouse_deleted_success: () => 'warehouse_deleted_success',
	warehouse_delete_error: () => 'warehouse_delete_error'
}));

type WarehouseWithRouteCount = {
	id: string;
	name: string;
	address: string;
	createdBy: string | null;
	createdAt: Date;
	updatedAt: Date;
	routeCount: number;
	assignedDriversNext7: number;
	assignedDriversDelta7: number;
	unfilledRoutesNext7: number;
	unfilledRoutesDelta7: number;
	openBidWindows: number;
	managerCount: number;
};

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body
	} as unknown as Response;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;

	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

function makeWarehouse(overrides: Partial<WarehouseWithRouteCount> = {}): WarehouseWithRouteCount {
	return {
		id: 'warehouse-1',
		name: 'Central Hub',
		address: '10 Main St',
		createdBy: null,
		createdAt: new Date('2026-02-01T09:00:00.000Z'),
		updatedAt: new Date('2026-02-01T09:00:00.000Z'),
		routeCount: 0,
		assignedDriversNext7: 0,
		assignedDriversDelta7: 0,
		unfilledRoutesNext7: 0,
		unfilledRoutesDelta7: 0,
		openBidWindows: 0,
		managerCount: 0,
		...overrides
	};
}

async function importWarehouseStore() {
	vi.resetModules();
	const module = await import('../../src/lib/stores/warehouseStore.svelte.ts');
	return module.warehouseStore;
}

type WarehouseStore = Awaited<ReturnType<typeof importWarehouseStore>>;

async function seedWarehouse(store: WarehouseStore, warehouse: WarehouseWithRouteCount) {
	fetchMock.mockResolvedValueOnce(jsonResponse({ warehouses: [warehouse] }));
	await store.load();
	fetchMock.mockClear();
}

describe('warehouseStore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('creates optimistically and swaps in server data on success', async () => {
		const store = await importWarehouseStore();
		const pending = deferred<Response>();

		fetchMock.mockReturnValueOnce(pending.promise);

		store.create({
			name: 'North Hub',
			address: '100 North St'
		});

		expect(store.warehouses).toHaveLength(1);
		expect(store.warehouses[0]?.id.startsWith('optimistic-')).toBe(true);
		expect(store.warehouses[0]?.name).toBe('North Hub');

		const persisted = makeWarehouse({ id: 'warehouse-persisted', name: 'North Hub (Saved)' });
		pending.resolve(jsonResponse({ warehouse: persisted }));

		await vi.waitFor(() => {
			expect(store.warehouses[0]?.id).toBe('warehouse-persisted');
		});

		expect(mocked.toastSuccess).toHaveBeenCalledWith('warehouse_created_success');
	}, 20_000);

	it('reverts optimistic create when the API request fails', async () => {
		const store = await importWarehouseStore();
		const pending = deferred<Response>();

		fetchMock.mockReturnValueOnce(pending.promise);

		store.create({
			name: 'East Hub',
			address: '200 East St'
		});

		expect(store.warehouses).toHaveLength(1);

		pending.resolve(jsonResponse({}, 500));

		await vi.waitFor(() => {
			expect(store.warehouses).toHaveLength(0);
		});

		expect(mocked.toastError).toHaveBeenCalledWith('warehouse_create_error');
	});

	it('applies optimistic update and commits server payload', async () => {
		const store = await importWarehouseStore();
		const original = makeWarehouse({ id: 'warehouse-update', name: 'Original Name' });
		const pending = deferred<Response>();

		await seedWarehouse(store, original);
		fetchMock.mockReturnValueOnce(pending.promise);

		store.update('warehouse-update', { name: 'Optimistic Name' });

		expect(store.warehouses[0]?.name).toBe('Optimistic Name');

		const persisted = makeWarehouse({
			id: 'warehouse-update',
			name: 'Persisted Name',
			updatedAt: new Date('2026-02-02T09:00:00.000Z')
		});
		pending.resolve(jsonResponse({ warehouse: persisted }));

		await vi.waitFor(() => {
			expect(store.warehouses[0]?.name).toBe('Persisted Name');
		});

		expect(mocked.toastSuccess).toHaveBeenCalledWith('warehouse_updated_success');
	});

	it('rolls back optimistic update when persistence fails', async () => {
		const store = await importWarehouseStore();
		const original = makeWarehouse({
			id: 'warehouse-revert',
			name: 'Stable Name',
			address: '300 Stable St'
		});
		const pending = deferred<Response>();

		await seedWarehouse(store, original);
		fetchMock.mockReturnValueOnce(pending.promise);

		store.update('warehouse-revert', { address: '999 Changed Ave' });

		expect(store.warehouses[0]?.address).toBe('999 Changed Ave');

		pending.resolve(jsonResponse({}, 500));

		await vi.waitFor(() => {
			expect(store.warehouses[0]?.address).toBe('300 Stable St');
		});

		expect(mocked.toastError).toHaveBeenCalledWith('warehouse_update_error');
	});

	it('blocks deletion when routes are attached before calling the API', async () => {
		const store = await importWarehouseStore();
		const blockedWarehouse = makeWarehouse({ id: 'warehouse-blocked', routeCount: 2 });

		await seedWarehouse(store, blockedWarehouse);

		store.delete('warehouse-blocked');

		expect(fetchMock).not.toHaveBeenCalled();
		expect(store.warehouses).toHaveLength(1);
		expect(mocked.toastError).toHaveBeenCalledWith('warehouse_delete_has_routes');
	});

	it('restores deleted warehouse when backend rejects due to attached routes', async () => {
		const store = await importWarehouseStore();
		const warehouse = makeWarehouse({ id: 'warehouse-delete-failure' });
		const pending = deferred<Response>();

		await seedWarehouse(store, warehouse);
		fetchMock.mockReturnValueOnce(pending.promise);

		store.delete('warehouse-delete-failure');

		expect(store.warehouses).toHaveLength(0);

		pending.resolve(jsonResponse({ message: 'still has attached routes' }, 400));

		await vi.waitFor(() => {
			expect(store.warehouses).toHaveLength(1);
		});

		expect(mocked.toastError).toHaveBeenCalledWith('warehouse_delete_has_routes');
	});

	it('keeps deletion after API success', async () => {
		const store = await importWarehouseStore();
		const warehouse = makeWarehouse({ id: 'warehouse-delete-success' });
		const pending = deferred<Response>();

		await seedWarehouse(store, warehouse);
		fetchMock.mockReturnValueOnce(pending.promise);

		store.delete('warehouse-delete-success');

		expect(store.warehouses).toHaveLength(0);

		pending.resolve(jsonResponse({}, 204));

		await vi.waitFor(() => {
			expect(mocked.toastSuccess).toHaveBeenCalledWith('warehouse_deleted_success');
		});
	});
});
