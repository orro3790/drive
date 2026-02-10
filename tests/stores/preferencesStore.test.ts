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
	preferences_load_error: () => 'preferences_load_error',
	preferences_locked_error: () => 'preferences_locked_error',
	preferences_saved_success: () => 'preferences_saved_success',
	preferences_save_error: () => 'preferences_save_error',
	offline_requires_connectivity: () => 'offline_requires_connectivity'
}));

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

const PREF_ID = '11111111-1111-4111-8111-111111111111';
const ROUTE_A = '22222222-2222-4222-8222-222222222222';
const ROUTE_B = '33333333-3333-4333-8333-333333333333';

function makePreferencesResponse(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		preferences: {
			id: PREF_ID,
			userId: 'driver-1',
			preferredDays: [1, 3],
			preferredRoutes: [ROUTE_A],
			preferredRoutesDetails: [
				{
					id: ROUTE_A,
					name: 'Route A',
					warehouseName: 'Warehouse A'
				}
			],
			updatedAt: '2026-02-10T09:00:00.000Z',
			lockedAt: null
		},
		isLocked: false,
		lockDeadline: '2026-02-16T14:59:59.999Z',
		lockedUntil: null,
		...overrides
	};
}

async function importPreferencesStore() {
	vi.resetModules();
	const module = await import('../../src/lib/stores/preferencesStore.svelte.ts');
	return module.preferencesStore;
}

describe('preferencesStore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('rejects malformed load payloads before state commit', async () => {
		const store = await importPreferencesStore();

		fetchMock.mockResolvedValueOnce(
			jsonResponse(
				makePreferencesResponse({
					preferences: {
						id: 'not-a-uuid'
					}
				})
			)
		);

		await store.load();

		expect(store.preferences).toBeNull();
		expect(store.error).toBe('Invalid preferences response');
		expect(mocked.toastError).toHaveBeenCalledWith('preferences_load_error');
	});

	it('ignores stale failed save after a newer save succeeds', async () => {
		const store = await importPreferencesStore();

		fetchMock.mockResolvedValueOnce(jsonResponse(makePreferencesResponse()));
		await store.load();

		const firstPending = deferred<Response>();
		const secondPending = deferred<Response>();

		fetchMock.mockReturnValueOnce(firstPending.promise);
		fetchMock.mockReturnValueOnce(secondPending.promise);

		const firstSavePromise = store.save({ preferredDays: [0], preferredRoutes: [ROUTE_A] }, [
			{ id: ROUTE_A, name: 'Route A', warehouseName: 'Warehouse A' }
		]);
		const secondSavePromise = store.save({ preferredDays: [2, 4], preferredRoutes: [ROUTE_B] }, [
			{ id: ROUTE_B, name: 'Route B', warehouseName: 'Warehouse B' }
		]);

		secondPending.resolve(
			jsonResponse(
				makePreferencesResponse({
					preferences: {
						id: PREF_ID,
						userId: 'driver-1',
						preferredDays: [2, 4],
						preferredRoutes: [ROUTE_B],
						preferredRoutesDetails: [
							{
								id: ROUTE_B,
								name: 'Route B',
								warehouseName: 'Warehouse B'
							}
						],
						updatedAt: '2026-02-10T10:30:00.000Z',
						lockedAt: null
					}
				})
			)
		);
		await secondSavePromise;

		firstPending.resolve(jsonResponse({}, 500));
		await firstSavePromise;

		expect(store.preferences?.preferredDays).toEqual([2, 4]);
		expect(store.preferences?.preferredRoutes).toEqual([ROUTE_B]);
		expect(store.preferences?.preferredRoutesDetails[0]?.id).toBe(ROUTE_B);
		expect(store.isSaving).toBe(false);
		expect(mocked.toastSuccess).toHaveBeenCalledWith('preferences_saved_success');
		expect(mocked.toastError).not.toHaveBeenCalledWith('preferences_save_error');
	});
});
