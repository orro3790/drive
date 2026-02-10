import { describe, expect, it } from 'vitest';

import { createCookieJar, createRequestEvent } from './requestEvent';

describe('request event harness', () => {
	it('builds JSON requests from object bodies', async () => {
		const event = createRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/example',
			body: { assignmentId: 'a-1', parcelsStart: 12 }
		});

		expect(event.request.method).toBe('POST');
		expect(event.request.headers.get('content-type')).toBe('application/json');
		await expect(event.request.json()).resolves.toEqual({ assignmentId: 'a-1', parcelsStart: 12 });
	});

	it('keeps cookie mutations in-memory for the request lifecycle', () => {
		const cookies = createCookieJar({ session: 'before' });
		const event = createRequestEvent({ cookies });

		event.cookies.set('token', 'abc123', { path: '/' });
		expect(event.cookies.get('token')).toBe('abc123');

		event.cookies.delete('session', { path: '/' });
		expect(event.cookies.get('session')).toBeUndefined();
		expect(event.cookies.getAll()).toEqual([{ name: 'token', value: 'abc123' }]);
	});
});
