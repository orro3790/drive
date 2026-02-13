import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type FcmTokenRouteModule = typeof import('../../src/routes/api/users/fcm-token/+server');

let POST: FcmTokenRouteModule['POST'];
let DELETE: FcmTokenRouteModule['DELETE'];

let updateWhereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<void>>>;
let updateSetMock: ReturnType<
	typeof vi.fn<(values: Record<string, unknown>) => { where: typeof updateWhereMock }>
>;
let updateMock: ReturnType<typeof vi.fn<(table: unknown) => { set: typeof updateSetMock }>>;

function createUser(id: string): App.Locals['user'] {
	return {
		id,
		role: 'driver',
		name: `driver-${id}`,
		email: `${id}@example.test`,
		organizationId: 'org-test'
	} as App.Locals['user'];
}

beforeEach(async () => {
	vi.resetModules();

	updateWhereMock = vi.fn(async (_whereClause: unknown) => undefined);
	updateSetMock = vi.fn((_values: Record<string, unknown>) => ({ where: updateWhereMock }));
	updateMock = vi.fn((_table: unknown) => ({ set: updateSetMock }));

	const childLogger = {
		info: vi.fn(),
		error: vi.fn()
	};

	vi.doMock('$lib/server/db', () => ({
		db: {
			update: updateMock
		}
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			child: vi.fn(() => childLogger)
		},
		toSafeErrorMessage: vi.fn(() => 'safe_error')
	}));

	({ POST, DELETE } = await import('../../src/routes/api/users/fcm-token/+server'));
}, 20_000);

afterEach(() => {
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/logger');
	vi.clearAllMocks();
});

describe('POST /api/users/fcm-token route contract', () => {
	it('returns 401 when user is missing', async () => {
		const event = createRequestEvent({ method: 'POST' });

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 401 });
		expect(updateMock).not.toHaveBeenCalled();
	});

	it('returns 400 for malformed JSON body', async () => {
		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver-1') },
			body: '{',
			headers: { 'content-type': 'application/json' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
		expect(updateMock).not.toHaveBeenCalled();
	});

	it('returns 400 when token schema validation fails', async () => {
		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver-2') },
			body: { token: '' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
		expect(updateMock).not.toHaveBeenCalled();
	});

	it('persists token and returns success payload', async () => {
		const event = createRequestEvent({
			method: 'POST',
			locals: { user: createUser('driver-3') },
			body: { token: 'fcm-token-abc' }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true });
		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(updateSetMock).toHaveBeenCalledWith(
			expect.objectContaining({
				fcmToken: 'fcm-token-abc'
			})
		);
	});
});

describe('DELETE /api/users/fcm-token route contract', () => {
	it('clears token and returns success payload', async () => {
		const event = createRequestEvent({
			method: 'DELETE',
			locals: { user: createUser('driver-4') }
		});

		const response = await DELETE(event as Parameters<typeof DELETE>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true });
		expect(updateSetMock).toHaveBeenCalledWith(
			expect.objectContaining({
				fcmToken: null
			})
		);
	});
});
