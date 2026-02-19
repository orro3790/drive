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
	notifications_load_error: () => 'notifications_load_error',
	notifications_mark_read_error: () => 'notifications_mark_read_error',
	notifications_mark_all_error: () => 'notifications_mark_all_error',
	offline_requires_connectivity: () => 'offline_requires_connectivity'
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

async function importNotificationsStore() {
	vi.resetModules();
	const module = await import('../../src/lib/stores/notificationsStore.svelte.ts');
	return module.notificationsStore;
}

describe('notificationsStore load lifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('keeps hasLoaded false until first page resolves', async () => {
		const notificationsStore = await importNotificationsStore();
		const pending = deferred<Response>();
		fetchMock.mockReturnValueOnce(pending.promise);

		const loadPromise = notificationsStore.loadPage(0);
		expect(notificationsStore.isLoading).toBe(true);
		expect(notificationsStore.hasLoaded).toBe(false);

		pending.resolve(
			jsonResponse({
				notifications: [
					{
						id: '11111111-1111-4111-8111-111111111111',
						type: 'shift_reminder',
						title: 'Shift Reminder',
						body: 'Shift starts soon',
						data: null,
						read: false,
						createdAt: '2026-02-18T12:00:00.000Z'
					}
				],
				unreadCount: 1,
				emergencyUnreadCount: 0,
				pagination: {
					page: 1,
					pageSize: 20,
					total: 1,
					totalPages: 1
				}
			})
		);

		await loadPromise;

		expect(notificationsStore.isLoading).toBe(false);
		expect(notificationsStore.hasLoaded).toBe(true);
	});
});
