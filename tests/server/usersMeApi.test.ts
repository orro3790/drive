import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type UsersMeRouteModule = typeof import('../../src/routes/api/users/me/+server');

let PATCH: UsersMeRouteModule['PATCH'];
let transactionMock: ReturnType<typeof vi.fn<(runner: unknown) => Promise<unknown>>>;
let loggerWarnMock: ReturnType<typeof vi.fn>;
let childLoggerWarnMock: ReturnType<typeof vi.fn>;
let childLoggerErrorMock: ReturnType<typeof vi.fn>;

function createUser(
	id: string,
	email: string = `${id}@example.test`,
	role: 'driver' | 'manager' = 'driver'
): App.Locals['user'] {
	return {
		id,
		email,
		role,
		name: `${role}-${id}`,
		organizationId: 'org-test'
	} as App.Locals['user'];
}

beforeEach(async () => {
	vi.resetModules();

	transactionMock = vi.fn(async (_runner: unknown) => null);
	loggerWarnMock = vi.fn();
	childLoggerWarnMock = vi.fn();
	childLoggerErrorMock = vi.fn();

	vi.doMock('$lib/server/db', () => ({
		db: {
			transaction: transactionMock
		}
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			warn: loggerWarnMock,
			child: vi.fn(() => ({
				info: vi.fn(),
				warn: childLoggerWarnMock,
				error: childLoggerErrorMock
			}))
		},
		toSafeErrorMessage: vi.fn(() => 'safe_error')
	}));

	({ PATCH } = await import('../../src/routes/api/users/me/+server'));
}, 20_000);

afterEach(() => {
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/logger');
	vi.clearAllMocks();
});

describe('PATCH /api/users/me route contract', () => {
	it('returns 401 when user is missing', async () => {
		const event = createRequestEvent({ method: 'PATCH' });

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 401
		});
		expect(transactionMock).not.toHaveBeenCalled();
		expect(loggerWarnMock).toHaveBeenCalledWith(
			expect.objectContaining({ errorCode: 'USER_PROFILE_UNAUTHORIZED' }),
			expect.any(String)
		);
	});

	it('returns 400 for invalid JSON bodies', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			locals: { user: createUser('driver-1') },
			body: '{',
			headers: { 'content-type': 'application/json' }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
		expect(transactionMock).not.toHaveBeenCalled();
		expect(childLoggerWarnMock).toHaveBeenCalledWith(
			expect.objectContaining({ errorCode: 'USER_PROFILE_INVALID_JSON' }),
			expect.any(String)
		);
	});

	it('maps unique-email violations to 409 email_taken', async () => {
		const uniqueError = Object.assign(new Error('duplicate email'), { code: '23505' });
		transactionMock.mockRejectedValueOnce(uniqueError);

		const event = createRequestEvent({
			method: 'PATCH',
			locals: { user: createUser('driver-2') },
			body: {
				name: 'Driver Two',
				email: 'driver-two@example.test',
				phone: null
			}
		});

		const response = await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ error: 'email_taken' });
		expect(childLoggerWarnMock).toHaveBeenCalledWith(
			expect.objectContaining({ errorCode: 'USER_PROFILE_EMAIL_CONFLICT' }),
			expect.any(String)
		);
	});

	it('logs database failures and returns 500 when transaction errors are unexpected', async () => {
		transactionMock.mockRejectedValueOnce(new Error('db timeout'));

		const event = createRequestEvent({
			method: 'PATCH',
			locals: { user: createUser('driver-500') },
			body: {
				name: 'Driver Five Hundred',
				email: 'driver-500@example.test',
				phone: null
			}
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 500
		});
		expect(childLoggerErrorMock).toHaveBeenCalledWith(
			expect.objectContaining({
				errorCode: 'USER_PROFILE_DB_TRANSACTION_FAILED',
				errorType: 'safe_error'
			}),
			expect.any(String)
		);
	});

	it('returns updated user payload when transaction succeeds', async () => {
		transactionMock.mockResolvedValueOnce({
			id: 'driver-3',
			name: 'Driver Three',
			email: 'driver-three@example.test',
			phone: '+1-555-0103',
			role: 'driver'
		});

		const event = createRequestEvent({
			method: 'PATCH',
			locals: { user: createUser('driver-3', 'old-email@example.test') },
			body: {
				name: 'Driver Three',
				email: 'driver-three@example.test',
				phone: '+1-555-0103'
			}
		});

		const response = await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			user: {
				id: 'driver-3',
				name: 'Driver Three',
				email: 'driver-three@example.test',
				phone: '+1-555-0103',
				role: 'driver'
			}
		});
		expect(transactionMock).toHaveBeenCalledTimes(1);
	});
});
