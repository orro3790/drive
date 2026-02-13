import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type SseRouteModule = typeof import('../../src/routes/api/sse/manager/+server');

let GET: SseRouteModule['GET'];
let createManagerSseStreamMock: ReturnType<typeof vi.fn>;

function createUser(
	role: 'driver' | 'manager',
	id: string,
	organizationId?: string | null
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

	createManagerSseStreamMock = vi.fn(
		() => new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode(': connected\n')) })
	);

	vi.doMock('$lib/server/realtime/managerSse', () => ({
		createManagerSseStream: createManagerSseStreamMock
	}));

	({ GET } = await import('../../src/routes/api/sse/manager/+server'));
}, 20_000);

afterEach(() => {
	vi.doUnmock('$lib/server/realtime/managerSse');
	vi.clearAllMocks();
});

describe('GET /api/sse/manager org-scope guard', () => {
	it('returns 401 when no user is present', async () => {
		const event = createRequestEvent({ method: 'GET' });

		await expect(GET(event as Parameters<typeof GET>[0])).rejects.toMatchObject({ status: 401 });
		expect(createManagerSseStreamMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-manager role', async () => {
		const event = createRequestEvent({
			method: 'GET',
			locals: { user: createUser('driver', 'driver-1', 'org-test') }
		});

		await expect(GET(event as Parameters<typeof GET>[0])).rejects.toMatchObject({ status: 403 });
		expect(createManagerSseStreamMock).not.toHaveBeenCalled();
	});

	it('returns 403 when manager has no organizationId', async () => {
		const event = createRequestEvent({
			method: 'GET',
			locals: { user: createUser('manager', 'manager-1', null) }
		});

		await expect(GET(event as Parameters<typeof GET>[0])).rejects.toMatchObject({ status: 403 });
		expect(createManagerSseStreamMock).not.toHaveBeenCalled();
	});

	it('creates stream with correct organizationId for valid manager', async () => {
		const event = createRequestEvent({
			method: 'GET',
			locals: {
				user: createUser('manager', 'manager-1', 'org-abc'),
				organizationId: 'org-abc'
			}
		});

		const response = await GET(event as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
		expect(createManagerSseStreamMock).toHaveBeenCalledWith('org-abc');
	});
});
