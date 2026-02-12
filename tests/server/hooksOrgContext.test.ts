import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type HooksModule = typeof import('../../src/hooks.server');

let handle: HooksModule['handle'];

let svelteKitHandlerMock: ReturnType<typeof vi.fn>;
let getSessionMock: ReturnType<typeof vi.fn>;
let isPublicRouteMock: ReturnType<typeof vi.fn>;

function createSession(organizationId?: unknown) {
	return {
		session: { id: 'session-1', token: 'token-1' },
		user: {
			id: 'user-1',
			role: 'driver',
			name: 'driver-1',
			email: 'user-1@example.test',
			organizationId
		}
	};
}

beforeEach(async () => {
	vi.resetModules();

	svelteKitHandlerMock = vi.fn(
		async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
	);
	getSessionMock = vi.fn(async () => null);
	isPublicRouteMock = vi.fn(() => false);

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
		buildSignInRedirect: vi.fn(() => '/sign-in'),
		isMonitoredAuthRateLimitPath: vi.fn(() => false),
		isPublicRoute: isPublicRouteMock
	}));

	vi.doMock('$lib/server/logger', () => ({
		default: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn()
		},
		toSafeErrorMessage: vi.fn(() => 'Error'),
		toErrorDetails: vi.fn(() => ({
			errorType: 'Error',
			errorMessage: 'test',
			errorStack: undefined
		}))
	}));

	({ handle } = await import('../../src/hooks.server'));
}, 20_000);

afterEach(() => {
	vi.doUnmock('better-auth/svelte-kit');
	vi.doUnmock('$lib/server/auth');
	vi.doUnmock('$lib/server/auth-route-policy');
	vi.doUnmock('$lib/server/logger');
	vi.clearAllMocks();
});

describe('hooks org context population', () => {
	it('sets locals.organizationId from session when present', async () => {
		getSessionMock.mockResolvedValueOnce(createSession('org-abc'));
		isPublicRouteMock.mockReturnValue(false);

		const event = createRequestEvent({
			method: 'GET',
			url: 'http://localhost/api/dashboard'
		});

		await handle({
			event,
			resolve: vi.fn()
		} as Parameters<typeof handle>[0]);

		expect(event.locals.organizationId).toBe('org-abc');
		expect(event.locals.user).toMatchObject({ id: 'user-1' });
	});

	it('leaves locals.organizationId undefined when session has no organizationId', async () => {
		getSessionMock.mockResolvedValueOnce(createSession(undefined));
		isPublicRouteMock.mockReturnValue(false);

		const event = createRequestEvent({
			method: 'GET',
			url: 'http://localhost/api/dashboard'
		});

		await handle({
			event,
			resolve: vi.fn()
		} as Parameters<typeof handle>[0]);

		expect(event.locals.organizationId).toBeUndefined();
		expect(event.locals.user).toMatchObject({ id: 'user-1' });
	});

	it('leaves locals.organizationId undefined when session has null organizationId', async () => {
		getSessionMock.mockResolvedValueOnce(createSession(null));
		isPublicRouteMock.mockReturnValue(false);

		const event = createRequestEvent({
			method: 'GET',
			url: 'http://localhost/api/dashboard'
		});

		await handle({
			event,
			resolve: vi.fn()
		} as Parameters<typeof handle>[0]);

		expect(event.locals.organizationId).toBeUndefined();
	});

	it('leaves locals.organizationId undefined when session has non-string organizationId', async () => {
		getSessionMock.mockResolvedValueOnce(createSession(12345));
		isPublicRouteMock.mockReturnValue(false);

		const event = createRequestEvent({
			method: 'GET',
			url: 'http://localhost/api/dashboard'
		});

		await handle({
			event,
			resolve: vi.fn()
		} as Parameters<typeof handle>[0]);

		expect(event.locals.organizationId).toBeUndefined();
	});

	it('does not set user or organizationId when no session exists', async () => {
		getSessionMock.mockResolvedValueOnce(null);
		isPublicRouteMock.mockReturnValue(true);

		const event = createRequestEvent({
			method: 'GET',
			url: 'http://localhost/'
		});

		await handle({
			event,
			resolve: vi.fn()
		} as Parameters<typeof handle>[0]);

		expect(event.locals.user).toBeUndefined();
		expect(event.locals.organizationId).toBeUndefined();
	});
});
