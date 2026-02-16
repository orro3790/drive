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
	bids_load_available_error: () => 'bids_load_available_error',
	bids_load_mine_error: () => 'bids_load_mine_error',
	bids_accept_success_bonus: ({ bonus }: { bonus: number }) => `bonus_${bonus}`,
	bids_accept_success: () => 'bids_accept_success',
	bids_submit_success: () => 'bids_submit_success',
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

function makeAvailableWindow(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: 'window-1',
		assignmentId: 'assignment-1',
		assignmentDate: '2026-02-12',
		routeName: 'Downtown',
		routeStartTime: '09:00',
		warehouseName: 'Main Warehouse',
		mode: 'competitive',
		payBonusPercent: 0,
		opensAt: '2026-02-10T09:00:00.000Z',
		closesAt: '2026-02-10T10:00:00.000Z',
		...overrides
	};
}

async function importBidsStore() {
	vi.resetModules();
	const module = await import('../../src/lib/stores/bidsStore.svelte.ts');
	return module.bidsStore;
}

describe('bidsStore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('rejects malformed available-bids payloads before state assignment', async () => {
		const store = await importBidsStore();

		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				bidWindows: [
					{
						id: 'window-1'
					}
				]
			})
		);

		await store.loadAvailable();

		expect(store.availableWindows).toHaveLength(0);
		expect(store.error).toBe('Invalid available bids response');
		expect(mocked.toastError).toHaveBeenCalledWith('bids_load_available_error');
	});

	it('ignores stale available-bids load responses that finish out of order', async () => {
		const store = await importBidsStore();
		const firstPending = deferred<Response>();
		const secondPending = deferred<Response>();

		fetchMock.mockReturnValueOnce(firstPending.promise);
		fetchMock.mockReturnValueOnce(secondPending.promise);

		const firstLoad = store.loadAvailable();
		const secondLoad = store.loadAvailable();

		secondPending.resolve(
			jsonResponse({
				bidWindows: [makeAvailableWindow({ id: 'window-new', routeName: 'New Route' })]
			})
		);
		await secondLoad;

		firstPending.resolve(
			jsonResponse({
				bidWindows: [makeAvailableWindow({ id: 'window-old', routeName: 'Old Route' })]
			})
		);
		await firstLoad;

		expect(store.availableWindows).toHaveLength(1);
		expect(store.availableWindows[0]?.id).toBe('window-new');
		expect(store.availableWindows[0]?.routeName).toBe('New Route');
	});

	it('surfaces an error when bid submission response payload is malformed', async () => {
		const store = await importBidsStore();

		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				success: true,
				status: 'won'
			})
		);

		await expect(store.submitBid('assignment-1')).resolves.toBe(false);
		expect(mocked.toastError).toHaveBeenCalledWith('Invalid bid submission response');
	});
});
