/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_PREFIX = 'drive-api-cache';
const CACHE_VERSION = 'v1';
const API_CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;

const CACHEABLE_API_PATHS = new Set([
	'/api/assignments/mine',
	'/api/preferences',
	'/api/metrics',
	'/api/dashboard'
]);

function isCacheableRequest(request: Request): boolean {
	if (request.method !== 'GET') {
		return false;
	}

	const url = new URL(request.url);
	return url.origin === self.location.origin && CACHEABLE_API_PATHS.has(url.pathname);
}

async function fetchAndCache(cache: Cache, request: Request): Promise<Response> {
	const response = await fetch(request);

	if (response.ok) {
		await cache.put(request, response.clone());
	}

	return response;
}

async function staleWhileRevalidate(event: FetchEvent): Promise<Response> {
	const cache = await caches.open(API_CACHE_NAME);
	const cached = await cache.match(event.request);

	if (cached) {
		event.waitUntil(fetchAndCache(cache, event.request).catch(() => undefined));
		return cached;
	}

	try {
		return await fetchAndCache(cache, event.request);
	} catch {
		return new Response(
			JSON.stringify({ message: 'Offline and no cached response is available.' }),
			{
				status: 503,
				headers: {
					'Content-Type': 'application/json'
				}
			}
		);
	}
}

async function refreshTrackedEndpoints(): Promise<void> {
	const cache = await caches.open(API_CACHE_NAME);

	await Promise.all(
		[...CACHEABLE_API_PATHS].map(async (path) => {
			const request = new Request(new URL(path, self.location.origin).toString(), {
				method: 'GET',
				credentials: 'same-origin'
			});

			try {
				await fetchAndCache(cache, request);
			} catch {
				// Ignore refresh failures; existing cache remains intact
			}
		})
	);
}

self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith(CACHE_PREFIX) && key !== API_CACHE_NAME)
					.map((key) => caches.delete(key))
			);
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	if (!isCacheableRequest(event.request)) {
		return;
	}

	event.respondWith(staleWhileRevalidate(event));
});

self.addEventListener('message', (event) => {
	if (event.data?.type !== 'drive:refresh-offline-cache') {
		return;
	}

	event.waitUntil(refreshTrackedEndpoints());
});

export {};
