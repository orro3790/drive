import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConfirmShiftResult } from '$lib/server/services/confirmations';

import { createRequestEvent } from '../harness/requestEvent';
import { createBoundaryMock } from '../harness/serviceMocks';
import { freezeTime, resetTime } from '../harness/time';

type ConfirmRouteModule = typeof import('../../src/routes/api/assignments/[id]/confirm/+server');
type ConfirmShiftMock = ReturnType<
	typeof createBoundaryMock<[assignmentId: string, userId: string], Promise<ConfirmShiftResult>>
>;

let POST: ConfirmRouteModule['POST'];
let confirmShiftMock: ConfirmShiftMock;

function createUser(role: 'driver' | 'manager', id: string): App.Locals['user'] {
	return {
		id,
		role,
		name: `${role}-${id}`,
		email: `${id}@example.test`
	} as App.Locals['user'];
}

beforeEach(async () => {
	vi.resetModules();
	confirmShiftMock = createBoundaryMock<[string, string], Promise<ConfirmShiftResult>>();

	vi.doMock('$lib/server/services/confirmations', () => ({
		confirmShift: confirmShiftMock
	}));

	({ POST } = await import('../../src/routes/api/assignments/[id]/confirm/+server'));
});

afterEach(() => {
	resetTime();
	vi.doUnmock('$lib/server/services/confirmations');
	vi.clearAllMocks();
});

describe('POST /api/assignments/[id]/confirm', () => {
	it('returns 401 when no user is present', async () => {
		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-1' }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 401 });
		expect(confirmShiftMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-driver roles', async () => {
		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-1' },
			locals: { user: createUser('manager', 'manager-1') }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status: 403 });
		expect(confirmShiftMock).not.toHaveBeenCalled();
	});

	it('returns success payload with deterministic timestamp', async () => {
		freezeTime('2026-02-09T00:00:00.000Z');
		confirmShiftMock.mockResolvedValue({
			success: true,
			confirmedAt: new Date()
		});

		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-123' },
			locals: { user: createUser('driver', 'driver-123') }
		});

		const response = await POST(event as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			confirmedAt: '2026-02-09T00:00:00.000Z'
		});
		expect(confirmShiftMock).toHaveBeenCalledWith('assignment-123', 'driver-123');
	});

	it.each([
		['Forbidden', 403],
		['Assignment not found', 404],
		['Confirmation deadline has passed', 400]
	] as const)('maps service error "%s" to status %i', async (serviceError, status) => {
		confirmShiftMock.mockResolvedValue({
			success: false,
			error: serviceError
		});

		const event = createRequestEvent({
			method: 'POST',
			params: { id: 'assignment-999' },
			locals: { user: createUser('driver', 'driver-1') }
		});

		await expect(POST(event as Parameters<typeof POST>[0])).rejects.toMatchObject({ status });
	});
});
