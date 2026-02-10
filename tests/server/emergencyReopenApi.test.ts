import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type EmergencyReopenRouteModule =
	typeof import('../../src/routes/api/assignments/[id]/emergency-reopen/+server');

const ASSIGNMENT_ID = '11111111-1111-4111-8111-111111111111';

let POST: EmergencyReopenRouteModule['POST'];
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function createManagerUser(id = 'manager-1'): App.Locals['user'] {
	return {
		id,
		role: 'manager',
		name: `manager-${id}`,
		email: `${id}@example.test`
	} as App.Locals['user'];
}

function createDriverUser(id = 'driver-1'): App.Locals['user'] {
	return {
		id,
		role: 'driver',
		name: `driver-${id}`,
		email: `${id}@example.test`
	} as App.Locals['user'];
}

beforeEach(async () => {
	vi.resetModules();
	fetchMock = vi.fn<typeof fetch>();
	({ POST } = await import('../../src/routes/api/assignments/[id]/emergency-reopen/+server'));
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('POST /api/assignments/[id]/emergency-reopen', () => {
	it('returns 401 when user is missing', async () => {
		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			fetch: fetchMock
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 401 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-manager users', async () => {
		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createDriverUser() },
			fetch: fetchMock
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 403 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns 400 for invalid assignment id params', async () => {
		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'not-a-uuid' },
			locals: { user: createManagerUser() },
			fetch: fetchMock
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('delegates to override endpoint and maps successful payload', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					action: 'open_urgent_bidding',
					bidWindow: { id: 'window-urgent-1' },
					notifiedCount: 5
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/json' }
				}
			)
		);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser() },
			fetch: fetchMock
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			bidWindowId: 'window-urgent-1',
			notifiedCount: 5
		});

		expect(fetchMock).toHaveBeenCalledWith(
			`/api/assignments/${ASSIGNMENT_ID}/override`,
			expect.objectContaining({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'open_urgent_bidding' })
			})
		);
	});

	it('normalizes missing bid window and notified count from override response', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ action: 'open_urgent_bidding', bidWindow: null }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser() },
			fetch: fetchMock
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		await expect(response.json()).resolves.toEqual({
			success: true,
			bidWindowId: null,
			notifiedCount: 0
		});
	});

	it('surfaces override endpoint failures through HTTP status', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ message: 'window already open' }), {
				status: 409,
				headers: { 'content-type': 'application/json' }
			})
		);

		const event = createRequestEvent({
			method: 'POST',
			params: { id: ASSIGNMENT_ID },
			locals: { user: createManagerUser() },
			fetch: fetchMock
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 409 });
	});
});
