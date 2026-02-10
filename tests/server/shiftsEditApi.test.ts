import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestEvent } from '../harness/requestEvent';
import { freezeTime, resetTime } from '../harness/time';

type EditRouteModule = typeof import('../../src/routes/api/shifts/[assignmentId]/edit/+server');

interface AssignmentRow {
	id: string;
	userId: string | null;
}

interface ShiftRow {
	id: string;
	parcelsStart: number | null;
	parcelsReturned: number | null;
	parcelsDelivered: number | null;
	completedAt: Date | null;
	editableUntil: Date | null;
}

interface UpdatedShiftRow {
	id: string;
	parcelsStart: number;
	parcelsDelivered: number;
	parcelsReturned: number;
	startedAt: Date | null;
	completedAt: Date;
	editableUntil: Date;
}

const assignmentsTable = {
	id: 'assignments.id',
	userId: 'assignments.userId'
};

const shiftsTable = {
	id: 'shifts.id',
	assignmentId: 'shifts.assignmentId',
	parcelsStart: 'shifts.parcelsStart',
	parcelsReturned: 'shifts.parcelsReturned',
	parcelsDelivered: 'shifts.parcelsDelivered',
	startedAt: 'shifts.startedAt',
	completedAt: 'shifts.completedAt',
	editableUntil: 'shifts.editableUntil'
};

let PATCH: EditRouteModule['PATCH'];

let selectWhereMock: ReturnType<typeof vi.fn<(whereClause: unknown) => Promise<unknown[]>>>;
let selectFromMock: ReturnType<
	typeof vi.fn<
		(table: unknown) => {
			where: typeof selectWhereMock;
		}
	>
>;
let selectMock: ReturnType<
	typeof vi.fn<
		(shape: Record<string, unknown>) => {
			from: typeof selectFromMock;
		}
	>
>;

let updateReturningMock: ReturnType<
	typeof vi.fn<(shape: Record<string, unknown>) => Promise<UpdatedShiftRow[]>>
>;
let updateWhereMock: ReturnType<
	typeof vi.fn<
		(whereClause: unknown) => {
			returning: typeof updateReturningMock;
		}
	>
>;
let updateSetMock: ReturnType<
	typeof vi.fn<
		(values: Record<string, unknown>) => {
			where: typeof updateWhereMock;
		}
	>
>;
let updateMock: ReturnType<
	typeof vi.fn<
		(table: unknown) => {
			set: typeof updateSetMock;
		}
	>
>;

let createAuditLogMock: ReturnType<typeof vi.fn<(entry: Record<string, unknown>) => Promise<void>>>;
let updateDriverMetricsMock: ReturnType<typeof vi.fn<(userId: string) => Promise<void>>>;

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

	selectWhereMock = vi.fn<(whereClause: unknown) => Promise<unknown[]>>(async () => []);
	selectFromMock = vi.fn<(table: unknown) => { where: typeof selectWhereMock }>(() => ({
		where: selectWhereMock
	}));
	selectMock = vi.fn<(shape: Record<string, unknown>) => { from: typeof selectFromMock }>(() => ({
		from: selectFromMock
	}));

	updateReturningMock = vi.fn<(shape: Record<string, unknown>) => Promise<UpdatedShiftRow[]>>(
		async () => []
	);
	updateWhereMock = vi.fn<(whereClause: unknown) => { returning: typeof updateReturningMock }>(
		() => ({
			returning: updateReturningMock
		})
	);
	updateSetMock = vi.fn<(values: Record<string, unknown>) => { where: typeof updateWhereMock }>(
		() => ({
			where: updateWhereMock
		})
	);
	updateMock = vi.fn<(table: unknown) => { set: typeof updateSetMock }>(() => ({
		set: updateSetMock
	}));

	createAuditLogMock = vi.fn(async () => undefined);
	updateDriverMetricsMock = vi.fn(async () => undefined);

	vi.doMock('$lib/server/db', () => ({
		db: {
			select: selectMock,
			update: updateMock
		}
	}));

	vi.doMock('$lib/server/db/schema', () => ({
		assignments: assignmentsTable,
		shifts: shiftsTable
	}));

	vi.doMock('drizzle-orm', () => ({
		eq: (left: unknown, right: unknown) => ({ left, right })
	}));

	vi.doMock('$lib/server/services/audit', () => ({
		createAuditLog: createAuditLogMock
	}));

	vi.doMock('$lib/server/services/metrics', () => ({
		updateDriverMetrics: updateDriverMetricsMock
	}));

	({ PATCH } = await import('../../src/routes/api/shifts/[assignmentId]/edit/+server'));
});

