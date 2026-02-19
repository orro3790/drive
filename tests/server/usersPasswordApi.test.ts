import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type PasswordRouteModule = typeof import('../../src/routes/api/users/password/+server');

let POST: PasswordRouteModule['POST'];
let changePasswordMock: ReturnType<
	typeof vi.fn<
		(args: {
			headers: Headers;
			body: { currentPassword: string; newPassword: string };
			asResponse: boolean;
		}) => Promise<Response>
	>
>;

function createUser(id: string = 'driver-1'): App.Locals['user'] {
	return {
		id,
		role: 'driver',
		name: `Driver ${id}`,
		email: `${id}@example.test`
	} as App.Locals['user'];
}

beforeEach(async () => {
	vi.resetModules();

	changePasswordMock = vi.fn(async () => new Response(null, { status: 204 }));

	vi.doMock('$lib/server/auth', () => ({
		auth: {
			api: {
				changePassword: changePasswordMock
			}
		}
	}));

	({ POST } = await import('../../src/routes/api/users/password/+server'));
}, 20_000);

afterEach(() => {
	vi.doUnmock('$lib/server/auth');
	vi.clearAllMocks();
});

describe('POST /api/users/password route contract', () => {
	it('returns 401 when user is missing', async () => {
		const event = createRequestEvent({ method: 'POST' });

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 401 });
		expect(changePasswordMock).not.toHaveBeenCalled();
	});

	it('returns 400 when body fails validation', async () => {
		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser() },
			body: { currentPassword: 'current-only' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
		expect(changePasswordMock).not.toHaveBeenCalled();
	});

	it('returns success when Better Auth password update succeeds', async () => {
		changePasswordMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver-2') },
			body: {
				currentPassword: 'old-password',
				newPassword: 'new-password-123'
			}
		});

		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true });
		expect(changePasswordMock).toHaveBeenCalledWith(
			expect.objectContaining({
				asResponse: true,
				body: {
					currentPassword: 'old-password',
					newPassword: 'new-password-123'
				}
			})
		);
	});

	it('maps Better Auth failures to API error contract', async () => {
		changePasswordMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ message: 'INVALID_PASSWORD' }), {
				status: 429,
				headers: { 'content-type': 'application/json' }
			})
		);

		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver-3') },
			body: {
				currentPassword: 'wrong-password',
				newPassword: 'new-password-123'
			}
		});

		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ message: 'invalid_password' });
	});
});
