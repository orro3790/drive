import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type OnboardingRouteModule = typeof import('../../src/routes/api/onboarding/+server');

let POST: OnboardingRouteModule['POST'];

beforeEach(async () => {
	vi.resetModules();
	({ POST } = await import('../../src/routes/api/onboarding/+server'));
});

describe('POST /api/onboarding', () => {
	it('returns 400 with invalid_json when request body is malformed JSON', async () => {
		const event = createRequestEvent({
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"kind":"approval",',
			locals: {
				organizationId: 'org-test',
				user: {
					id: 'manager-1',
					name: 'Manager',
					email: 'manager@example.test',
					role: 'manager',
					organizationId: 'org-test'
				}
			} as App.Locals
		});

		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: 'invalid_json' });
	});

	it('rejects invite creation payloads and only allows approval entries', async () => {
		const event = createRequestEvent({
			method: 'POST',
			body: {
				kind: 'invite',
				email: 'driver@example.test',
				expiresInHours: 24
			},
			locals: {
				organizationId: 'org-test',
				user: {
					id: 'manager-1',
					name: 'Manager',
					email: 'manager@example.test',
					role: 'manager',
					organizationId: 'org-test'
				}
			} as App.Locals
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 400 });
	});
});