afterEach(() => {
	resetTime();
	vi.clearAllMocks();
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/services/metrics');
});

describe('PATCH /api/shifts/[assignmentId]/edit contract', () => {
	it('returns 401 when no user is present', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 401
		});
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-driver role', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('manager', 'manager-1') },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 403
		});
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 400 for invalid schema body', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsStart: 0 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 400 when no editable fields are provided', async () => {
		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: {}
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('returns 404 when assignment is missing', async () => {
		selectWhereMock.mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 404
		});
	});

	it('returns 403 when assignment ownership does not match', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-2'
		};
		selectWhereMock.mockResolvedValueOnce([assignment]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 403
		});
		expect(selectWhereMock).toHaveBeenCalledTimes(1);
	});

	it('returns 404 when shift record is missing', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1'
		};
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 404
		});
	});

	it('returns 400 when shift is not completed yet', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1'
		};
		const shift: ShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsReturned: 2,
			parcelsDelivered: 8,
			completedAt: null,
			editableUntil: new Date('2099-01-01T00:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([shift]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns 400 when edit window has expired', async () => {
		freezeTime('2026-02-09T12:00:00.000Z');

		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1'
		};
		const shift: ShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsReturned: 2,
			parcelsDelivered: 8,
			completedAt: new Date('2026-02-09T09:00:00.000Z'),
			editableUntil: new Date('2026-02-09T10:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([shift]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 1 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns 400 when parcel data is missing on existing shift', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1'
		};
		const shift: ShiftRow = {
			id: 'shift-1',
			parcelsStart: null,
			parcelsReturned: 2,
			parcelsDelivered: null,
			completedAt: new Date('2026-02-09T09:00:00.000Z'),
			editableUntil: new Date('2099-01-01T00:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([shift]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 2 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns 400 when returns exceed starting parcel count', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1'
		};
		const shift: ShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsReturned: 1,
			parcelsDelivered: 9,
			completedAt: new Date('2026-02-09T09:00:00.000Z'),
			editableUntil: new Date('2099-01-01T00:00:00.000Z')
		};
		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([shift]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 11 }
		});

		await expect(PATCH(event as Parameters<typeof PATCH>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns 200 with success payload and updated shift', async () => {
		const assignment: AssignmentRow = {
			id: 'assignment-1',
			userId: 'driver-1'
		};
		const shift: ShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsReturned: 2,
			parcelsDelivered: 8,
			completedAt: new Date('2026-02-09T09:00:00.000Z'),
			editableUntil: new Date('2099-01-01T00:00:00.000Z')
		};
		const updatedShift: UpdatedShiftRow = {
			id: 'shift-1',
			parcelsStart: 10,
			parcelsReturned: 3,
			parcelsDelivered: 7,
			startedAt: new Date('2026-02-09T07:00:00.000Z'),
			completedAt: new Date('2026-02-09T09:00:00.000Z'),
			editableUntil: new Date('2099-01-01T00:00:00.000Z')
		};

		selectWhereMock.mockResolvedValueOnce([assignment]).mockResolvedValueOnce([shift]);
		updateReturningMock.mockResolvedValueOnce([updatedShift]);

		const event = createRequestEvent({
			method: 'PATCH',
			params: { assignmentId: 'assignment-1' },
			locals: { user: createUser('driver', 'driver-1') },
			body: { parcelsReturned: 3 }
		});

		const response = await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			shift: {
				id: 'shift-1',
				parcelsStart: 10,
				parcelsDelivered: 7,
				parcelsReturned: 3,
				startedAt: '2026-02-09T07:00:00.000Z',
				completedAt: '2026-02-09T09:00:00.000Z',
				editableUntil: '2099-01-01T00:00:00.000Z'
			}
		});
		expect(createAuditLogMock).toHaveBeenCalledTimes(1);
		expect(updateDriverMetricsMock).toHaveBeenCalledWith('driver-1');
	});
});
