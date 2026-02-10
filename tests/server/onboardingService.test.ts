import { describe, expect, it, vi } from 'vitest';

import {
	createOnboardingApproval,
	createOnboardingInvite,
	finalizeProductionSignupAuthorizationReservation,
	releaseProductionSignupAuthorizationReservation,
	revokeOnboardingEntry,
	reserveProductionSignupAuthorization,
	type SignupOnboardingEntryRecord
} from '$lib/server/services/onboarding';

type ServiceDbClient = NonNullable<Parameters<typeof reserveProductionSignupAuthorization>[1]>;

type SelectResult = SignupOnboardingEntryRecord[];
type UpdateResult = SignupOnboardingEntryRecord[] | Error;
type InsertResult = SignupOnboardingEntryRecord[] | Error;

function createEntry(overrides: Partial<SignupOnboardingEntryRecord>): SignupOnboardingEntryRecord {
	const now = new Date('2026-02-09T00:00:00.000Z');

	return {
		id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
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

function createDbClientMock(
	selectResults: SelectResult[],
	updateResults: UpdateResult[],
	insertResults: InsertResult[] = []
) {
	const queuedSelectResults = [...selectResults];
	const queuedUpdateResults = [...updateResults];
	const queuedInsertResults = [...insertResults];

	const nextSelect = () => queuedSelectResults.shift() ?? [];
	const nextUpdate = () => queuedUpdateResults.shift() ?? [];
	const nextInsert = () => queuedInsertResults.shift() ?? [];

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

	const updateReturningMock = vi.fn(async () => {
		const result = nextUpdate();
		if (result instanceof Error) {
			throw result;
		}

		return result;
	});
	const updateWhereMock = vi.fn(() => ({ returning: updateReturningMock }));
	const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
	const updateMock = vi.fn(() => ({ set: updateSetMock }));

	const insertReturningMock = vi.fn(async () => {
		const result = nextInsert();
		if (result instanceof Error) {
			throw result;
		}

		return result;
	});
	const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }));
	const insertMock = vi.fn(() => ({ values: insertValuesMock }));

	return {
		dbClient: {
			select: selectMock,
			update: updateMock,
			insert: insertMock
		} as unknown as ServiceDbClient,
		mocks: {
			updateReturningMock,
			insertReturningMock
		}
	};
}

