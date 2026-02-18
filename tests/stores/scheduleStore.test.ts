import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
	toastError: vi.fn()
}));

vi.mock('$lib/stores/app-shell/toastStore.svelte', () => ({
	toastStore: {
		error: mocked.toastError,
		success: vi.fn()
	}
}));

vi.mock('$lib/paraglide/messages.js', () => ({
	schedule_load_error: () => 'schedule_load_error',
	schedule_cancel_success: () => 'schedule_cancel_success',
	schedule_cancel_error: () => 'schedule_cancel_error',
	shift_start_success: () => 'shift_start_success',
	shift_start_error: () => 'shift_start_error',
	shift_complete_success: () => 'shift_complete_success',
	shift_complete_error: () => 'shift_complete_error'
}));

vi.mock('$lib/stores/helpers/connectivity', () => ({
	ensureOnlineForWrite: () => true
}));

const fetchMock = vi.fn<typeof fetch>();

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body
	} as unknown as Response;
}

async function importScheduleStore() {
	vi.resetModules();
	const module = await import('../../src/lib/stores/scheduleStore.svelte.ts');
	return module.scheduleStore;
}

describe('scheduleStore load lifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('keeps hasLoaded false until first load completes', async () => {
		const scheduleStore = await importScheduleStore();
		const pending = deferred<Response>();
		fetchMock.mockReturnValueOnce(pending.promise);

		const loadPromise = scheduleStore.load();
		expect(scheduleStore.isLoading).toBe(true);
		expect(scheduleStore.hasLoaded).toBe(false);

		pending.resolve(
			jsonResponse({
				assignments: [],
				weekStart: '2026-02-16',
				nextWeekStart: '2026-02-23'
			})
		);

		await loadPromise;

		expect(scheduleStore.isLoading).toBe(false);
		expect(scheduleStore.hasLoaded).toBe(true);
	});
});
