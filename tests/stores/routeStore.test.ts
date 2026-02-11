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
	manager_override_open_bidding_error: () => 'manager_override_open_bidding_error',
	manager_override_open_bidding_success: () => 'manager_override_open_bidding_success',
	manager_override_open_urgent_bidding_error: () => 'manager_override_open_urgent_bidding_error',
	manager_override_open_urgent_bidding_success: ({ count }: { count: number }) =>
		`manager_override_open_urgent_bidding_success_${count}`
}));

type RouteStatus = 'assigned' | 'unfilled' | 'bidding';

type ShiftProgress =
	| 'unconfirmed'
	| 'confirmed'
	| 'arrived'
	| 'started'
	| 'completed'
	| 'no_show'
	| 'cancelled';

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
	assignmentStatus: 'scheduled' | 'active' | 'completed' | 'cancelled' | 'unfilled' | null;
	isShiftStarted: boolean;
	assignmentId: string | null;
	driverName: string | null;
	bidWindowClosesAt: string | null;
	shiftProgress: ShiftProgress | null;
	confirmedAt: string | null;
	arrivedAt: string | null;
	startedAt: string | null;
	completedAt: string | null;
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
		assignmentStatus: 'unfilled',
		isShiftStarted: false,
		assignmentId: 'assignment-1',
		driverName: null,
		bidWindowClosesAt: null,
		shiftProgress: null,
		confirmedAt: null,
		arrivedAt: null,
		startedAt: null,
		completedAt: null,
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
				action: 'reassign',
				assignment: {
					id: 'assignment-assign-success',
					status: 'scheduled',
					userId: 'driver-3',
					driverName: 'Driver Three (Server)',
					routeId: 'route-assign-success'
				},
				bidWindow: null,
				notifiedCount: null
			})
		);

		await expect(assignPromise).resolves.toEqual({ ok: true });

		expect(store.assigningAssignmentId).toBeNull();
		expect(store.routes[0]?.status).toBe('assigned');
		expect(store.routes[0]?.driverName).toBe('Driver Three (Server)');
		expect(mocked.toastSuccess).toHaveBeenCalledWith('bid_windows_assign_success');
	});

	it('transitions route state during successful urgent override', async () => {
		const store = await importRouteStore();
		const route = makeRoute({
			id: 'route-emergency-success',
			status: 'assigned',
			assignmentStatus: 'scheduled',
			driverName: 'Driver Active',
			assignmentId: 'assignment-emergency-success'
		});
		const pending = deferred<Response>();

		await seedRoutes(store, [route]);
		fetchMock.mockReturnValueOnce(pending.promise);

		const urgentPromise = store.openUrgentBidding('assignment-emergency-success');

		expect(store.overridingAssignmentId).toBe('assignment-emergency-success');
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/assignments/assignment-emergency-success/override',
			expect.objectContaining({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'open_urgent_bidding' })
			})
		);

		pending.resolve(
			jsonResponse({
				action: 'open_urgent_bidding',
				assignment: {
					id: 'assignment-emergency-success',
					status: 'unfilled',
					userId: null,
					driverName: null,
					routeId: 'route-emergency-success'
				},
				bidWindow: {
					id: 'window-urgent-1',
					mode: 'emergency',
					status: 'open',
					closesAt: '2026-02-10T14:30:00.000Z',
					payBonusPercent: 25
				},
				notifiedCount: 4
			})
		);

		await expect(urgentPromise).resolves.toEqual({ ok: true, notifiedCount: 4 });

		expect(store.overridingAssignmentId).toBeNull();
		expect(store.routes[0]?.status).toBe('bidding');
		expect(store.routes[0]?.assignmentStatus).toBe('unfilled');
		expect(store.routes[0]?.driverName).toBeNull();
		expect(mocked.toastSuccess).toHaveBeenCalledWith(
			'manager_override_open_urgent_bidding_success_4'
		);
	});

	it('keeps legacy emergencyReopen alias wired to urgent override flow', async () => {
		const store = await importRouteStore();
		const route = makeRoute({
			id: 'route-emergency-alias',
			status: 'assigned',
			assignmentStatus: 'scheduled',
			driverName: 'Driver Active',
			assignmentId: 'assignment-emergency-alias'
		});
		const pending = deferred<Response>();

		await seedRoutes(store, [route]);
		fetchMock.mockReturnValueOnce(pending.promise);

		const reopenPromise = store.emergencyReopen('assignment-emergency-alias');

		expect(store.emergencyReopenAssignmentId).toBe('assignment-emergency-alias');
		expect(store.isEmergencyReopening('assignment-emergency-alias')).toBe(true);

		pending.resolve(
			jsonResponse({
				action: 'open_urgent_bidding',
				assignment: {
					id: 'assignment-emergency-alias',
					status: 'unfilled',
					userId: null,
					driverName: null,
					routeId: 'route-emergency-alias'
				},
				bidWindow: {
					id: 'window-urgent-alias',
					mode: 'emergency',
					status: 'open',
					closesAt: '2026-02-10T14:50:00.000Z',
					payBonusPercent: 25
				},
				notifiedCount: 1
			})
		);

		await expect(reopenPromise).resolves.toEqual({ ok: true, notifiedCount: 1 });

		expect(store.emergencyReopenAssignmentId).toBeNull();
		expect(store.routes[0]?.status).toBe('bidding');
		expect(store.routes[0]?.assignmentStatus).toBe('unfilled');
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/assignments/assignment-emergency-alias/override',
			expect.objectContaining({ body: JSON.stringify({ action: 'open_urgent_bidding' }) })
		);
		expect(mocked.toastSuccess).toHaveBeenCalledWith(
			'manager_override_open_urgent_bidding_success_1'
		);
	});

	it('opens standard bidding through explicit override action', async () => {
		const store = await importRouteStore();
		const route = makeRoute({
			id: 'route-open-bidding-success',
			status: 'unfilled',
			assignmentStatus: 'unfilled',
			assignmentId: 'assignment-open-bidding-success'
		});

		await seedRoutes(store, [route]);
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				action: 'open_bidding',
				assignment: {
					id: 'assignment-open-bidding-success',
					status: 'unfilled',
					userId: null,
					driverName: null,
					routeId: 'route-open-bidding-success'
				},
				bidWindow: {
					id: 'window-open-1',
					mode: 'competitive',
					status: 'open',
					closesAt: '2026-02-10T12:00:00.000Z',
					payBonusPercent: 0
				},
				notifiedCount: 3
			})
		);

		await expect(store.openBidding('assignment-open-bidding-success')).resolves.toEqual({
			ok: true,
			notifiedCount: 3
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/assignments/assignment-open-bidding-success/override',
			expect.objectContaining({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'open_bidding' })
			})
		);

		expect(store.routes[0]?.status).toBe('bidding');
		expect(store.routes[0]?.assignmentStatus).toBe('unfilled');
		expect(mocked.toastSuccess).toHaveBeenCalledWith('manager_override_open_bidding_success');
	});

	it('surfaces backend error details when urgent override is rejected', async () => {
		const store = await importRouteStore();
		const route = makeRoute({
			id: 'route-emergency-error',
			assignmentId: 'assignment-emergency-error'
		});

		await seedRoutes(store, [route]);
		fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'window already open' }, 400));

		await expect(store.openUrgentBidding('assignment-emergency-error')).resolves.toEqual({
			ok: false
		});

		expect(store.overridingAssignmentId).toBeNull();
		expect(mocked.toastError).toHaveBeenCalledWith('window already open');
	});

	it('shows generic error when urgent override response payload is invalid', async () => {
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

		await expect(store.openUrgentBidding('assignment-emergency-invalid-payload')).resolves.toEqual({
			ok: false
		});

		expect(store.overridingAssignmentId).toBeNull();
		expect(mocked.toastError).toHaveBeenCalledWith('manager_override_open_urgent_bidding_error');
	});

	it('ignores stale urgent override completion from older mutation versions', async () => {
		const store = await importRouteStore();
		const route = makeRoute({
			id: 'route-emergency-stale',
			status: 'assigned',
			assignmentStatus: 'scheduled',
			driverName: 'Driver Active',
			assignmentId: 'assignment-emergency-stale'
		});
		const firstPending = deferred<Response>();

		await seedRoutes(store, [route]);
		fetchMock.mockReturnValueOnce(firstPending.promise);
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				action: 'open_urgent_bidding',
				assignment: {
					id: 'assignment-emergency-stale',
					status: 'unfilled',
					userId: null,
					driverName: null,
					routeId: 'route-emergency-stale'
				},
				bidWindow: {
					id: 'window-urgent-2',
					mode: 'emergency',
					status: 'open',
					closesAt: '2026-02-10T14:30:00.000Z',
					payBonusPercent: 20
				},
				notifiedCount: 2
			})
		);

		const firstPromise = store.openUrgentBidding('assignment-emergency-stale');
		const secondResult = await store.openUrgentBidding('assignment-emergency-stale');

		expect(secondResult).toEqual({ ok: true, notifiedCount: 2 });
		expect(store.routes[0]?.status).toBe('bidding');
		expect(store.overridingAssignmentId).toBeNull();

		firstPending.resolve(
			jsonResponse({
				action: 'open_urgent_bidding',
				assignment: {
					id: 'assignment-emergency-stale',
					status: 'unfilled',
					userId: null,
					driverName: null,
					routeId: 'route-emergency-stale'
				},
				bidWindow: {
					id: 'window-urgent-3',
					mode: 'emergency',
					status: 'open',
					closesAt: '2026-02-10T14:40:00.000Z',
					payBonusPercent: 20
				},
				notifiedCount: 9
			})
		);
		await expect(firstPromise).resolves.toEqual({ ok: true, notifiedCount: 9 });

		expect(mocked.toastSuccess).toHaveBeenCalledTimes(1);
		expect(mocked.toastSuccess).toHaveBeenCalledWith(
			'manager_override_open_urgent_bidding_success_2'
		);
	});
});
