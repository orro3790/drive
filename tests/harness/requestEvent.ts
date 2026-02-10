import type { Cookies, RequestEvent } from '@sveltejs/kit';

type JsonObject = Record<string, unknown>;

export type RequestEventBody = BodyInit | JsonObject | null;

export interface RequestEventOptions {
	method?: string;
	url?: string | URL;
	headers?: HeadersInit;
	body?: RequestEventBody;
	locals?: App.Locals;
	params?: RequestEvent['params'];
	routeId?: RequestEvent['route']['id'];
	cookies?: Cookies;
	fetch?: typeof fetch;
}

const NOOP_SPAN = {} as RequestEvent['tracing']['root'];

function isBodyInit(value: unknown): value is BodyInit {
	return (
		typeof value === 'string' ||
		value instanceof URLSearchParams ||
		(typeof FormData !== 'undefined' && value instanceof FormData) ||
		(typeof Blob !== 'undefined' && value instanceof Blob) ||
		value instanceof ArrayBuffer ||
		ArrayBuffer.isView(value) ||
		(typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
	);
}

function normalizeBody(
	body: RequestEventBody | undefined,
	headers: Headers
): BodyInit | null | undefined {
	if (body === undefined || body === null) {
		return body;
	}

	if (isBodyInit(body)) {
		return body;
	}

	if (!headers.has('content-type')) {
		headers.set('content-type', 'application/json');
	}

	return JSON.stringify(body);
}

export function createCookieJar(initial: Record<string, string> = {}): Cookies {
	const store = new Map<string, string>(Object.entries(initial));

	return {
		get: (name) => store.get(name),
		getAll: () => Array.from(store.entries(), ([name, value]) => ({ name, value })),
		set: (name, value) => {
			store.set(name, value);
		},
		delete: (name) => {
			store.delete(name);
		},
		serialize: (name, value) => `${name}=${value}`
	};
}

export function createRequestEvent(options: RequestEventOptions = {}): RequestEvent {
	const url =
		options.url instanceof URL ? options.url : new URL(options.url ?? 'http://localhost/');
	const headers = new Headers(options.headers);

	const request = new Request(url, {
		method: options.method ?? 'GET',
		headers,
		body: normalizeBody(options.body, headers)
	});

	return {
		cookies: options.cookies ?? createCookieJar(),
		fetch: options.fetch ?? globalThis.fetch,
		getClientAddress: () => '127.0.0.1',
		locals: options.locals ?? {},
		params: options.params ?? {},
		platform: undefined,
		request,
		route: { id: options.routeId ?? null },
		setHeaders: () => undefined,
		url,
		isDataRequest: false,
		isSubRequest: false,
		isRemoteRequest: false,
		tracing: {
			enabled: false,
			root: NOOP_SPAN,
			current: NOOP_SPAN
		}
	};
}
