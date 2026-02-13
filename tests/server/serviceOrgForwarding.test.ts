/**
 * Service-layer org parameter forwarding tests.
 *
 * Verifies that organizationId is threaded through to DB queries
 * when provided, ensuring data is scoped to the correct organization.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBoundaryMock } from '../harness/serviceMocks';

type MetricsModule = typeof import('../../src/lib/server/services/metrics');
type FlaggingModule = typeof import('../../src/lib/server/services/flagging');

let updateDriverMetrics: MetricsModule['updateDriverMetrics'];
let checkAndApplyFlag: FlaggingModule['checkAndApplyFlag'];

// Track all where clause conditions to verify org filtering
let whereClauses: unknown[];
let selectWhereMock: ReturnType<typeof vi.fn>;
let insertOnConflictMock: ReturnType<typeof vi.fn>;
let insertValuesMock: ReturnType<typeof vi.fn>;
let insertMock: ReturnType<typeof vi.fn>;
let updateWhereMock: ReturnType<typeof vi.fn>;
let updateSetMock: ReturnType<typeof vi.fn>;
let updateMock: ReturnType<typeof vi.fn>;

function setupMetricsDb() {
	whereClauses = [];

	selectWhereMock = vi.fn((clause: unknown) => {
		whereClauses.push(clause);
		const result = Promise.resolve([{ count: 5, average: 0.9 }]);
		// Make the promise thenable AND chainable (for .limit())
		return Object.assign(result, {
			limit: vi.fn(() => result)
		});
	});

	const selectChain: Record<string, unknown> = {
		from: vi.fn(() => selectChain),
		innerJoin: vi.fn(() => selectChain),
		where: selectWhereMock,
		limit: vi.fn(() => selectChain)
	};

	insertOnConflictMock = vi.fn(async () => undefined);
	insertValuesMock = vi.fn(() => ({ onConflictDoUpdate: insertOnConflictMock }));
	insertMock = vi.fn(() => ({ values: insertValuesMock }));

	updateWhereMock = vi.fn(async () => undefined);
	updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
	updateMock = vi.fn(() => ({ set: updateSetMock }));

	return {
		db: {
			select: vi.fn(() => selectChain),
			insert: insertMock,
			update: updateMock
		}
	};
}

beforeEach(() => {
	vi.resetModules();
});

afterEach(() => {
	vi.doUnmock('$lib/server/db');
	vi.doUnmock('$lib/server/db/schema');
	vi.doUnmock('drizzle-orm');
	vi.doUnmock('$lib/server/logger');
	vi.doUnmock('$lib/server/services/metrics');
	vi.doUnmock('$lib/server/services/notifications');
	vi.doUnmock('$lib/server/services/audit');
	vi.doUnmock('$lib/server/realtime/managerSse');
	vi.doUnmock('$lib/server/services/dispatchSettings');
	vi.doUnmock('$lib/config/dispatchPolicy');
	vi.doUnmock('date-fns');
	vi.clearAllMocks();
});

describe('updateDriverMetrics org forwarding', () => {
	beforeEach(async () => {
		const dbMock = setupMetricsDb();

		vi.doMock('$lib/server/db', () => dbMock);
		vi.doMock('$lib/server/db/schema', () => ({
			assignments: {
				userId: 'assignments.userId',
				warehouseId: 'assignments.warehouseId',
				id: 'assignments.id'
			},
			driverMetrics: { userId: 'driver_metrics.userId' },
			routeCompletions: {
				userId: 'route_completions.userId',
				routeId: 'route_completions.routeId',
				lastCompletedAt: 'route_completions.lastCompletedAt',
				completionCount: 'route_completions.completionCount'
			},
			routes: { id: 'routes.id', warehouseId: 'routes.warehouseId' },
			shifts: {
				assignmentId: 'shifts.assignmentId',
				completedAt: 'shifts.completedAt',
				parcelsStart: 'shifts.parcelsStart',
				parcelsReturned: 'shifts.parcelsReturned',
				exceptedReturns: 'shifts.exceptedReturns',
				parcelsDelivered: 'shifts.parcelsDelivered'
			},
			user: { id: 'user.id', organizationId: 'user.organizationId' },
			warehouses: { id: 'warehouses.id', organizationId: 'warehouses.organizationId' }
		}));
		vi.doMock('drizzle-orm', () => ({
			eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
			and: (...conditions: unknown[]) => ({ op: 'and', conditions }),
			isNotNull: (left: unknown) => ({ op: 'isNotNull', left }),
			ne: (left: unknown, right: unknown) => ({ op: 'ne', left, right }),
			sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
				strings: Array.from(strings),
				values
			})
		}));

		({ updateDriverMetrics } = await import('../../src/lib/server/services/metrics'));
	}, 20_000);

	it('uses provided organizationId in warehouse join filter', async () => {
		await updateDriverMetrics('driver-1', 'org-abc');

		// updateDriverMetrics makes multiple queries (total shifts, attendance, delivery rate, route completions)
		// all filtered through warehouses.organizationId
		expect(whereClauses.length).toBeGreaterThanOrEqual(3);

		// Check that all compound where clauses include the org filter
		const compoundClauses = whereClauses.filter((c) => (c as { op: string }).op === 'and') as {
			op: string;
			conditions: unknown[];
		}[];

		for (const clause of compoundClauses) {
			const orgCondition = clause.conditions.find(
				(c) =>
					(c as { op: string; left: string; right: string }).left === 'warehouses.organizationId' &&
					(c as { op: string; left: string; right: string }).right === 'org-abc'
			);
			expect(orgCondition).toBeDefined();
		}
	});

	it('does NOT skip metrics when organizationId is provided', async () => {
		await updateDriverMetrics('driver-1', 'org-abc');

		// Should have queried and inserted/updated metrics
		expect(insertMock).toHaveBeenCalledTimes(1);
	});

	it('skips metrics when no organizationId can be resolved', async () => {
		// When no organizationId is passed, resolveMetricsOrganizationId looks up the user.
		// If that user has organizationId: null, it returns null and the function exits early.
		selectWhereMock.mockImplementationOnce((clause: unknown) => {
			whereClauses.push(clause);
			const result = Promise.resolve([{ organizationId: null }]);
			return Object.assign(result, { limit: vi.fn(() => result) });
		});

		await updateDriverMetrics('driver-1');

		// Should only have made the user lookup query, then returned early
		expect(insertMock).not.toHaveBeenCalled();
	});
});

describe('checkAndApplyFlag org forwarding', () => {
	let sendNotificationMock: ReturnType<typeof createBoundaryMock>;
	let broadcastDriverFlaggedMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const dbMock = setupMetricsDb();

		// Use mockImplementationOnce so the function body still pushes to whereClauses
		selectWhereMock
			.mockImplementationOnce((clause: unknown) => {
				whereClauses.push(clause);
				return Promise.resolve([
					{
						id: 'driver-1',
						role: 'driver',
						organizationId: 'org-abc',
						weeklyCap: 4,
						isFlagged: false,
						flagWarningDate: null
					}
				]);
			})
			.mockImplementationOnce((clause: unknown) => {
				whereClauses.push(clause);
				return Promise.resolve([
					{
						totalShifts: 15,
						attendanceRate: 0.85
					}
				]);
			});

		sendNotificationMock = createBoundaryMock();
		sendNotificationMock.mockResolvedValue({ inAppCreated: true, pushSent: false });

		broadcastDriverFlaggedMock = vi.fn();

		vi.doMock('$lib/server/db', () => dbMock);
		vi.doMock('$lib/server/db/schema', () => ({
			driverMetrics: {
				userId: 'driver_metrics.userId',
				totalShifts: 'driver_metrics.totalShifts',
				attendanceRate: 'driver_metrics.attendanceRate'
			},
			user: {
				id: 'user.id',
				role: 'user.role',
				organizationId: 'user.organizationId',
				weeklyCap: 'user.weeklyCap',
				isFlagged: 'user.isFlagged',
				flagWarningDate: 'user.flagWarningDate',
				updatedAt: 'user.updatedAt'
			}
		}));
		vi.doMock('drizzle-orm', () => ({
			eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
			and: (...conditions: unknown[]) => ({ op: 'and', conditions })
		}));
		vi.doMock('$lib/server/logger', () => ({
			default: {
				child: vi.fn(() => ({
					info: vi.fn(),
					warn: vi.fn(),
					debug: vi.fn(),
					error: vi.fn()
				}))
			}
		}));
		vi.doMock('$lib/server/services/metrics', () => ({
			updateDriverMetrics: vi.fn(async () => undefined)
		}));
		vi.doMock('$lib/server/services/notifications', () => ({
			sendNotification: sendNotificationMock
		}));
		vi.doMock('$lib/server/services/audit', () => ({
			createAuditLog: vi.fn(async () => undefined)
		}));
		vi.doMock('$lib/server/realtime/managerSse', () => ({
			broadcastDriverFlagged: broadcastDriverFlaggedMock
		}));
		vi.doMock('$lib/config/dispatchPolicy', () => ({
			dispatchPolicy: {
				flagging: {
					gracePeriodDays: 7,
					reward: { minShifts: 20, minAttendanceRate: 0.95 },
					weeklyCap: { base: 4, reward: 6, min: 2 }
				}
			},
			getAttendanceThreshold: vi.fn(() => 0.7),
			isRewardEligible: vi.fn(() => false)
		}));
		vi.doMock('$lib/server/services/dispatchSettings', () => ({
			getDriverHealthPolicyThresholds: vi.fn(async () => ({
				rewardMinAttendancePercent: 95,
				rewardMinAttendanceRate: 0.95,
				correctiveCompletionThresholdPercent: 98,
				correctiveCompletionThresholdRate: 0.98
			}))
		}));
		vi.doMock('date-fns', () => ({
			addDays: vi.fn((date: Date, days: number) => new Date(date.getTime() + days * 86400000))
		}));

		({ checkAndApplyFlag } = await import('../../src/lib/server/services/flagging'));
	}, 20_000);

	it('includes organizationId in user lookup where clause', async () => {
		await checkAndApplyFlag('driver-1', 'org-abc');

		// First where clause is the user lookup
		expect(whereClauses.length).toBeGreaterThanOrEqual(1);

		const userWhere = whereClauses[0] as { op: string; conditions: unknown[] };
		expect(userWhere.op).toBe('and');

		const orgCondition = userWhere.conditions.find(
			(c) =>
				(c as { op: string; left: string; right: string }).left === 'user.organizationId' &&
				(c as { op: string; left: string; right: string }).right === 'org-abc'
		);
		expect(orgCondition).toBeDefined();
	});

	it('returns null when user is not found in org', async () => {
		// Override to return no user (org mismatch)
		selectWhereMock.mockReset();
		selectWhereMock.mockImplementationOnce((clause: unknown) => {
			whereClauses.push(clause);
			return Promise.resolve([]);
		});

		const result = await checkAndApplyFlag('driver-1', 'org-wrong');

		expect(result).toBeNull();
	});
});
