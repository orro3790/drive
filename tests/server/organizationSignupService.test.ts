import { describe, expect, it, vi } from 'vitest';

import {
	cleanupStaleSignupOrganizations,
	finalizeOrganizationCreateSignup,
	finalizeOrganizationJoinSignup,
	prepareOrganizationCreateSignup,
	releaseStaleJoinSignupReservations,
	reserveOrganizationJoinSignup
} from '$lib/server/services/organizationSignup';

type ReserveDbClient = NonNullable<Parameters<typeof reserveOrganizationJoinSignup>[1]>;
type FinalizeJoinDbClient = NonNullable<Parameters<typeof finalizeOrganizationJoinSignup>[1]>;
type PrepareCreateDbClient = NonNullable<Parameters<typeof prepareOrganizationCreateSignup>[1]>;
type FinalizeCreateDbClient = NonNullable<Parameters<typeof finalizeOrganizationCreateSignup>[1]>;
type ReleaseStaleDbClient = NonNullable<Parameters<typeof releaseStaleJoinSignupReservations>[1]>;
type CleanupStaleDbClient = NonNullable<Parameters<typeof cleanupStaleSignupOrganizations>[1]>;

type SelectResult = Record<string, unknown>[];
type UpdateResult = Record<string, unknown>[] | Error;