describe('onboarding service reservation flow', () => {
	it('reserves approval authorization and finalizes it after signup success', async () => {
		const pendingApproval = createEntry({
			id: '11111111-1111-4111-8111-111111111111',
			email: 'approved@driver.test',
			kind: 'approval'
		});
		const reservedApproval = createEntry({
			...pendingApproval,
			status: 'reserved'
		});
		const consumedApproval = createEntry({
			...pendingApproval,
			status: 'consumed',
			consumedAt: new Date('2026-02-10T00:00:00.000Z'),
			consumedByUserId: 'driver-1'
		});

		const { dbClient } = createDbClientMock(
			[[], [pendingApproval]],
			[[reservedApproval], [consumedApproval]]
		);

		const reservation = await reserveProductionSignupAuthorization(
			{
				email: 'approved@driver.test',
				inviteCodeHeader: null,
				now: new Date('2026-02-10T00:00:00.000Z')
			},
			dbClient
		);

		expect(reservation).toMatchObject({
			allowed: true,
			reservationId: pendingApproval.id,
			matchedEntryId: pendingApproval.id,
			matchedKind: 'approval'
		});

		const finalized = await finalizeProductionSignupAuthorizationReservation(
			{
				reservationId: pendingApproval.id,
				userId: 'driver-1',
				now: new Date('2026-02-10T00:00:00.000Z')
			},
			dbClient
		);

		expect(finalized?.status).toBe('consumed');
		expect(finalized?.consumedByUserId).toBe('driver-1');
	});

	it('does not authorize signup from invite codes without an approval entry', async () => {
		const { dbClient } = createDbClientMock([[], []], []);

		const reservation = await reserveProductionSignupAuthorization(
			{
				email: 'invite-only@driver.test',
				inviteCodeHeader: 'legacy-invite-code',
				now: new Date('2026-02-10T00:00:00.000Z')
			},
			dbClient
		);

		expect(reservation).toEqual({ allowed: false });
	});

	it('allows only one reservation winner under contention', async () => {
		const pendingApproval = createEntry({
			id: '22222222-2222-4222-8222-222222222222',
			email: 'race@driver.test',
			kind: 'approval'
		});
		const reservedApproval = createEntry({
			...pendingApproval,
			status: 'reserved'
		});

		const { dbClient } = createDbClientMock(
			[[pendingApproval], [pendingApproval]],
			[[], [reservedApproval], [], []]
		);

		const winner = await reserveProductionSignupAuthorization(
			{
				email: 'race@driver.test',
				inviteCodeHeader: null,
				now: new Date('2026-02-10T00:00:00.000Z')
			},
			dbClient
		);

		const loser = await reserveProductionSignupAuthorization(
			{
				email: 'race@driver.test',
				inviteCodeHeader: null,
				now: new Date('2026-02-10T00:00:01.000Z')
			},
			dbClient
		);

		expect(winner.allowed).toBe(true);
		expect(loser.allowed).toBe(false);
	});

	it('releases stale reservations before reserving a pending entry', async () => {
		const staleReservedApproval = createEntry({
			id: '99999999-9999-4999-8999-999999999999',
			email: 'stale@driver.test',
			kind: 'approval',
			status: 'reserved',
			updatedAt: new Date('2026-02-09T00:00:00.000Z')
		});
		const pendingApproval = createEntry({
			id: '33333333-3333-4333-8333-333333333333',
			email: 'stale@driver.test',
			kind: 'approval'
		});
		const reservedApproval = createEntry({
			...pendingApproval,
			status: 'reserved'
		});

		const { dbClient, mocks } = createDbClientMock(
			[[staleReservedApproval], [pendingApproval]],
			[[pendingApproval], [reservedApproval]]
		);

		const reservation = await reserveProductionSignupAuthorization(
			{
				email: 'stale@driver.test',
				inviteCodeHeader: null,
				now: new Date('2026-02-10T00:00:00.000Z')
			},
			dbClient
		);

		expect(reservation.allowed).toBe(true);
		expect(mocks.updateReturningMock).toHaveBeenCalledTimes(2);
	});

	it('revokes stale reservation when releasing would violate pending uniqueness', async () => {
		const staleReservedApproval = createEntry({
			id: '12121212-1212-4212-8212-121212121212',
			email: 'collision@driver.test',
			kind: 'approval',
			status: 'reserved'
		});
		const pendingApproval = createEntry({
			id: '34343434-3434-4434-8434-343434343434',
			email: 'collision@driver.test',
			kind: 'approval',
			status: 'pending'
		});
		const revokedStaleApproval = createEntry({
			...staleReservedApproval,
			status: 'revoked',
			revokedAt: new Date('2026-02-10T00:00:00.000Z')
		});
		const reservedApproval = createEntry({
			...pendingApproval,
			status: 'reserved'
		});
		const uniqueCollision = Object.assign(new Error('pending duplicate'), {
			code: '23505',
			constraint: 'uq_signup_onboarding_pending_email_kind'
		});

		const { dbClient, mocks } = createDbClientMock(
			[[staleReservedApproval], [pendingApproval]],
			[uniqueCollision, [revokedStaleApproval], [reservedApproval]]
		);

		const reservation = await reserveProductionSignupAuthorization(
			{
				email: 'collision@driver.test',
				inviteCodeHeader: null,
				now: new Date('2026-02-10T00:00:00.000Z')
			},
			dbClient
		);

		expect(reservation).toMatchObject({
			allowed: true,
			reservationId: pendingApproval.id,
			matchedKind: 'approval'
		});
		expect(mocks.updateReturningMock).toHaveBeenCalledTimes(3);
	});

	it('releases reservation back to pending when signup fails before user creation', async () => {
		const releasedReservation = createEntry({
			id: '44444444-4444-4444-8444-444444444444',
			status: 'pending'
		});

		const { dbClient } = createDbClientMock([], [[releasedReservation]]);

		const released = await releaseProductionSignupAuthorizationReservation(
			{
				reservationId: releasedReservation.id,
				now: new Date('2026-02-10T00:00:00.000Z')
			},
			dbClient
		);

		expect(released?.status).toBe('pending');
	});
});

