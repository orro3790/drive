/**
 * Server Hooks - Auth Middleware
 */

import type { Handle, HandleServerError, RequestEvent } from '@sveltejs/kit';
import { json, redirect } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';
import {
	buildSignInRedirect,
	isMonitoredAuthRateLimitPath,
	isPublicRoute
} from '$lib/server/auth-route-policy';
import logger, { toErrorDetails } from '$lib/server/logger';

function extractClientIp(headers: Headers): string | null {
	const forwardedFor = headers.get('x-forwarded-for');
	if (forwardedFor) {
		return forwardedFor.split(',')[0]?.trim() || null;
	}

	return headers.get('x-real-ip');
}

function createRequestId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getRequestId(headers: Headers): string {
	const inboundRequestId = headers.get('x-request-id')?.trim();
	return inboundRequestId || createRequestId();
}

function getRouteLabel(event: RequestEvent): string {
	return event.route.id ?? event.url.pathname;
}

function finalizeResponse(
	event: RequestEvent,
	response: Response,
	requestId: string,
	startedAt: number
): Response {
	if (!response.headers.has('x-request-id')) {
		response.headers.set('x-request-id', requestId);
	}

	if (event.url.pathname.startsWith('/api')) {
		logger.info(
			{
				event: 'http.request.completed',
				requestId,
				method: event.request.method,
				route: getRouteLabel(event),
				path: event.url.pathname,
				status: response.status,
				durationMs: Date.now() - startedAt,
				userId: event.locals.user?.id ?? null
			},
			'API request completed'
		);
	}

	return response;
}

function getServerErrorCode(status: number): 'UNHANDLED_SERVER_ERROR' | 'UPSTREAM_SERVER_ERROR' {
	if (status === 500) {
		return 'UNHANDLED_SERVER_ERROR';
	}

	return 'UPSTREAM_SERVER_ERROR';
}

export const handle: Handle = async ({ event, resolve }) => {
	const startedAt = Date.now();
	const requestId = getRequestId(event.request.headers);
	event.locals.requestId = requestId;

	const { pathname } = event.url;

	if (pathname.startsWith('/api/auth')) {
		const response = await svelteKitHandler({ event, resolve, auth, building });
		if (response.status === 429 && isMonitoredAuthRateLimitPath(pathname)) {
			logger.warn(
				{
					event: 'auth.rate_limit_exceeded',
					requestId,
					route: getRouteLabel(event),
					path: pathname,
					ip: extractClientIp(event.request.headers),
					userAgent: event.request.headers.get('user-agent')
				},
				'auth_rate_limit_exceeded'
			);
		}

		return finalizeResponse(event, response, requestId, startedAt);
	}

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
		event.locals.userId = session.user?.id;
	}

	const isPublic = isPublicRoute(pathname);

	if (!session && !isPublic) {
		if (pathname.startsWith('/api')) {
			return finalizeResponse(
				event,
				json({ error: 'Unauthorized' }, { status: 401 }),
				requestId,
				startedAt
			);
		}
		throw redirect(302, buildSignInRedirect(pathname, event.url.search));
	}

	const response = await svelteKitHandler({ event, resolve, auth, building });
	return finalizeResponse(event, response, requestId, startedAt);
};

export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const requestId = event.locals.requestId ?? getRequestId(event.request.headers);

	if (status >= 500) {
		const { errorType, errorMessage, errorStack } = toErrorDetails(error);
		logger.error(
			{
				event: 'http.server_error',
				errorCode: getServerErrorCode(status),
				requestId,
				method: event.request.method,
				route: getRouteLabel(event),
				path: event.url.pathname,
				status,
				userId: event.locals.user?.id ?? null,
				errorType,
				errorMessage,
				errorStack
			},
			`Unhandled server error: ${errorType}: ${errorMessage}`
		);
	}

	return {
		message
	};
};