function createReserveDbClientMock(selectResults: SelectResult[], updateResults: UpdateResult[]) {
	const queuedSelectResults = [...selectResults];
	const queuedUpdateResults = [...updateResults];

	const nextSelect = () => queuedSelectResults.shift() ?? [];
	const nextUpdate = () => queuedUpdateResults.shift() ?? [];

	const makeSelectChain = (result: SelectResult) => {
		const promise = Promise.resolve(result);
		const chain = {
			limit: vi.fn(async () => result),
			orderBy: vi.fn(() => chain),
			then: promise.then.bind(promise),
			catch: promise.catch.bind(promise),
			finally: promise.finally.bind(promise)
		};

		return chain;
	};

	const selectWhereMock = vi.fn(() => makeSelectChain(nextSelect()));
	const selectFromMock = vi.fn(() => ({
		where: selectWhereMock,
		orderBy: vi.fn(() => makeSelectChain(nextSelect())),
		limit: vi.fn(async () => nextSelect())
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

	return {
		dbClient: {
			select: selectMock,
			update: updateMock
		} as unknown as ReserveDbClient,
		mocks: {
			updateReturningMock
		}
	};
}

describe('organization signup service', () => {
	it('returns invalid_org_code when organization code does not resolve', async () => {
		const { dbClient, mocks } = createReserveDbClientMock([[]], []);

		const result = await reserveOrganizationJoinSignup(
			{
				email: 'driver@example.test',
				organizationCode: 'MISSING-CODE'
			},
			dbClient
		);

		expect(result).toEqual({
			allowed: false,
			reason: 'invalid_org_code'
		});
		expect(mocks.updateReturningMock).not.toHaveBeenCalled();
	});

	it('releases stale reservations before reserving a pending org approval', async () => {
		const { dbClient, mocks } = createReserveDbClientMock(
			[[{ id: 'org-1' }], [{ id: 'stale-1' }], [{ id: 'pending-1', targetRole: 'driver' }]],
			[[{ id: 'stale-1' }], [{ id: 'pending-1', organizationId: 'org-1', targetRole: 'driver' }]]
		);

		const result = await reserveOrganizationJoinSignup(
			{
				email: 'driver@example.test',
				organizationCode: 'ORG-CODE-123',
				now: new Date('2026-02-12T00:00:00.000Z')
			},
			dbClient
		);

		expect(result).toEqual({
			allowed: true,
			reservationId: 'pending-1',
			organizationId: 'org-1',
			targetRole: 'driver'
		});
		expect(mocks.updateReturningMock).toHaveBeenCalledTimes(2);
	});

	it('revokes stale reservation when pending uniqueness would be violated', async () => {
		const uniqueCollision = Object.assign(new Error('pending duplicate'), {
			code: '23505',
			constraint: 'uq_signup_onboarding_pending_org_email_kind_role'
		});

		const { dbClient, mocks } = createReserveDbClientMock(
			[[{ id: 'org-1' }], [{ id: 'stale-1' }], [{ id: 'pending-2', targetRole: 'manager' }]],
			[
				uniqueCollision,
				[{ id: 'stale-1' }],
				[{ id: 'pending-2', organizationId: 'org-1', targetRole: 'manager' }]
			]
		);

		const result = await reserveOrganizationJoinSignup(
			{
				email: 'manager@example.test',
				organizationCode: 'ORG-CODE-789',
				now: new Date('2026-02-12T00:00:00.000Z')
			},
			dbClient
		);

		expect(result).toEqual({
			allowed: true,
			reservationId: 'pending-2',
			organizationId: 'org-1',
			targetRole: 'manager'
		});
		expect(mocks.updateReturningMock).toHaveBeenCalledTimes(3);
	});

	it('returns null for invalid reservation ids before opening a transaction', async () => {
		const transaction = vi.fn();
		const dbClient = { transaction } as unknown as FinalizeJoinDbClient;

		const result = await finalizeOrganizationJoinSignup(
			{
				reservationId: 'not-a-uuid',
				userId: 'driver-1'
			},
			dbClient
		);

		expect(result).toBeNull();
		expect(transaction).not.toHaveBeenCalled();
	});

	it('treats consumed reservations as idempotent when consumed by the same user', async () => {
		const tx = {
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						limit: vi.fn(async () => [
							{
								id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
								organizationId: 'org-1',
								targetRole: 'driver',
								status: 'consumed',
								consumedByUserId: 'driver-1',
								expiresAt: null
							}
						])
					}))
				}))
			}))
		};

		const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx));
		const dbClient = { transaction } as unknown as FinalizeJoinDbClient;

		const result = await finalizeOrganizationJoinSignup(
			{
				reservationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
				userId: 'driver-1'
			},
			dbClient
		);

		expect(result).toEqual({
			reservationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
			organizationId: 'org-1',
			targetRole: 'driver'
		});
	});

	it('returns null when reservation state races to a different consumer', async () => {
		const tx = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(async () => [
								{
									id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
									organizationId: 'org-1',
									targetRole: 'driver',
									status: 'reserved',
									consumedByUserId: null,
									expiresAt: null
								}
							])
						}))
					}))
				})
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(async () => [
								{
									id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
									organizationId: 'org-1',
									targetRole: 'driver',
									status: 'consumed',
									consumedByUserId: 'driver-2'
								}
							])
						}))
					}))
				}),
			update: vi.fn(() => ({
				set: vi.fn(() => ({
					where: vi.fn(() => ({
						returning: vi.fn(async () => [])
					}))
				}))
			}))
		};

		const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx));
		const dbClient = { transaction } as unknown as FinalizeJoinDbClient;

		const result = await finalizeOrganizationJoinSignup(
			{
				reservationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
				userId: 'driver-1'
			},
			dbClient
		);

		expect(result).toBeNull();
	});

	it('retries organization provisioning when unique collisions occur', async () => {
		const uniqueSlugError = Object.assign(new Error('slug already exists'), {
			code: '23505',
			constraint: 'uq_organizations_slug'
		});

		const transaction = vi.fn().mockRejectedValueOnce(uniqueSlugError).mockResolvedValueOnce({
			organizationId: 'org-2',
			organizationSlug: 'acme-logistics-a1',
			organizationJoinCode: 'A1B2C3D4E5F6'
		});
		const dbClient = { transaction } as unknown as PrepareCreateDbClient;

		const result = await prepareOrganizationCreateSignup(
			{
				organizationName: 'Acme Logistics'
			},
			dbClient
		);

		expect(result).toEqual({
			organizationId: 'org-2',
			organizationSlug: 'acme-logistics-a1',
			organizationJoinCode: 'A1B2C3D4E5F6'
		});
		expect(transaction).toHaveBeenCalledTimes(2);
	});

	it('throws conflict after exhausting organization provisioning retries', async () => {
		const uniqueJoinCodeError = Object.assign(new Error('join code collision'), {
			code: '23505',
			constraint: 'uq_organizations_join_code_hash'
		});

		const transaction = vi.fn(async () => {
			throw uniqueJoinCodeError;
		});
		const dbClient = { transaction } as unknown as PrepareCreateDbClient;

		await expect(
			prepareOrganizationCreateSignup(
				{
					organizationName: 'Acme Logistics'
				},
				dbClient
			)
		).rejects.toThrow('organization_create_conflict');
		expect(transaction).toHaveBeenCalledTimes(6);
	});

	it('returns null when finalizing ownership with invalid organization id', async () => {
		const transaction = vi.fn();
		const dbClient = { transaction } as unknown as FinalizeCreateDbClient;

		const result = await finalizeOrganizationCreateSignup(
			{
				userId: 'owner-1',
				organizationId: 'not-a-uuid'
			},
			dbClient
		);

		expect(result).toBeNull();
		expect(transaction).not.toHaveBeenCalled();
	});

	it('returns existing ownership when already finalized for the same user', async () => {
		const organizationId = '11111111-1111-4111-8111-111111111111';

		const tx = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(async () => [{ organizationId }])
						}))
					}))
				})
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(async () => [{ id: organizationId, ownerUserId: 'owner-1' }])
						}))
					}))
				})
		};

		const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx));
		const dbClient = { transaction } as unknown as FinalizeCreateDbClient;

		const result = await finalizeOrganizationCreateSignup(
			{
				userId: 'owner-1',
				organizationId
			},
			dbClient
		);

		expect(result).toEqual({
			organizationId,
			ownerUserId: 'owner-1'
		});
	});

	it('claims organization ownership when organization is unowned', async () => {
		const organizationId = '22222222-2222-4222-8222-222222222222';

		const tx = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(async () => [{ organizationId }])
						}))
					}))
				})
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(async () => [{ id: organizationId, ownerUserId: null }])
						}))
					}))
				}),
			update: vi.fn(() => ({
				set: vi.fn(() => ({
					where: vi.fn(() => ({
						returning: vi.fn(async () => [{ id: organizationId, ownerUserId: 'owner-2' }])
					}))
				}))
			}))
		};

		const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx));
		const dbClient = { transaction } as unknown as FinalizeCreateDbClient;

		const result = await finalizeOrganizationCreateSignup(
			{
				userId: 'owner-2',
				organizationId
			},
			dbClient
		);

		expect(result).toEqual({
			organizationId,
			ownerUserId: 'owner-2'
		});
	});

	it('releases and revokes stale join reservations with deterministic counts', async () => {
		const uniqueCollision = Object.assign(new Error('pending duplicate'), {
			code: '23505',
			constraint: 'uq_signup_onboarding_pending_org_email_kind_role'
		});

		const { dbClient } = createReserveDbClientMock(
			[
				[
					{
						id: 'res-1',
						organizationId: 'org-1',
						email: 'driver-one@example.test'
					},
					{
						id: 'res-2',
						organizationId: 'org-2',
						email: 'driver-two@example.test'
					}
				]
			],
			[[{ id: 'res-1' }], uniqueCollision, [{ id: 'res-2' }]]
		);

		const result = await releaseStaleJoinSignupReservations(
			{
				now: new Date('2026-02-13T00:00:00.000Z')
			},
			dbClient as ReleaseStaleDbClient
		);

		expect(result).toEqual({
			staleCount: 2,
			releasedToPending: 1,
			revoked: 1
		});
	});

	it('cleans up stale unowned organizations only when deletion guard passes', async () => {
		const selectMock = vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					orderBy: vi.fn(() => ({
						limit: vi.fn(async () => [{ id: 'org-cleanup-1' }, { id: 'org-cleanup-2' }])
					}))
				}))
			}))
		}));

		const deleteReturningMock = vi
			.fn()
			.mockResolvedValueOnce([{ id: 'org-cleanup-1' }])
			.mockResolvedValueOnce([]);
		const deleteMock = vi.fn(() => ({
			where: vi.fn(() => ({
				returning: deleteReturningMock
			}))
		}));

		const dbClient = {
			select: selectMock,
			delete: deleteMock
		} as unknown as CleanupStaleDbClient;

		const result = await cleanupStaleSignupOrganizations(
			{
				now: new Date('2026-02-13T00:00:00.000Z')
			},
			dbClient
		);

		expect(result).toEqual({
			staleCount: 2,
			deleted: 1,
			skipped: 1
		});
	});
});
