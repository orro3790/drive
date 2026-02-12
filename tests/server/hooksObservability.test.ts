import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type HooksModule = typeof import('../../src/hooks.server');

let handle: HooksModule['handle'];
let handleError: HooksModule['handleError'];

let svelteKitHandlerMock: ReturnType<typeof vi.fn>;
let getSessionMock: ReturnType<typeof vi.fn>;
let isPublicRouteMock: ReturnType<typeof vi.fn>;
let isMonitoredAuthRateLimitPathMock: ReturnType<typeof vi.fn>;
let buildSignInRedirectMock: ReturnType<typeof vi.fn>;
let loggerInfoMock: ReturnType<typeof vi.fn>;
let loggerWarnMock: ReturnType<typeof vi.fn>;
let loggerErrorMock: ReturnType<typeof vi.fn>;

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

	svelteKitHandlerMock = vi.fn(
		async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
	);
	getSessionMock = vi.fn(async () => null);
	isPublicRouteMock = vi.fn(() => false);
	isMonitoredAuthRateLimitPathMock = vi.fn(() => false);
	buildSignInRedirectMock = vi.fn(() => '/sign-in');
	loggerInfoMock = vi.fn();
	loggerWarnMock = vi.fn();
	loggerErrorMock = vi.fn();

	vi.doMock('better-auth/svelte-kit', () => ({
		svelteKitHandler: svelteKitHandlerMock
	}));

	vi.doMock('$lib/server/auth', () => ({
		auth: {
			api: {
				getSession: getSessionMock
			}
		}
	}));

	vi.doMock('$lib/server/auth-route-policy', () => ({
		buildSignInRedirect: buildSignInRedirectMock,
		isMonitoredAuthRateLimitPath: isMonitoredAuthRateLimitPathMock,
		isPublicRoute: isPublicRouteMock
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			info: loggerInfoMock,
			warn: loggerWarnMock,
			error: loggerErrorMock
		},
		toSafeErrorMessage: vi.fn(() => 'Error'),
		toErrorDetails: vi.fn((error: unknown) => ({
			errorType: error instanceof Error ? error.name || 'Error' : 'UnknownError',
			errorMessage: error instanceof Error ? error.message : String(error),
			errorStack: error instanceof Error ? error.stack : undefined
		}))
	}));

	({ handle, handleError } = await import('../../src/hooks.server'));
}, 20_000);

afterEach(() => {
	vi.doUnmock('better-auth/svelte-kit');
	vi.doUnmock('$lib/server/auth');
	vi.doUnmock('$lib/server/auth-route-policy');
	vi.doUnmock('$lib/server/logger');
	vi.clearAllMocks();
});

describe('hooks observability', () => {
	it('propagates inbound request id for API auth responses', async () => {
		const event = createRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/auth/sign-in/email',
			headers: { 'x-request-id': 'req_inbound_123' }
		});

		const response = await handle({
			event,
			resolve: vi.fn()
		} as Parameters<typeof handle>[0]);

		expect(response.headers.get('x-request-id')).toBe('req_inbound_123');
		expect(svelteKitHandlerMock).toHaveBeenCalledTimes(1);
		expect(loggerInfoMock).toHaveBeenCalledWith(
			expect.objectContaining({
				event: 'http.request.completed',
				requestId: 'req_inbound_123',
				status: 200,
				method: 'POST'
			}),
			'API request completed'
		);
	});

	it('generates request id for unauthorized API responses', async () => {
		const event = createRequestEvent({
			method: 'GET',
			url: 'http://localhost/api/assignments',
			routeId: '/api/assignments'
		});

		const response = await handle({
			event,
			resolve: vi.fn()
		} as Parameters<typeof handle>[0]);

		expect(response.status).toBe(401);
		const requestId = response.headers.get('x-request-id');
		expect(requestId).toMatch(/^[A-Za-z0-9_-]{8,}$/);
		expect(loggerInfoMock).toHaveBeenCalledWith(
			expect.objectContaining({
				event: 'http.request.completed',
				requestId,
				status: 401,
				route: '/api/assignments'
			}),
			'API request completed'
		);
	});

	it('logs structured 5xx server errors with request correlation', () => {
		const event = createRequestEvent({
			method: 'PATCH',
			url: 'http://localhost/api/users/me',
			routeId: '/api/users/me',
			locals: {
				requestId: 'req_local_123',
				user: createUser('driver-1')
			}
		});

		const appError = handleError({
			error: new Error('boom'),
			event,
			status: 500,
			message: 'Internal Error'
		});

		expect(loggerErrorMock).toHaveBeenCalledWith(
			expect.objectContaining({
				event: 'http.server_error',
				errorCode: 'UNHANDLED_SERVER_ERROR',
				requestId: 'req_local_123',
				method: 'PATCH',
				path: '/api/users/me',
				status: 500,
				userId: 'driver-1',
				errorType: 'Error',
				errorMessage: 'boom'
			}),
			'Unhandled server error: Error: boom'
		);
		expect(appError).toEqual({ message: 'Internal Error' });
	});
});
