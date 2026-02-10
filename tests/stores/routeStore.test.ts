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
	route_load_error: () => 'route_load_error',
	route_created_success: () => 'route_created_success',
	route_name_unique_error: () => 'route_name_unique_error',
	route_create_error: () => 'route_create_error',
	route_updated_success: () => 'route_updated_success',
	route_update_error: () => 'route_update_error',
	route_deleted_success: () => 'route_deleted_success',
	route_delete_has_assignments: () => 'route_delete_has_assignments',
	route_delete_error: () => 'route_delete_error',
	manager_dashboard_detail_no_assignment: () => 'manager_dashboard_detail_no_assignment',
	bid_windows_assign_error: () => 'bid_windows_assign_error',
	bid_windows_assign_success: () => 'bid_windows_assign_success',
	manager_emergency_reopen_error: () => 'manager_emergency_reopen_error',
	manager_emergency_reopen_success: ({ count }: { count: number }) =>
		`manager_emergency_reopen_success_${count}`
}));

type RouteStatus = 'assigned' | 'unfilled' | 'bidding';

type RouteWithWarehouse = {
	id: string;
	name: string;
	startTime: string;
	warehouseId: string;
	warehouseName: string;
	createdBy: string | null;
	createdAt: Date;
	updatedAt: Date;
	status: RouteStatus;
	assignmentId: string | null;
	driverName: string | null;
	bidWindowClosesAt: string | null;
};

