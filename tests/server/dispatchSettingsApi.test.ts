import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';

type DispatchSettingsRouteModule = typeof import('../../src/routes/api/settings/dispatch/+server');

let GET: DispatchSettingsRouteModule['GET'];
let PATCH: DispatchSettingsRouteModule['PATCH'];

let getDispatchSettingsMock: ReturnType<typeof vi.fn>;
let canManageDispatchSettingsMock: ReturnType<typeof vi.fn>;
let updateDispatchSettingsMock: ReturnType<typeof vi.fn>;

function createUser(role: 'driver' | 'manager', id: string): App.Locals['user'] {
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

	getDispatchSettingsMock = vi.fn(async () => ({
		organizationId: 'org-test',
		emergencyBonusPercent: 20,
		rewardMinAttendancePercent: 95,
		correctiveCompletionThresholdPercent: 98,
		updatedBy: 'manager-1',
		updatedAt: new Date('2026-02-11T00:00:00.000Z')
	}));

	canManageDispatchSettingsMock = vi.fn(async () => true);

	updateDispatchSettingsMock = vi.fn(async () => ({
		organizationId: 'org-test',
		emergencyBonusPercent: 35,
		rewardMinAttendancePercent: 90,
		correctiveCompletionThresholdPercent: 97,
		updatedBy: 'manager-1',
		updatedAt: new Date('2026-02-11T01:00:00.000Z')
	}));

	vi.doMock('$lib/server/services/dispatchSettings', () => ({
		canManageDispatchSettings: canManageDispatchSettingsMock,
		getDispatchSettings: getDispatchSettingsMock,
		updateDispatchSettings: updateDispatchSettingsMock
	}));

	({ GET, PATCH } = await import('../../src/routes/api/settings/dispatch/+server'));
});

afterEach(() => {
	vi.doUnmock('$lib/server/services/dispatchSettings');
	vi.clearAllMocks();
});

describe('GET /api/settings/dispatch', () => {
	it('returns 401 when user is missing', async () => {
		const event = createRequestEvent({ method: 'GET' });

		await expect(GET(event as Parameters<typeof GET>[0])).rejects.toMatchObject({ status: 401 });
		expect(getDispatchSettingsMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-manager users', async () => {
		const event = createRequestEvent({
			method: 'GET',
			locals: { user: createUser('driver', 'driver-1') }
		});

		await expect(GET(event as Parameters<typeof GET>[0])).rejects.toMatchObject({ status: 403 });
		expect(getDispatchSettingsMock).not.toHaveBeenCalled();
	});

	it('returns current dispatch settings for managers', async () => {
		const event = createRequestEvent({
			method: 'GET',
			locals: { user: createUser('manager', 'manager-1') }
		});

		const response = await GET(event as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			settings: {
				emergencyBonusPercent: 20,
				rewardMinAttendancePercent: 95,
				correctiveCompletionThresholdPercent: 98,
				updatedBy: 'manager-1',
				updatedAt: '2026-02-11T00:00:00.000Z'
			},
			permissions: {
				canEditEmergencyBonusPercent: true,
				canEditDriverHealthSettings: true
			}
		});
		expect(canManageDispatchSettingsMock).toHaveBeenCalledTimes(1);
		expect(canManageDispatchSettingsMock).toHaveBeenCalledWith({
			organizationId: 'org-test',
			userId: 'manager-1'
		});
		expect(getDispatchSettingsMock).toHaveBeenCalledTimes(1);
		expect(getDispatchSettingsMock).toHaveBeenCalledWith('org-test');
	});

	it('falls back to default settings when service lookup fails', async () => {
		getDispatchSettingsMock.mockRejectedValueOnce(
			new Error('relation "dispatch_settings" does not exist')
		);

		const event = createRequestEvent({
			method: 'GET',
			locals: { user: createUser('manager', 'manager-1') }
		});

		const response = await GET(event as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			settings: {
				emergencyBonusPercent: 20,
				rewardMinAttendancePercent: 95,
				correctiveCompletionThresholdPercent: 98,
				updatedBy: null
			},
			permissions: {
				canEditEmergencyBonusPercent: true,
				canEditDriverHealthSettings: true
			}
		});
	});

	it('marks bonus control as read-only for non-owner managers', async () => {
		canManageDispatchSettingsMock.mockResolvedValueOnce(false);

		const event = createRequestEvent({
			method: 'GET',
			locals: { user: createUser('manager', 'manager-2') }
		});

		const response = await GET(event as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			permissions: {
				canEditEmergencyBonusPercent: false,
				canEditDriverHealthSettings: false
			}
		});
	});
});

describe('PATCH /api/settings/dispatch', () => {
	it('returns 401 when user is missing', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			body: { emergencyBonusPercent: 30 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 401
		});
		expect(updateDispatchSettingsMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-manager users', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			locals: { user: createUser('driver', 'driver-1') },
			body: { emergencyBonusPercent: 30 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 403
		});
		expect(updateDispatchSettingsMock).not.toHaveBeenCalled();
	});

	it('returns 403 for manager users who are not organization owners', async () => {
		canManageDispatchSettingsMock.mockResolvedValueOnce(false);

		const event = createRequestEvent({
			method: 'PATCH',
			locals: { user: createUser('manager', 'manager-2') },
			body: { emergencyBonusPercent: 30 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 403
		});
		expect(updateDispatchSettingsMock).not.toHaveBeenCalled();
	});

	it('returns 400 for invalid JSON request body', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			locals: { user: createUser('manager', 'manager-1') },
			body: '{',
			headers: { 'content-type': 'application/json' }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
		expect(updateDispatchSettingsMock).not.toHaveBeenCalled();
	});

	it('returns 400 for invalid payload', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			locals: { user: createUser('manager', 'manager-1') },
			body: { emergencyBonusPercent: 101 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
		expect(updateDispatchSettingsMock).not.toHaveBeenCalled();
	});

	it('updates and returns dispatch settings for valid manager requests', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			locals: { user: createUser('manager', 'manager-1') },
			body: { emergencyBonusPercent: 35 }
		});

		const response = await PATCH(event as Parameters<typeof PATCH>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			settings: {
				emergencyBonusPercent: 35,
				rewardMinAttendancePercent: 90,
				correctiveCompletionThresholdPercent: 97,
				updatedBy: 'manager-1',
				updatedAt: '2026-02-11T01:00:00.000Z'
			}
		});

		expect(updateDispatchSettingsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: 'org-test',
				emergencyBonusPercent: 35,
				actorId: 'manager-1'
			})
		);
	});

	it('updates health threshold settings for owner managers', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			locals: { user: createUser('manager', 'manager-1') },
			body: {
				rewardMinAttendancePercent: 92,
				correctiveCompletionThresholdPercent: 99
			}
		});

		const response = await PATCH(event as Parameters<typeof PATCH>[0]);
		expect(response.status).toBe(200);
		expect(updateDispatchSettingsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: 'org-test',
				rewardMinAttendancePercent: 92,
				correctiveCompletionThresholdPercent: 99,
				actorId: 'manager-1'
			})
		);
	});

	it('returns 503 when settings persistence is unavailable', async () => {
		updateDispatchSettingsMock.mockRejectedValueOnce(
			new Error('relation "dispatch_settings" does not exist')
		);

		const event = createRequestEvent({
			method: 'PATCH',
			locals: { user: createUser('manager', 'manager-1') },
			body: { emergencyBonusPercent: 35 }
		});

		const response = await PATCH(event as Parameters<typeof PATCH>[0]);
		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({
			message: 'Dispatch settings are unavailable right now.'
		});
	});
});