describe('onboarding service duplicate race handling', () => {
	it('returns alreadyExists when a non-stale reserved approval already exists', async () => {
		const reservedApproval = createEntry({
			id: '78787878-7878-4787-8787-787878787878',
			email: 'reserved@driver.test',
			kind: 'approval',
			status: 'reserved'
		});

		const { dbClient } = createDbClientMock([[], [reservedApproval]], [[]]);

		const result = await createOnboardingApproval(
			{
				email: 'reserved@driver.test',
				createdBy: 'manager-1'
			},
			dbClient
		);

		expect(result.alreadyExists).toBe(true);
		expect(result.entry.status).toBe('reserved');
	});

	it('returns alreadyExists when pending approval insert hits expected unique constraint', async () => {
		const pendingApproval = createEntry({
			id: '55555555-5555-4555-8555-555555555555',
			email: 'duplicate@driver.test',
			kind: 'approval'
		});
		const uniqueError = Object.assign(new Error('duplicate key value'), {
			code: '23505',
			constraint: 'uq_signup_onboarding_pending_email_kind'
		});

		const { dbClient } = createDbClientMock([[], [pendingApproval]], [[]], [uniqueError]);

		const result = await createOnboardingApproval(
			{
				email: 'duplicate@driver.test',
				createdBy: 'manager-1'
			},
			dbClient
		);

		expect(result.alreadyExists).toBe(true);
		expect(result.entry.id).toBe(pendingApproval.id);
	});

	it('downgrades unique violation only when error message matches pending email kind index', async () => {
		const pendingInvite = createEntry({
			id: '66666666-6666-4666-8666-666666666666',
			email: 'invite-duplicate@driver.test',
			kind: 'invite'
		});
		const uniqueError = Object.assign(
			new Error('duplicate key uq_signup_onboarding_pending_email_kind'),
			{
				code: '23505'
			}
		);

		const { dbClient } = createDbClientMock([[], [pendingInvite]], [[]], [uniqueError]);

		const result = await createOnboardingInvite(
			{
				email: 'invite-duplicate@driver.test',
				createdBy: 'manager-1',
				expiresAt: new Date('2026-02-20T00:00:00.000Z')
			},
			dbClient
		);

		expect(result.alreadyExists).toBe(true);
		expect(result.entry.id).toBe(pendingInvite.id);
	});

	it('rethrows unrelated unique violations instead of masking as alreadyExists', async () => {
		const unrelatedError = Object.assign(new Error('duplicate other constraint'), {
			code: '23505',
			constraint: 'uq_signup_onboarding_token_hash'
		});

		const { dbClient } = createDbClientMock([[]], [[]], [unrelatedError]);

		await expect(
			createOnboardingInvite(
				{
					email: 'other@driver.test',
					createdBy: 'manager-1',
					expiresAt: new Date('2026-02-20T00:00:00.000Z')
				},
				dbClient
			)
		).rejects.toBe(unrelatedError);
	});
});

describe('onboarding revocation behavior', () => {
	it('allows managers to revoke reserved entries for manual recovery', async () => {
		const reservedApproval = createEntry({
			id: '56565656-5656-4656-8656-565656565656',
			status: 'reserved'
		});
		const revokedApproval = createEntry({
			...reservedApproval,
			status: 'revoked',
			revokedAt: new Date('2026-02-10T00:00:00.000Z'),
			revokedByUserId: 'manager-1'
		});

		const { dbClient } = createDbClientMock([], [[revokedApproval]]);

		const revoked = await revokeOnboardingEntry(reservedApproval.id, 'manager-1', dbClient);

		expect(revoked?.status).toBe('revoked');
		expect(revoked?.revokedByUserId).toBe('manager-1');
	});
});