type RouteFilters = {
	warehouseId?: string;
	status?: RouteStatus;
	date?: string;
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

function makeRoute(overrides: Partial<RouteWithWarehouse> = {}): RouteWithWarehouse {
	return {
		id: 'route-1',
		name: 'Downtown',
		startTime: '09:00',
		warehouseId: 'warehouse-1',
		warehouseName: 'Main Warehouse',
		createdBy: null,
		createdAt: new Date('2026-02-01T09:00:00.000Z'),
		updatedAt: new Date('2026-02-01T09:00:00.000Z'),
		status: 'unfilled',
		assignmentId: 'assignment-1',
		driverName: null,
		bidWindowClosesAt: null,
		...overrides
	};
}

async function importRouteStore() {
	vi.resetModules();
	const module = await import('../../src/lib/stores/routeStore.svelte.ts');
	return module.routeStore;
}

type RouteStore = Awaited<ReturnType<typeof importRouteStore>>;

async function seedRoutes(store: RouteStore, routes: RouteWithWarehouse[], filters?: RouteFilters) {
	fetchMock.mockResolvedValueOnce(jsonResponse({ routes }));
	await store.load(filters);
	fetchMock.mockClear();
}

describe('routeStore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('builds route queries from filters when loading', async () => {
		const store = await importRouteStore();
		const route = makeRoute();

		fetchMock.mockResolvedValueOnce(jsonResponse({ routes: [route] }));

		await store.load({ warehouseId: 'warehouse-1', status: 'unfilled', date: '2026-02-10' });

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/routes?warehouseId=warehouse-1&status=unfilled&date=2026-02-10'
		);
		expect(store.routes).toHaveLength(1);
		expect(store.routes[0]?.id).toBe('route-1');
	}, 20_000);

	it('reverts optimistic create on duplicate-name conflict', async () => {
		const store = await importRouteStore();
		const pending = deferred<Response>();

		fetchMock.mockReturnValueOnce(pending.promise);

		store.create(
			{
				name: 'Downtown',
				warehouseId: 'warehouse-1',
				startTime: '09:00'
			},
			'Main Warehouse'
		);

		expect(store.routes).toHaveLength(1);
		expect(store.routes[0]?.id.startsWith('optimistic-')).toBe(true);

		pending.resolve(jsonResponse({ message: 'unique constraint violation' }, 409));

		await vi.waitFor(() => {
			expect(store.routes).toHaveLength(0);
		});

		expect(mocked.toastError).toHaveBeenCalledWith('route_name_unique_error');
	});

	it('rolls back update when route is optimistically filtered out and API fails', async () => {
		const store = await importRouteStore();
		const route = makeRoute({ id: 'route-update-revert', warehouseId: 'warehouse-1' });
		const pending = deferred<Response>();

		await seedRoutes(store, [route], { warehouseId: 'warehouse-1' });
		fetchMock.mockReturnValueOnce(pending.promise);

		store.update('route-update-revert', { warehouseId: 'warehouse-2' });

		expect(store.routes).toHaveLength(0);

		pending.resolve(jsonResponse({}, 500));

		await vi.waitFor(() => {
			expect(store.routes).toHaveLength(1);
		});

		expect(store.routes[0]?.warehouseId).toBe('warehouse-1');
		expect(mocked.toastError).toHaveBeenCalledWith('route_update_error');
	});

	it('restores route when delete fails with future assignments error', async () => {
		const store = await importRouteStore();
		const route = makeRoute({ id: 'route-delete-revert' });
		const pending = deferred<Response>();

		await seedRoutes(store, [route]);
		fetchMock.mockReturnValueOnce(pending.promise);

		store.delete('route-delete-revert');

		expect(store.routes).toHaveLength(0);

		pending.resolve(jsonResponse({ message: 'future assignments are attached' }, 400));

		await vi.waitFor(() => {
			expect(store.routes).toHaveLength(1);
		});

		expect(mocked.toastError).toHaveBeenCalledWith('route_delete_has_assignments');
	});

	it('returns a deterministic error when manualAssign target is missing', async () => {
		const store = await importRouteStore();

		const result = await store.manualAssign('assignment-missing', {
			id: 'driver-1',
			name: 'Driver One'
		});

		expect(result).toEqual({ ok: false, message: 'manager_dashboard_detail_no_assignment' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rolls back optimistic assignment and preserves server rejection message', async () => {
		const store = await importRouteStore();
		const route = makeRoute({
			id: 'route-assign-fail',
			status: 'bidding',
			driverName: null,
			assignmentId: 'assignment-assign-fail'
		});
		const pending = deferred<Response>();

		await seedRoutes(store, [route]);
		fetchMock.mockReturnValueOnce(pending.promise);

		const assignPromise = store.manualAssign('assignment-assign-fail', {
			id: 'driver-2',
			name: 'Driver Two'
		});

		expect(store.assigningAssignmentId).toBe('assignment-assign-fail');
		expect(store.routes[0]?.status).toBe('assigned');
		expect(store.routes[0]?.driverName).toBe('Driver Two');

		pending.resolve(jsonResponse({ message: 'driver is over weekly cap' }, 409));

		await expect(assignPromise).resolves.toEqual({
			ok: false,
			message: 'driver is over weekly cap'
		});

		expect(store.assigningAssignmentId).toBeNull();
		expect(store.routes[0]?.status).toBe('bidding');
		expect(store.routes[0]?.driverName).toBeNull();
		expect(mocked.toastError).not.toHaveBeenCalled();
	});

	it('keeps successful manual assignment and clears in-flight state', async () => {
		const store = await importRouteStore();
		const route = makeRoute({
			id: 'route-assign-success',
			status: 'bidding',
			assignmentId: 'assignment-assign-success'
		});
		const pending = deferred<Response>();

		await seedRoutes(store, [route]);
		fetchMock.mockReturnValueOnce(pending.promise);

		const assignPromise = store.manualAssign('assignment-assign-success', {
			id: 'driver-3',
			name: 'Driver Three'
		});

		expect(store.assigningAssignmentId).toBe('assignment-assign-success');

		pending.resolve(
			jsonResponse({
				assignment: {
					id: 'assignment-assign-success',
					driverName: 'Driver Three (Server)'
				}
			})
		);

		await expect(assignPromise).resolves.toEqual({ ok: true });

		expect(store.assigningAssignmentId).toBeNull();
		expect(store.routes[0]?.status).toBe('assigned');
		expect(store.routes[0]?.driverName).toBe('Driver Three (Server)');
		expect(mocked.toastSuccess).toHaveBeenCalledWith('bid_windows_assign_success');
	});

	it('transitions route state during successful emergency reopen', async () => {
		const store = await importRouteStore();
		const route = makeRoute({
			id: 'route-emergency-success',
			status: 'assigned',
			driverName: 'Driver Active',
			assignmentId: 'assignment-emergency-success'
		});
		const pending = deferred<Response>();

		await seedRoutes(store, [route]);
		fetchMock.mockReturnValueOnce(pending.promise);

		const emergencyPromise = store.emergencyReopen('assignment-emergency-success');

		expect(store.emergencyReopenAssignmentId).toBe('assignment-emergency-success');

		pending.resolve(jsonResponse({ notifiedCount: 4 }));

		await expect(emergencyPromise).resolves.toEqual({ ok: true, notifiedCount: 4 });

		expect(store.emergencyReopenAssignmentId).toBeNull();
		expect(store.routes[0]?.status).toBe('bidding');
		expect(store.routes[0]?.driverName).toBeNull();
		expect(mocked.toastSuccess).toHaveBeenCalledWith('manager_emergency_reopen_success_4');
	});

	it('surfaces backend error details when emergency reopen is rejected', async () => {
		const store = await importRouteStore();
		const route = makeRoute({
			id: 'route-emergency-error',
			assignmentId: 'assignment-emergency-error'
		});

		await seedRoutes(store, [route]);
		fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'window already open' }, 400));

		await expect(store.emergencyReopen('assignment-emergency-error')).resolves.toEqual({
			ok: false
		});

		expect(store.emergencyReopenAssignmentId).toBeNull();
		expect(mocked.toastError).toHaveBeenCalledWith('window already open');
	});

	it('shows generic error when emergency reopen response payload is invalid', async () => {
		const store = await importRouteStore();
		const route = makeRoute({
			id: 'route-emergency-invalid-payload',
			assignmentId: 'assignment-emergency-invalid-payload'
		});

		await seedRoutes(store, [route]);
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				notifiedCount: 'not-a-number'
			})
		);

		await expect(store.emergencyReopen('assignment-emergency-invalid-payload')).resolves.toEqual({
			ok: false
		});

		expect(store.emergencyReopenAssignmentId).toBeNull();
		expect(mocked.toastError).toHaveBeenCalledWith('manager_emergency_reopen_error');
	});

	it('ignores stale emergency reopen completion from older mutation versions', async () => {
		const store = await importRouteStore();
		const route = makeRoute({
			id: 'route-emergency-stale',
			status: 'assigned',
			driverName: 'Driver Active',
			assignmentId: 'assignment-emergency-stale'
		});
		const firstPending = deferred<Response>();

		await seedRoutes(store, [route]);
		fetchMock.mockReturnValueOnce(firstPending.promise);
		fetchMock.mockResolvedValueOnce(jsonResponse({ notifiedCount: 2 }));

		const firstPromise = store.emergencyReopen('assignment-emergency-stale');
		const secondResult = await store.emergencyReopen('assignment-emergency-stale');

		expect(secondResult).toEqual({ ok: true, notifiedCount: 2 });
		expect(store.routes[0]?.status).toBe('bidding');
		expect(store.emergencyReopenAssignmentId).toBeNull();

		firstPending.resolve(jsonResponse({ notifiedCount: 9 }));
		await expect(firstPromise).resolves.toEqual({ ok: true, notifiedCount: 9 });

		expect(mocked.toastSuccess).toHaveBeenCalledTimes(1);
		expect(mocked.toastSuccess).toHaveBeenCalledWith('manager_emergency_reopen_success_2');
	});
});
