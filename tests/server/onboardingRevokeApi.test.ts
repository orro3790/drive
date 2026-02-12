import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type OnboardingRevokeRouteModule =
	typeof import('../../src/routes/api/onboarding/[id]/revoke/+server');

let PATCH: OnboardingRevokeRouteModule['PATCH'];
let revokeOnboardingEntryMock: ReturnType<
	typeof vi.fn<(entryId: string, organizationId: string, revokedByUserId: string) => Promise<unknown>>
>;

function createUser(role: 'manager' | 'driver', id: string): App.Locals['user'] {
	return {
		id,
		role,
		name: `${role}-${id}`,
		email: `${id}@example.test`,
		organizationId: 'org-test'
	} as App.Locals['user'];
}

beforeEach(async () => {
	vi.resetModules();

	revokeOnboardingEntryMock = vi.fn(async () => null);

	vi.doMock('$lib/server/services/onboarding', () => ({
		revokeOnboardingEntry: revokeOnboardingEntryMock
	}));

	({ PATCH } = await import('../../src/routes/api/onboarding/[id]/revoke/+server'));
}, 20_000);

afterEach(() => {
	vi.doUnmock('$lib/server/services/onboarding');
	vi.clearAllMocks();
});

describe('PATCH /api/onboarding/[id]/revoke route contract', () => {
	it('returns 401 when no user is present', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			params: { id: '5f19728a-94b6-4db9-95fa-ce1dc60922a0' }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 401
		});
		expect(revokeOnboardingEntryMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-manager roles', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			params: { id: '5f19728a-94b6-4db9-95fa-ce1dc60922a0' },
			locals: { user: createUser('driver', 'driver-1') }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 403
		});
		expect(revokeOnboardingEntryMock).not.toHaveBeenCalled();
	});

	it('returns 400 for invalid onboarding entry IDs', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			params: { id: 'not-a-uuid' },
			locals: { user: createUser('manager', 'manager-1') }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
		expect(revokeOnboardingEntryMock).not.toHaveBeenCalled();
	});

	it('returns 404 when no revokable entry exists', async () => {
		revokeOnboardingEntryMock.mockResolvedValueOnce(null);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { id: '5f19728a-94b6-4db9-95fa-ce1dc60922a0' },
			locals: { user: createUser('manager', 'manager-1') }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 404
		});
		expect(revokeOnboardingEntryMock).toHaveBeenCalledWith(
			'5f19728a-94b6-4db9-95fa-ce1dc60922a0',
			'org-test',
			'manager-1'
		);
	});

	it('returns updated entry when revocation succeeds', async () => {
		revokeOnboardingEntryMock.mockResolvedValueOnce({
			id: '5f19728a-94b6-4db9-95fa-ce1dc60922a0',
			status: 'revoked',
			email: 'candidate@example.test'
		});

		const event = createRequestEvent({
			method: 'PATCH',
			params: { id: '5f19728a-94b6-4db9-95fa-ce1dc60922a0' },
			locals: { user: createUser('manager', 'manager-2') }
		});

		const response = await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			entry: {
				id: '5f19728a-94b6-4db9-95fa-ce1dc60922a0',
				status: 'revoked',
				email: 'candidate@example.test'
			}
		});
	});
});
