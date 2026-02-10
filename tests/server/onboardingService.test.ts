import { describe, expect, it, vi } from 'vitest';

import {
	consumeProductionSignupAuthorization,
	resolveProductionSignupAuthorization,
	type SignupOnboardingEntryRecord
} from '$lib/server/services/onboarding';

type ServiceDbClient = NonNullable<Parameters<typeof resolveProductionSignupAuthorization>[1]>;

type SelectResult = SignupOnboardingEntryRecord[];
type UpdateResult = SignupOnboardingEntryRecord[];

function createEntry(overrides: Partial<SignupOnboardingEntryRecord>): SignupOnboardingEntryRecord {
	const now = new Date('2026-02-09T00:00:00.000Z');

	return {
		id: overrides.id ?? 'entry-1',
		email: overrides.email ?? 'driver@example.com',
		kind: overrides.kind ?? 'approval',
		tokenHash: overrides.tokenHash ?? null,
		status: overrides.status ?? 'pending',
		createdBy: overrides.createdBy ?? 'manager-1',
		createdAt: overrides.createdAt ?? now,
		expiresAt: overrides.expiresAt ?? null,
		consumedAt: overrides.consumedAt ?? null,
		consumedByUserId: overrides.consumedByUserId ?? null,
		revokedAt: overrides.revokedAt ?? null,
		revokedByUserId: overrides.revokedByUserId ?? null,
		updatedAt: overrides.updatedAt ?? now
	};
}

function createDbClientMock(selectResults: SelectResult[], updateResults: UpdateResult[]) {
	const queuedSelectResults = [...selectResults];
	const queuedUpdateResults = [...updateResults];

	const nextSelect = () => queuedSelectResults.shift() ?? [];
	const nextUpdate = () => queuedUpdateResults.shift() ?? [];

	const makeOrderByResult = () => {
		const result = nextSelect();
		const promise = Promise.resolve(result);

		return {
			limit: vi.fn(async () => result),
			then: promise.then.bind(promise),
			catch: promise.catch.bind(promise),
			finally: promise.finally.bind(promise)
		};
	};

	const selectOrderByMock = vi.fn(() => makeOrderByResult());
	const selectWhereMock = vi.fn(() => ({ orderBy: selectOrderByMock }));
	const selectFromMock = vi.fn(() => ({
		where: selectWhereMock,
		orderBy: selectOrderByMock
	}));
	const selectMock = vi.fn(() => ({ from: selectFromMock }));

	const updateReturningMock = vi.fn(async () => nextUpdate());
	const updateWhereMock = vi.fn(() => ({ returning: updateReturningMock }));
	const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
	const updateMock = vi.fn(() => ({ set: updateSetMock }));

	const insertReturningMock = vi.fn(async () => [] as SignupOnboardingEntryRecord[]);
	const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }));
	const insertMock = vi.fn(() => ({ values: insertValuesMock }));

	return {
		dbClient: {
			select: selectMock,
			update: updateMock,
			insert: insertMock
		} as unknown as ServiceDbClient
	};
}

describe('manager onboarding signup policy', () => {
	it('approve then signup success', async () => {
		const approval = createEntry({
			id: 'approval-1',
			email: 'approved@driver.test',
			kind: 'approval'
		});
		const consumedApproval = createEntry({
			...approval,
			status: 'consumed',
			consumedAt: new Date('2026-02-10T00:00:00.000Z'),
			consumedByUserId: 'driver-1'
		});

		const { dbClient } = createDbClientMock([[approval], [approval]], [[consumedApproval]]);

		const authorization = await resolveProductionSignupAuthorization(
			{
				email: 'approved@driver.test',
				inviteCodeHeader: null,
				now: new Date('2026-02-10T00:00:00.000Z')
			},
			dbClient
		);

		expect(authorization).toMatchObject({
			allowed: true,
			matchedEntryId: 'approval-1',
			matchedKind: 'approval'
		});

		const consumed = await consumeProductionSignupAuthorization(
			{
				email: 'approved@driver.test',
				userId: 'driver-1',
				inviteCodeHeader: null,
				now: new Date('2026-02-10T00:00:00.000Z')
			},
			dbClient
		);

		expect(consumed?.status).toBe('consumed');
		expect(consumed?.consumedByUserId).toBe('driver-1');
	});

	it('revoked or expired invite rejection', async () => {
		const expiredInvite = createEntry({
			id: 'invite-1',
			email: 'driver@invite.test',
			kind: 'invite',
			tokenHash: 'invite-hash',
			expiresAt: new Date('2026-02-01T00:00:00.000Z')
		});

		const { dbClient } = createDbClientMock([[expiredInvite]], []);
		const result = await resolveProductionSignupAuthorization(
			{
				email: 'driver@invite.test',
				inviteCodeHeader: 'invite-code',
				now: new Date('2026-02-10T00:00:00.000Z')
			},
			dbClient
		);

		expect(result.allowed).toBe(false);
	});

	it('one-time consume behavior', async () => {
		const pendingInvite = createEntry({
			id: 'invite-2',
			email: 'one-time@driver.test',
			kind: 'invite',
			tokenHash: 'one-time-hash',
			expiresAt: new Date('2026-02-20T00:00:00.000Z')
		});
		const consumedInvite = createEntry({
			...pendingInvite,
			status: 'consumed',
			consumedAt: new Date('2026-02-10T00:00:00.000Z'),
			consumedByUserId: 'driver-2'
		});

		const { dbClient } = createDbClientMock(
			[[pendingInvite], [pendingInvite], []],
			[[consumedInvite], []]
		);

		const firstConsume = await consumeProductionSignupAuthorization(
			{
				email: 'one-time@driver.test',
				userId: 'driver-2',
				inviteCodeHeader: 'one-time-token',
				now: new Date('2026-02-10T00:00:00.000Z')
			},
			dbClient
		);

		const secondConsume = await consumeProductionSignupAuthorization(
			{
				email: 'one-time@driver.test',
				userId: 'driver-3',
				inviteCodeHeader: 'one-time-token',
				now: new Date('2026-02-10T00:00:00.000Z')
			},
			dbClient
		);

		expect(firstConsume?.status).toBe('consumed');
		expect(secondConsume).toBeNull();
	});

	it('concurrent signup race on same invite/email', async () => {
		const pendingInvite = createEntry({
			id: 'invite-3',
			email: 'race@driver.test',
			kind: 'invite',
			tokenHash: 'race-hash',
			expiresAt: new Date('2026-02-20T00:00:00.000Z')
		});
		const consumedInvite = createEntry({
			...pendingInvite,
			status: 'consumed',
			consumedAt: new Date('2026-02-10T00:00:00.000Z'),
			consumedByUserId: 'driver-race-1'
		});

		const { dbClient } = createDbClientMock(
			[[pendingInvite], [pendingInvite], []],
			[[consumedInvite], []]
		);

		const [consumeA, consumeB] = await Promise.all([
			consumeProductionSignupAuthorization(
				{
					email: 'race@driver.test',
					userId: 'driver-race-1',
					inviteCodeHeader: 'race-token',
					now: new Date('2026-02-10T00:00:00.000Z')
				},
				dbClient
			),
			consumeProductionSignupAuthorization(
				{
					email: 'race@driver.test',
					userId: 'driver-race-2',
					inviteCodeHeader: 'race-token',
					now: new Date('2026-02-10T00:00:00.000Z')
				},
				dbClient
			)
		]);

		const successfulConsumes = [consumeA, consumeB].filter((entry) => entry !== null);
		expect(successfulConsumes).toHaveLength(1);
		expect(consumeA === null || consumeB === null).toBe(true);
	});
});
